import * as vscode from 'vscode';
import { ContextValues, DefaultValues } from '../constants';
import { FileItem } from '../types';

export class UnversionedSectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly unversionedFiles: FileItem[],
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super('Unversioned Files', collapsibleState);
    this.id = DefaultValues.UnversionedSectionId;
    this.contextValue = ContextValues.UnversionedSection;
    this.iconPath = undefined; // Remove prefix icon from unversioned files section
    this.description = `${unversionedFiles.length} files`;

    // Add checkbox support for unversioned files section
    this.updateCheckboxState();
  }

  updateCheckboxState(): void {
    this.checkboxState = this.getUnversionedCheckboxState();
  }

  private getUnversionedCheckboxState(): vscode.TreeItemCheckboxState {
    if (this.unversionedFiles.length === 0) return vscode.TreeItemCheckboxState.Unchecked;

    const selectedFiles = this.unversionedFiles.filter((file) => file.isSelected);
    const totalFiles = this.unversionedFiles.length;

    if (selectedFiles.length === 0) return vscode.TreeItemCheckboxState.Unchecked;
    if (selectedFiles.length === totalFiles) return vscode.TreeItemCheckboxState.Checked;
    // For partial selection, we'll use unchecked since VS Code doesn't have a partial state
    return vscode.TreeItemCheckboxState.Unchecked;
  }
}
