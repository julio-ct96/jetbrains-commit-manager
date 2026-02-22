import * as vscode from 'vscode';
import { CommandIds } from '../constants';
import { FileTreeItem } from '../tree-items';
import { CommandDependencies } from './types';

export function registerSelectionCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.ToggleFileSelection, (fileId: string) => {
      deps.store.toggleFileSelection(fileId);
    }),

    vscode.commands.registerCommand(CommandIds.SelectAllFiles, () => {
      deps.store.selectAllFiles();
    }),

    vscode.commands.registerCommand(CommandIds.DeselectAllFiles, () => {
      deps.store.deselectAllFiles();
    }),

    vscode.commands.registerCommand(CommandIds.ToggleCheckbox, () => {
      const selected = deps.treeView.selection[0];
      if (!(selected instanceof FileTreeItem)) return;
      deps.store.toggleFileSelection(selected.file.id);
    }),
  ];
}
