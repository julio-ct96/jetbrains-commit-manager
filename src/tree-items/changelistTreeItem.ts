import * as vscode from 'vscode';
import { ContextValues } from '../constants';
import { Changelist } from '../types';

export class ChangelistTreeItem extends vscode.TreeItem {
  constructor(
    public readonly changelist: Changelist,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(changelist.name, collapsibleState);
    this.id = `changelist-${changelist.id}`;
    this.tooltip = changelist.description || changelist.name;
    this.description = `${changelist.files.length} files`;
    // Distinguish empty vs non-empty changelists for context menus
    if (changelist.isDefault) {
      this.contextValue = changelist.files.length > 0 ? ContextValues.DefaultChangelistNonEmpty : ContextValues.DefaultChangelist;
    } else {
      this.contextValue = changelist.files.length > 0 ? ContextValues.ChangelistNonEmpty : ContextValues.Changelist;
    }
    this.iconPath = undefined; // Remove prefix icons from changelists

    // Add checkbox support for changelist selection
    this.updateCheckboxState();
  }

  updateCheckboxState(): void {
    this.checkboxState = this.getChangelistCheckboxState();
  }

  private getChangelistCheckboxState(): vscode.TreeItemCheckboxState {
    if (this.changelist.files.length === 0) return vscode.TreeItemCheckboxState.Unchecked;

    const selectedFiles = this.changelist.files.filter((file) => file.isSelected);
    const totalFiles = this.changelist.files.length;

    if (selectedFiles.length === 0) return vscode.TreeItemCheckboxState.Unchecked;
    if (selectedFiles.length === totalFiles) return vscode.TreeItemCheckboxState.Checked;
    // For partial selection, we'll use unchecked since VS Code doesn't have a partial state
    return vscode.TreeItemCheckboxState.Unchecked;
  }
}
