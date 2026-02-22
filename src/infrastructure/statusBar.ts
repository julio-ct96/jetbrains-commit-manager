import * as vscode from 'vscode';
import { CommandIds, ContextKeys, StatusBarText } from '../constants';
import { CommitStore } from '../store';

export class StatusBarManager implements vscode.Disposable {
  private readonly commitMessageInput: vscode.StatusBarItem;
  private readonly commitButton: vscode.StatusBarItem;
  private readonly storeSubscription: vscode.Disposable;

  constructor(
    private readonly store: CommitStore,
    private readonly treeView: vscode.TreeView<vscode.TreeItem>,
  ) {
    this.commitButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.commitButton.command = CommandIds.CommitFromStatusBar;
    this.commitButton.tooltip = 'Commit selected files';
    this.commitButton.show();

    this.commitMessageInput = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    this.commitMessageInput.command = CommandIds.UpdateCommitMessage;
    this.commitMessageInput.tooltip = 'Click to edit commit message';
    this.commitMessageInput.text = StatusBarText.MessagePrefix;
    this.commitMessageInput.show();

    this.storeSubscription = store.onDidChange(() => this.update());
  }

  getMessageText(): string {
    return this.commitMessageInput.text.replace(StatusBarText.MessagePrefix, '');
  }

  setMessageText(text: string): void {
    this.commitMessageInput.text = `${StatusBarText.MessagePrefix}${text}`;
  }

  clearMessage(): void {
    this.commitMessageInput.text = StatusBarText.MessagePrefix;
  }

  private update(): void {
    const selectedFiles = this.store.getSelectedFiles();
    const hasSelectedFiles = selectedFiles.length > 0;

    vscode.commands.executeCommand(CommandIds.SetContext, ContextKeys.HasSelectedFiles, hasSelectedFiles);

    const stagedCount = this.store.getChangelists().reduce((sum, c) => sum + c.files.length, 0);
    this.treeView.badge = stagedCount > 0 ? { value: stagedCount, tooltip: `${stagedCount} staged files` } : undefined;

    if (selectedFiles.length > 0) {
      const totalFiles = this.store.getAllFiles().length;
      this.commitButton.text = `$(check) Commit (${selectedFiles.length}/${totalFiles})`;
      this.commitButton.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    } else {
      this.commitButton.text = '$(check) Commit';
      this.commitButton.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.commitButton.dispose();
    this.commitMessageInput.dispose();
    this.storeSubscription.dispose();
  }
}
