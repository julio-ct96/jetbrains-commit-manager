import * as vscode from 'vscode';
import { DefaultValues } from '../constants';
import { GitService } from '../services';
import { Changelist, FileItem, FileStatus } from '../types';

export class CommitStore {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _onChangelistCreated = new vscode.EventEmitter<string>();
  readonly onChangelistCreated = this._onChangelistCreated.event;

  private _onChangelistAutoExpand = new vscode.EventEmitter<string>();
  readonly onChangelistAutoExpand = this._onChangelistAutoExpand.event;

  private changelists: Changelist[] = [];
  private unversionedFiles: FileItem[] = [];
  private _unversionedFilesExpanded = true;

  private gitService: GitService;

  constructor(gitService: GitService) {
    this.gitService = gitService;
    this.initializeDefaultChangelist();
  }

  // --- Mutations (each fires onDidChange) ---

  async refresh(): Promise<void> {
    await this.loadGitStatus();
    this._onDidChange.fire();
  }

  async createChangelist(name: string): Promise<void> {
    const newChangelist: Changelist = {
      id: this.generateId(),
      name,
      files: [],
      isExpanded: true,
      createdAt: new Date(),
    };

    this.changelists.push(newChangelist);
    this._onDidChange.fire();
    this._onChangelistCreated.fire(newChangelist.id);
  }

  async deleteChangelist(changelistId: string): Promise<void> {
    const changelist = this.changelists.find((c) => c.id === changelistId);
    if (!changelist || changelist.isDefault) return;

    const defaultChangelist = this.changelists.find((c) => c.isDefault);
    if (defaultChangelist && changelist.files.length > 0) {
      defaultChangelist.files.push(...changelist.files);
    }

    this.changelists = this.changelists.filter((c) => c.id !== changelistId);
    this._onDidChange.fire();
  }

  async renameChangelist(changelistId: string, newName: string): Promise<void> {
    const changelist = this.changelists.find((c) => c.id === changelistId);
    if (!changelist) return;

    const existingChangelist = this.changelists.find((c) => c.name === newName && c.id !== changelistId);
    if (existingChangelist) {
      throw new Error(`A changelist with the name "${newName}" already exists`);
    }

    changelist.name = newName;
    this._onDidChange.fire();
  }

  async moveFileToChangelist(fileId: string, targetChangelistId: string): Promise<void> {
    let file: FileItem | undefined;
    let wasUntracked = false;

    for (const changelist of this.changelists) {
      const fileIndex = changelist.files.findIndex((f) => f.id === fileId);
      if (fileIndex !== -1) {
        file = changelist.files[fileIndex];
        changelist.files.splice(fileIndex, 1);
        break;
      }
    }

    if (!file) {
      const fileIndex = this.unversionedFiles.findIndex((f) => f.id === fileId);
      if (fileIndex !== -1) {
        file = this.unversionedFiles[fileIndex];
        this.unversionedFiles.splice(fileIndex, 1);
        wasUntracked = true;
      }
    }

    if (!file) {
      this._onDidChange.fire();
      return;
    }

    const targetChangelist = this.changelists.find((c) => c.id === targetChangelistId);
    if (!targetChangelist) {
      this._onDidChange.fire();
      return;
    }

    if (wasUntracked) {
      try {
        await this.gitService.addFileToGit(file.path);
        file.status = FileStatus.Added;
      } catch (error) {
        console.error('Error adding file to Git:', error);
        this.unversionedFiles.push(file);
        this._onDidChange.fire();
        return;
      }
    }

    file.changelistId = targetChangelistId;
    targetChangelist.files.push(file);
    targetChangelist.isExpanded = true;
    this._onChangelistAutoExpand.fire(targetChangelistId);
    this._onDidChange.fire();
  }

  async moveChangelistFiles(sourceChangelistId: string, targetChangelistId: string): Promise<void> {
    const sourceChangelist = this.changelists.find((c) => c.id === sourceChangelistId);
    const targetChangelist = this.changelists.find((c) => c.id === targetChangelistId);
    if (!sourceChangelist || !targetChangelist) return;

    const filesToMove = [...sourceChangelist.files];
    sourceChangelist.files = [];

    filesToMove.forEach((file) => {
      file.changelistId = targetChangelistId;
    });

    targetChangelist.files.push(...filesToMove);
    targetChangelist.isExpanded = true;

    this._onDidChange.fire();
    this._onChangelistAutoExpand.fire(targetChangelistId);
  }

  toggleFileSelection(fileId: string, isSelected?: boolean): void {
    for (const changelist of this.changelists) {
      const file = changelist.files.find((f) => f.id === fileId);
      if (file) {
        file.isSelected = isSelected !== undefined ? isSelected : !file.isSelected;
        this._onDidChange.fire();
        return;
      }
    }

    const file = this.unversionedFiles.find((f) => f.id === fileId);
    if (file) {
      file.isSelected = isSelected !== undefined ? isSelected : !file.isSelected;
      this._onDidChange.fire();
    }
  }

  toggleChangelistSelection(changelistId: string, isSelected: boolean): void {
    const changelist = this.changelists.find((c) => c.id === changelistId);
    if (!changelist) return;

    changelist.files.forEach((file) => {
      file.isSelected = isSelected;
    });

    this._onDidChange.fire();
  }

  toggleUnversionedSelection(isSelected: boolean): void {
    this.unversionedFiles.forEach((file) => {
      file.isSelected = isSelected;
    });

    this._onDidChange.fire();
  }

  selectAllFiles(): void {
    this.changelists.forEach((changelist) => {
      changelist.files.forEach((file) => {
        file.isSelected = true;
      });
    });

    this.unversionedFiles.forEach((file) => {
      file.isSelected = true;
    });

    this._onDidChange.fire();
  }

  deselectAllFiles(): void {
    this.changelists.forEach((changelist) => {
      changelist.files.forEach((file) => {
        file.isSelected = false;
      });
    });

    this.unversionedFiles.forEach((file) => {
      file.isSelected = false;
    });

    this._onDidChange.fire();
  }

  collapseAll(): void {
    this.changelists.forEach((changelist) => {
      changelist.isExpanded = false;
    });

    this._unversionedFilesExpanded = false;

    this._onDidChange.fire();
  }

  removeCommittedFiles(fileIds: Set<string>): Map<string, FileItem[]> {
    const snapshot = new Map<string, FileItem[]>();
    for (const changelist of this.changelists) {
      const removed = changelist.files.filter((f) => fileIds.has(f.id));
      if (removed.length > 0) snapshot.set(changelist.id, removed);
      changelist.files = changelist.files.filter((f) => !fileIds.has(f.id));
    }
    const removedUnversioned = this.unversionedFiles.filter((f) => fileIds.has(f.id));
    if (removedUnversioned.length > 0) snapshot.set(DefaultValues.UnversionedSnapshotKey, removedUnversioned);
    this.unversionedFiles = this.unversionedFiles.filter((f) => !fileIds.has(f.id));
    this._onDidChange.fire();
    return snapshot;
  }

  restoreFiles(snapshot: Map<string, FileItem[]>): void {
    for (const [key, files] of snapshot) {
      if (key === DefaultValues.UnversionedSnapshotKey) {
        this.unversionedFiles.push(...files);
        continue;
      }
      const changelist = this.changelists.find((c) => c.id === key);
      if (changelist) changelist.files.push(...files);
    }
    this._onDidChange.fire();
  }

  // --- Getters (pure, no fire) ---

  getChangelists(): Changelist[] {
    return this.changelists;
  }

  getSelectedFiles(): FileItem[] {
    const selectedFiles: FileItem[] = [];

    for (const changelist of this.changelists) {
      selectedFiles.push(...changelist.files.filter((f) => f.isSelected));
    }

    selectedFiles.push(...this.unversionedFiles.filter((f) => f.isSelected));

    return selectedFiles;
  }

  getAllFiles(): FileItem[] {
    const allFiles: FileItem[] = [];

    for (const changelist of this.changelists) {
      allFiles.push(...changelist.files);
    }

    allFiles.push(...this.unversionedFiles);

    return allFiles;
  }

  getUnversionedFiles(): FileItem[] {
    return this.unversionedFiles;
  }

  isUnversionedExpanded(): boolean {
    return this._unversionedFilesExpanded;
  }

  setUnversionedExpanded(expanded: boolean): void {
    this._unversionedFilesExpanded = expanded;
  }

  setChangelistExpanded(changelistId: string, expanded: boolean): void {
    const changelist = this.changelists.find((c) => c.id === changelistId);
    if (changelist) changelist.isExpanded = expanded;
  }

  // --- Private ---

  private initializeDefaultChangelist(): void {
    const defaultChangelist: Changelist = {
      id: DefaultValues.DefaultChangelistId,
      name: DefaultValues.DefaultChangelistName,
      description: DefaultValues.DefaultChangelistDescription,
      files: [],
      isDefault: true,
      isExpanded: false,
      createdAt: new Date(),
    };
    this.changelists = [defaultChangelist];
  }

  private async loadGitStatus(): Promise<void> {
    try {
      const gitFiles = await this.gitService.getStatus();
      const unversionedFiles = await this.gitService.getUnversionedFiles();

      const selectionMap = new Map<string, boolean>();
      const changelistAssignmentMap = new Map<string, string>();

      for (const changelist of this.changelists) {
        for (const file of changelist.files) {
          selectionMap.set(file.id, file.isSelected);
          changelistAssignmentMap.set(file.id, changelist.id);
        }
      }

      for (const file of this.unversionedFiles) {
        selectionMap.set(file.id, file.isSelected);
      }

      for (const changelist of this.changelists) {
        changelist.files = [];
      }

      gitFiles.forEach((file) => {
        if (selectionMap.has(file.id)) {
          file.isSelected = selectionMap.get(file.id)!;
        }

        if (file.status !== FileStatus.Untracked) {
          const assignedChangelistId = changelistAssignmentMap.get(file.id);

          if (assignedChangelistId) {
            const targetChangelist = this.changelists.find((c) => c.id === assignedChangelistId);
            if (targetChangelist) {
              file.changelistId = targetChangelist.id;
              targetChangelist.files.push(file);
            }
          } else {
            const defaultChangelist = this.changelists.find((c) => c.isDefault);
            if (defaultChangelist) {
              file.changelistId = defaultChangelist.id;
              defaultChangelist.files.push(file);
            }
          }
        }
      });

      this.unversionedFiles = unversionedFiles.map((file) => {
        if (selectionMap.has(file.id)) {
          file.isSelected = selectionMap.get(file.id)!;
        }
        return file;
      });
    } catch (error) {
      console.error('Error loading Git status:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
