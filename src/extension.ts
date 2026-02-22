import * as vscode from 'vscode';
import { CommandDependencies, registerAllCommands } from './commands';
import { ContextValues, ViewIds } from './constants';
import { createFileWatcher, previewFileTreeItem, StatusBarManager } from './infrastructure';
import { NativeTreeProvider } from './nativeTreeProvider';
import { GitService } from './services';
import { CommitStore } from './store';
import { ChangelistTreeItem, FileTreeItem } from './tree-items';

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return vscode.window.showWarningMessage(
      'No workspace folder found. Please open a folder to use the commit manager.',
    );
  }

  const gitService = new GitService(workspaceRoot);
  const store = new CommitStore(gitService);
  const treeProvider = new NativeTreeProvider(store, workspaceRoot);

  const treeView = vscode.window.createTreeView(ViewIds.Changelists, {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: true,
    dragAndDropController: treeProvider,
  });

  // Track collapse/expand state via store API
  const collapseSubscription = treeView.onDidCollapseElement((e) => {
    if (e.element instanceof ChangelistTreeItem) {
      store.setChangelistExpanded(e.element.changelist.id, false);
    } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      store.setUnversionedExpanded(false);
    }
  });

  const expandSubscription = treeView.onDidExpandElement((e) => {
    if (e.element instanceof ChangelistTreeItem) {
      store.setChangelistExpanded(e.element.changelist.id, true);
    } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      store.setUnversionedExpanded(true);
    }
  });

  // Preview file on selection change
  const selectionSubscription = treeView.onDidChangeSelection((e) => {
    const selected = e.selection[0];
    if (selected instanceof FileTreeItem) {
      previewFileTreeItem(selected);
    }
  });

  // Handle checkbox state changes
  const checkboxSubscription = treeView.onDidChangeCheckboxState((e) => {
    treeProvider.onDidChangeCheckboxState(e);
  });

  const revealChangelist = (changelistId: string) => {
    const tryReveal = () => {
      const item = treeProvider.getChangelistTreeItemById(changelistId);
      if (!item || item.collapsibleState === vscode.TreeItemCollapsibleState.None) return;
      return treeView.reveal(item, { expand: true, select: false, focus: false });
    };

    const result = tryReveal();
    result?.then(undefined, () => {
      const retry = treeProvider.onDidChangeTreeData(() => {
        retry.dispose();
        tryReveal()?.then(undefined, () => {});
      });
    });
  };

  const createdSubscription = store.onChangelistCreated(revealChangelist);
  const autoExpandSubscription = store.onChangelistAutoExpand(revealChangelist);

  // Create infrastructure
  const statusBar = new StatusBarManager(store, treeView);
  const fileWatcher = createFileWatcher({ store, gitService });

  // Build command dependencies
  const deps: CommandDependencies = {
    store,
    gitService,
    treeView,
    statusBar,
    fileWatcher,
  };

  const commands = registerAllCommands(deps);

  context.subscriptions.push(
    ...commands,
    treeView,
    statusBar,
    fileWatcher,
    collapseSubscription,
    expandSubscription,
    selectionSubscription,
    checkboxSubscription,
    createdSubscription,
    autoExpandSubscription,
  );

  store.refresh();
}

export function deactivate() {
  // Disposables are cleaned up automatically via context.subscriptions
}
