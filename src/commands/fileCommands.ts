import * as vscode from 'vscode';
import { CommandIds, DefaultValues } from '../constants';

export function registerFileCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.Open, () => {
      vscode.commands.executeCommand(CommandIds.ChangelistsFocus);
    }),

    vscode.commands.registerCommand(CommandIds.OpenDiff, async (uri: vscode.Uri) => {
      try {
        const left = vscode.Uri.from({
          scheme: 'git',
          path: uri.fsPath,
          query: JSON.stringify({ path: uri.fsPath, ref: 'HEAD' }),
        });

        const right = uri;
        const fileName = uri.fsPath.split('/').pop() || DefaultValues.FallbackFileName;
        const title = `${fileName} (HEAD ↔︎ Working Tree)`;

        await vscode.commands.executeCommand(CommandIds.VscodeDiff, left, right, title, { preserveFocus: true });
      } catch (error) {
        await vscode.commands.executeCommand(CommandIds.VscodeOpen, uri, { preserveFocus: true });
      }
    }),

    vscode.commands.registerCommand(CommandIds.OpenFile, async (arg?: any) => {
      try {
        let targetUri: vscode.Uri | undefined;
        if (arg && arg.resourceUri) {
          targetUri = arg.resourceUri as vscode.Uri;
        } else if (arg instanceof vscode.Uri) {
          targetUri = arg;
        }
        if (!targetUri) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            targetUri = editor.document.uri;
          }
        }
        if (targetUri) {
          await vscode.commands.executeCommand(CommandIds.VscodeOpen, targetUri, { preserveFocus: true });
        } else {
          vscode.window.showInformationMessage('No file to open.');
        }
      } catch (e) {
        // ignore
      }
    }),
  ];
}
