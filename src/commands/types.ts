import * as vscode from 'vscode';
import { GitService } from '../services';
import { CommitStore } from '../store';

export interface CommandDependencies {
  store: CommitStore;
  gitService: GitService;
  treeView: vscode.TreeView<vscode.TreeItem>;
  statusBar: { commitMessageInput: vscode.StatusBarItem };
  fileWatcher: { skipNextRefresh(): void };
}
