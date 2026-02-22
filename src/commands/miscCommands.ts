import * as vscode from 'vscode';
import { CommandIds, ConfigKeys, StatusBarText } from '../constants';
import { CommandDependencies } from './types';

export function registerMiscCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.Refresh, () => {
      deps.store.refresh();
    }),

    vscode.commands.registerCommand(CommandIds.CollapseAll, () => {
      deps.store.collapseAll();
    }),

    vscode.commands.registerCommand(CommandIds.UpdateCommitMessage, async () => {
      const message = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'Describe your changes...',
        value: deps.statusBar.commitMessageInput.text.replace(StatusBarText.MessagePrefix, ''),
      });

      if (message !== undefined) {
        deps.statusBar.commitMessageInput.text = `${StatusBarText.MessagePrefix}${message}`;
      }
    }),

    vscode.commands.registerCommand(CommandIds.ToggleAutoStage, async () => {
      const config = vscode.workspace.getConfiguration(ConfigKeys.Namespace);
      const currentValue = config.get<boolean>(ConfigKeys.AutoStageFiles, true);
      const newValue = !currentValue;

      await config.update(ConfigKeys.AutoStageFiles, newValue, vscode.ConfigurationTarget.Workspace);

      const status = newValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Auto-stage files ${status}`);
    }),

    vscode.commands.registerCommand(CommandIds.Test, () => {
      vscode.window.showInformationMessage('JetBrains Commit Manager extension is working!');
    }),
  ];
}
