import * as vscode from 'vscode';
import { CommandIds } from '../constants';
import { executeWithOptimisticUI } from '../utils';
import { CommandDependencies } from './types';

interface CommitFlowOptions {
  fromStatusBar?: boolean;
}

async function executeCommitFlow(deps: CommandDependencies, options: CommitFlowOptions = {}): Promise<void> {
  const selectedFiles = deps.store.getSelectedFiles();
  if (selectedFiles.length === 0)
    return void vscode.window.showWarningMessage('No files selected for commit. Please select files first.');

  const defaultValue = options.fromStatusBar ? deps.statusBar.getMessageText() : undefined;

  const message = await vscode.window.showInputBox({
    prompt: 'Enter commit message',
    placeHolder: 'Describe your changes...',
    value: defaultValue,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) return 'Commit message cannot be empty';
      return null;
    },
  });
  if (!message) return;

  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Commit', amend: false, push: false },
      { label: 'Amend Commit', amend: true, push: false },
      { label: 'Commit and Push', amend: false, push: true },
      { label: 'Amend Commit and Push', amend: true, push: true },
    ],
    { placeHolder: 'Choose commit action' },
  );
  if (!choice) return;

  if (options.fromStatusBar) {
    deps.statusBar.clearMessage();
  }

  const committedIds = new Set(selectedFiles.map((f) => f.id));
  const success = await executeWithOptimisticUI({
    store: deps.store,
    fileIds: committedIds,
    fileWatcher: deps.fileWatcher,
    operation: () => deps.gitService.commitFiles(selectedFiles, message.trim(), { amend: choice.amend }),
    onSuccess: () => vscode.window.showInformationMessage(`Successfully committed ${selectedFiles.length} file(s)`),
    onFailure: () => vscode.window.showErrorMessage('Failed to commit files. Check the output panel for details.'),
  });

  if (success && choice.push) {
    const pushed = await deps.gitService.pushCurrentBranch();
    if (pushed) {
      vscode.window.showInformationMessage('Pushed to remote successfully');
    }
  }
}

export function registerCommitCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.CommitSelectedFiles, () => executeCommitFlow(deps)),
    vscode.commands.registerCommand(CommandIds.CommitFromStatusBar, () =>
      executeCommitFlow(deps, { fromStatusBar: true }),
    ),
  ];
}
