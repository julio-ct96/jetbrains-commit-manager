import * as vscode from 'vscode';
import { CommandIds } from '../constants';

export function registerNavigationCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.NavigateDown, async () => {
      await vscode.commands.executeCommand(CommandIds.ListFocusDown);
      await vscode.commands.executeCommand(CommandIds.ListSelect);
    }),

    vscode.commands.registerCommand(CommandIds.NavigateUp, async () => {
      await vscode.commands.executeCommand(CommandIds.ListFocusUp);
      await vscode.commands.executeCommand(CommandIds.ListSelect);
    }),
  ];
}
