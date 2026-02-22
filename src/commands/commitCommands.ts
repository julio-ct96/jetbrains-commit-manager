import * as vscode from 'vscode';
import { CommandIds, StatusBarText } from '../constants';
import { CommandDependencies } from './types';

interface CommitFlowOptions {
  fromStatusBar?: boolean;
}

async function executeCommitFlow(deps: CommandDependencies, options: CommitFlowOptions = {}): Promise<void> {
  const selectedFiles = deps.store.getSelectedFiles();

  if (selectedFiles.length === 0) {
    vscode.window.showWarningMessage('No files selected for commit. Please select files first.');
    return;
  }

  const defaultValue = options.fromStatusBar
    ? deps.statusBar.commitMessageInput.text.replace(StatusBarText.MessagePrefix, '')
    : undefined;

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

  const committedIds = new Set(selectedFiles.map((f) => f.id));
  deps.fileWatcher.skipNextRefresh();
  const snapshot = deps.store.removeCommittedFiles(committedIds);

  if (options.fromStatusBar) {
    deps.statusBar.commitMessageInput.text = StatusBarText.MessagePrefix;
  }

  const success = await deps.gitService.commitFiles(selectedFiles, message.trim(), { amend: choice.amend });

  if (success) {
    vscode.window.showInformationMessage(`Successfully committed ${selectedFiles.length} file(s)`);
    if (choice.push) {
      const pushed = await deps.gitService.pushCurrentBranch();
      if (pushed) {
        vscode.window.showInformationMessage('Pushed to remote successfully');
      }
    }
  } else {
    deps.store.restoreFiles(snapshot);
    vscode.window.showErrorMessage('Failed to commit files. Check the output panel for details.');
  }
}

export function registerCommitCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.CommitSelectedFiles, () => executeCommitFlow(deps)),
    vscode.commands.registerCommand(CommandIds.CommitFromStatusBar, () => executeCommitFlow(deps, { fromStatusBar: true })),
  ];
}
