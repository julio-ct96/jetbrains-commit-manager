import * as vscode from 'vscode';
import { CommandIds } from '../constants';
import { FileItem } from '../types';
import { executeWithOptimisticUI } from '../utils';
import { CommandDependencies } from './types';

function resolveFileToRevert(arg: any, deps: CommandDependencies): FileItem | undefined {
  const allFiles = deps.store.getAllFiles();

  if (typeof arg === 'string') return allFiles.find((f) => f.id === arg);

  if (arg && arg.file) return arg.file as FileItem;

  if (arg && arg.resourceUri) {
    const fsPath: string = arg.resourceUri.fsPath as string;
    return allFiles.find((f) => fsPath.endsWith(f.path));
  }

  return undefined;
}

export function registerRevertCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.RevertSelectedFiles, async () => {
      const selectedFiles = deps.store.getSelectedFiles();
      if (selectedFiles.length === 0)
        return void vscode.window.showWarningMessage('No files selected for revert. Please select files first.');

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to revert ${selectedFiles.length} file(s)? This will discard all uncommitted changes.`,
        { modal: true },
        'Revert',
      );
      if (confirm !== 'Revert') return;

      await executeWithOptimisticUI({
        store: deps.store,
        fileIds: new Set(selectedFiles.map((f) => f.id)),
        fileWatcher: deps.fileWatcher,
        operation: () => deps.gitService.revertFiles(selectedFiles),
        onSuccess: () => vscode.window.showInformationMessage(`Successfully reverted ${selectedFiles.length} file(s)`),
        onFailure: () => vscode.window.showErrorMessage('Failed to revert files. Check the output panel for details.'),
      });
    }),

    vscode.commands.registerCommand(CommandIds.RevertFile, async (arg?: any) => {
      const fileToRevert = resolveFileToRevert(arg, deps);
      if (!fileToRevert) return void vscode.window.showWarningMessage('No file selected to revert.');

      const confirm = await vscode.window.showWarningMessage(
        `Revert changes in ${fileToRevert.name}? This discards uncommitted changes.`,
        { modal: true },
        'Revert',
      );
      if (confirm !== 'Revert') return;

      await executeWithOptimisticUI({
        store: deps.store,
        fileIds: new Set([fileToRevert.id]),
        fileWatcher: deps.fileWatcher,
        operation: () => deps.gitService.revertFiles([fileToRevert]),
        onSuccess: () => vscode.window.showInformationMessage(`Reverted ${fileToRevert.name}`),
        onFailure: () => vscode.window.showErrorMessage(`Failed to revert ${fileToRevert.name}`),
      });
    }),

    vscode.commands.registerCommand(CommandIds.RevertChangelist, async (changelistItem?: any) => {
      if (!changelistItem || !changelistItem.changelist) return;

      const changelistId: string = changelistItem.changelist.id;
      const changelistName: string = changelistItem.changelist.name;
      const files = deps.store.getChangelists().find((c) => c.id === changelistId)?.files || [];
      if (files.length === 0)
        return void vscode.window.showInformationMessage('No files to revert in this changelist.');

      const confirm = await vscode.window.showWarningMessage(
        `Revert all ${files.length} file(s) in "${changelistName}"? This discards uncommitted changes.`,
        { modal: true },
        'Revert',
      );
      if (confirm !== 'Revert') return;

      await executeWithOptimisticUI({
        store: deps.store,
        fileIds: new Set(files.map((f) => f.id)),
        fileWatcher: deps.fileWatcher,
        operation: () => deps.gitService.revertFiles(files),
        onSuccess: () =>
          vscode.window.showInformationMessage(`Reverted ${files.length} file(s) in "${changelistName}"`),
        onFailure: () => vscode.window.showErrorMessage(`Failed to revert files in "${changelistName}"`),
      });
    }),
  ];
}
