import * as path from 'path';
import * as vscode from 'vscode';
import { CommandIds, ContextValues } from '../constants';
import { FileItem, FileStatus } from '../types';

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly file: FileItem,
    public readonly workspaceRoot: string,
    public readonly changelistId?: string,
  ) {
    super(file.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = file.path;
    this.description = file.path; // Show relative project path instead of status
    this.contextValue = ContextValues.File;
    this.iconPath = undefined; // Remove prefix icons

    // Resolve the file path relative to workspace root
    const fullPath = path.join(workspaceRoot, file.path);
    this.resourceUri = vscode.Uri.file(fullPath);

    // Add checkbox behavior - use checkboxState for native checkboxes
    this.checkboxState = file.isSelected
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    // Untracked/added files have no HEAD version, so open directly; others open diff
    const isNewFile = file.status === FileStatus.Untracked || file.status === FileStatus.Added;
    const openFileCommand: vscode.Command = {
      command: CommandIds.OpenFile,
      title: 'Open File',
      arguments: [this.resourceUri],
    };
    const openDiffCommand: vscode.Command = {
      command: CommandIds.OpenDiff,
      title: 'Open Diff',
      arguments: [this.resourceUri],
    };

    this.command = isNewFile ? openFileCommand : openDiffCommand;
  }
}
