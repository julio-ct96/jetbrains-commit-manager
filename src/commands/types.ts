import * as vscode from 'vscode';
import { GitService } from '../services';
import { CommitStore } from '../store';

export interface CommandDependencies {
  store: CommitStore;
  gitService: GitService;
  treeView: vscode.TreeView<vscode.TreeItem>;
  statusBar: { getMessageText(): string; setMessageText(text: string): void; clearMessage(): void };
  fileWatcher: { skipNextRefresh(): void };
}
