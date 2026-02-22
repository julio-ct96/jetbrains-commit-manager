import * as vscode from 'vscode';
import { DefaultValues, DragDropMimeTypes } from './constants';
import { GitService } from './services';
import { CommitStore } from './store';
import { ChangelistTreeItem, FileTreeItem, UnversionedSectionTreeItem } from './tree-items';
import { Changelist, FileItem } from './types';

export class NativeTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  readonly dropMimeTypes = [
    DragDropMimeTypes.TreeItem,
    DragDropMimeTypes.Changelist,
  ];
  readonly dragMimeTypes = [
    DragDropMimeTypes.TreeItem,
    DragDropMimeTypes.Changelist,
  ];

  private store: CommitStore;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    const gitService = new GitService(workspaceRoot);
    this.store = new CommitStore(gitService);

    this.store.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  // --- Event forwarding from store ---

  get onChangelistCreated(): vscode.Event<string> {
    return this.store.onChangelistCreated;
  }

  get onChangelistAutoExpand(): vscode.Event<string> {
    return this.store.onChangelistAutoExpand;
  }

  // --- TreeDataProvider ---

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
    if (element instanceof ChangelistTreeItem || element instanceof UnversionedSectionTreeItem) return null;

    if (element instanceof FileTreeItem && element.changelistId) {
      const changelist = this.store.getChangelists().find((c) => c.id === element.changelistId);
      if (changelist) return new ChangelistTreeItem(changelist, vscode.TreeItemCollapsibleState.Expanded);
    }

    if (element instanceof FileTreeItem && !element.changelistId) {
      return new UnversionedSectionTreeItem(this.store.getUnversionedFiles(), vscode.TreeItemCollapsibleState.Expanded);
    }

    return null;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      const items: vscode.TreeItem[] = [];

      this.store.getChangelists().forEach((changelist) => {
        items.push(new ChangelistTreeItem(changelist, this.getCollapsibleState(changelist)));
      });

      const unversionedFiles = this.store.getUnversionedFiles();
      if (unversionedFiles.length > 0) {
        const collapsibleState = this.store.isUnversionedExpanded()
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
        items.push(new UnversionedSectionTreeItem(unversionedFiles, collapsibleState));
      }

      return items;
    }

    if (element instanceof ChangelistTreeItem) {
      return element.changelist.files.map((file) => new FileTreeItem(file, this.workspaceRoot, element.changelist.id));
    }

    if (element instanceof UnversionedSectionTreeItem) {
      return this.store.getUnversionedFiles().map((file) => new FileTreeItem(file, this.workspaceRoot));
    }

    return [];
  }

  // --- Checkbox handling ---

  async onDidChangeCheckboxState(event: vscode.TreeCheckboxChangeEvent<vscode.TreeItem>): Promise<void> {
    for (const [item, checkboxState] of event.items) {
      if (item instanceof FileTreeItem) {
        const isChecked = checkboxState === vscode.TreeItemCheckboxState.Checked;
        this.store.toggleFileSelection(item.file.id, isChecked);
      } else if (item instanceof ChangelistTreeItem) {
        const isChecked = checkboxState === vscode.TreeItemCheckboxState.Checked;
        this.store.toggleChangelistSelection(item.changelist.id, isChecked);
      } else if (item instanceof UnversionedSectionTreeItem) {
        const isChecked = checkboxState === vscode.TreeItemCheckboxState.Checked;
        this.store.toggleUnversionedSelection(isChecked);
      }
    }
  }

  // --- Drag and drop ---

  async handleDrag(
    source: readonly vscode.TreeItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const fileIds: string[] = [];
    const changelistIds: string[] = [];

    for (const item of source) {
      if (item instanceof FileTreeItem) {
        fileIds.push(item.file.id);
      } else if (item instanceof ChangelistTreeItem) {
        changelistIds.push(item.changelist.id);
      }
    }

    if (fileIds.length > 0) {
      dataTransfer.set(DragDropMimeTypes.TreeItem, new vscode.DataTransferItem(fileIds));
    }

    if (changelistIds.length > 0) {
      dataTransfer.set(
        DragDropMimeTypes.Changelist,
        new vscode.DataTransferItem(changelistIds),
      );
    }
  }

  async handleDrop(
    target: vscode.TreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (!target) return;

    let targetChangelistId: string;

    if (target instanceof ChangelistTreeItem) {
      targetChangelistId = target.changelist.id;
    } else if (target instanceof FileTreeItem) {
      targetChangelistId = target.changelistId || DefaultValues.DefaultChangelistId;
    } else {
      return;
    }

    const fileTransferItem = dataTransfer.get(DragDropMimeTypes.TreeItem);
    if (fileTransferItem) {
      try {
        const fileIds = fileTransferItem.value as string[];
        if (Array.isArray(fileIds)) {
          for (const fileId of fileIds) {
            await this.store.moveFileToChangelist(fileId, targetChangelistId);
          }
        }
      } catch (error) {
        console.error('Error handling file drop:', error);
      }
    }

    const changelistTransferItem = dataTransfer.get(DragDropMimeTypes.Changelist);
    if (changelistTransferItem) {
      try {
        const changelistIds = changelistTransferItem.value as string[];
        if (Array.isArray(changelistIds)) {
          for (const sourceChangelistId of changelistIds) {
            if (sourceChangelistId !== targetChangelistId) {
              await this.store.moveChangelistFiles(sourceChangelistId, targetChangelistId);
            }
          }
        }
      } catch (error) {
        console.error('Error handling changelist drop:', error);
      }
    }
  }

  // --- Presentation helpers ---

  private getCollapsibleState(changelist: Changelist): vscode.TreeItemCollapsibleState {
    if (changelist.files.length === 0) return vscode.TreeItemCollapsibleState.None;
    if (changelist.isExpanded === false) return vscode.TreeItemCollapsibleState.Collapsed;
    return vscode.TreeItemCollapsibleState.Expanded;
  }

  getChangelistTreeItems(): ChangelistTreeItem[] {
    return this.store.getChangelists().map(
      (changelist) => new ChangelistTreeItem(changelist, this.getCollapsibleState(changelist)),
    );
  }

  getChangelistTreeItemById(changelistId: string): ChangelistTreeItem | undefined {
    const changelist = this.store.getChangelists().find((c) => c.id === changelistId);
    if (!changelist) return undefined;
    return new ChangelistTreeItem(changelist, this.getCollapsibleState(changelist));
  }

  updateTree(): void {
    this._onDidChangeTreeData.fire();
  }

  updateTreeItem(item: vscode.TreeItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  // --- Facade methods (maintain API for extension.ts) ---

  async refresh(): Promise<void> {
    await this.store.refresh();
  }

  async createChangelist(name: string): Promise<void> {
    await this.store.createChangelist(name);
  }

  async deleteChangelist(changelistId: string): Promise<void> {
    await this.store.deleteChangelist(changelistId);
  }

  async renameChangelist(changelistId: string, newName: string): Promise<void> {
    await this.store.renameChangelist(changelistId, newName);
  }

  async moveFileToChangelist(fileId: string, targetChangelistId: string): Promise<void> {
    await this.store.moveFileToChangelist(fileId, targetChangelistId);
  }

  async moveChangelistFiles(sourceChangelistId: string, targetChangelistId: string): Promise<void> {
    await this.store.moveChangelistFiles(sourceChangelistId, targetChangelistId);
  }

  toggleFileSelection(fileId: string, isSelected?: boolean): void {
    this.store.toggleFileSelection(fileId, isSelected);
  }

  toggleChangelistSelection(changelistId: string, isSelected: boolean): void {
    this.store.toggleChangelistSelection(changelistId, isSelected);
  }

  toggleUnversionedSelection(isSelected: boolean): void {
    this.store.toggleUnversionedSelection(isSelected);
  }

  selectAllFiles(): void {
    this.store.selectAllFiles();
  }

  deselectAllFiles(): void {
    this.store.deselectAllFiles();
  }

  collapseAll(): void {
    this.store.collapseAll();
  }

  removeCommittedFiles(fileIds: Set<string>): Map<string, FileItem[]> {
    return this.store.removeCommittedFiles(fileIds);
  }

  restoreFiles(snapshot: Map<string, FileItem[]>): void {
    this.store.restoreFiles(snapshot);
  }

  getChangelists(): Changelist[] {
    return this.store.getChangelists();
  }

  getSelectedFiles(): FileItem[] {
    return this.store.getSelectedFiles();
  }

  getAllFiles(): FileItem[] {
    return this.store.getAllFiles();
  }

  getUnversionedFiles(): FileItem[] {
    return this.store.getUnversionedFiles();
  }
}
