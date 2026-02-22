import * as vscode from 'vscode';
import { CommandIds, StatusBarText } from '../constants';
import { CommandDependencies } from './types';

interface StashFlowOptions {
  fromStatusBar?: boolean;
}

function getDefaultStashMessage(deps: CommandDependencies): string {
  const selectedFiles = deps.store.getSelectedFiles();
  const changelists = deps.store.getChangelists();

  const selectedChangelistIds = new Set(selectedFiles.map((f) => f.changelistId).filter((id) => id));
  if (selectedChangelistIds.size !== 1) return '';

  const changelistId = Array.from(selectedChangelistIds)[0];
  const changelist = changelists.find((c) => c.id === changelistId);
  if (!changelist || changelist.isDefault) return '';

  return changelist.name;
}

async function executeStashFlow(deps: CommandDependencies, options: StashFlowOptions = {}): Promise<void> {
  const selectedFiles = deps.store.getSelectedFiles();

  if (selectedFiles.length === 0) {
    vscode.window.showWarningMessage('No files selected for stash. Please select files first.');
    return;
  }

  const defaultMessage = getDefaultStashMessage(deps);

  const defaultValue = options.fromStatusBar
    ? defaultMessage || deps.statusBar.commitMessageInput.text.replace(StatusBarText.MessagePrefix, '')
    : defaultMessage;

  const message = await vscode.window.showInputBox({
    prompt: 'Enter stash message',
    placeHolder: defaultMessage || 'Describe your changes...',
    value: defaultValue,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) return 'Stash message cannot be empty';
      return null;
    },
  });
  if (!message) return;

  const success = await deps.gitService.stashFiles(selectedFiles, message.trim());

  if (success) {
    vscode.window.showInformationMessage(`Successfully stashed ${selectedFiles.length} file(s)`);
    deps.store.refresh();
    if (options.fromStatusBar) {
      deps.statusBar.commitMessageInput.text = StatusBarText.MessagePrefix;
    }
  } else {
    vscode.window.showErrorMessage('Failed to stash files. Check the output panel for details.');
  }
}

export function registerStashCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.StashSelectedFiles, () => executeStashFlow(deps)),
    vscode.commands.registerCommand(CommandIds.StashFromStatusBar, () => executeStashFlow(deps, { fromStatusBar: true })),
  ];
}
