import * as vscode from 'vscode';
import { CommandIds, ConfigKeys, ContextKeys, ContextValues, StatusBarText, ViewIds } from './constants';
import { CommandDependencies, registerAllCommands } from './commands';
import { GitService } from './services';
import { CommitStore } from './store';
import { NativeTreeProvider } from './nativeTreeProvider';
import { ChangelistTreeItem, FileTreeItem } from './tree-items';
import { FileStatus } from './types';

let commitStatusBarItem: vscode.StatusBarItem;
let commitMessageInput: vscode.StatusBarItem;

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

  // Reactive subscription: store changes → update status bar + context keys
  store.onDidChange(() => {
    const selectedFiles = store.getSelectedFiles();
    const hasSelectedFiles = selectedFiles.length > 0;
    vscode.commands.executeCommand(CommandIds.SetContext, ContextKeys.HasSelectedFiles, hasSelectedFiles);

    const stagedCount = store.getChangelists().reduce((sum, c) => sum + c.files.length, 0);
    treeView.badge = stagedCount > 0 ? { value: stagedCount, tooltip: `${stagedCount} staged files` } : undefined;

    const totalFiles = store.getAllFiles().length;
    if (selectedFiles.length > 0) {
      commitStatusBarItem.text = `$(check) Commit (${selectedFiles.length}/${totalFiles})`;
      commitStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    } else {
      commitStatusBarItem.text = '$(check) Commit';
      commitStatusBarItem.backgroundColor = undefined;
    }
  });

  // Track collapse/expand state via store API
  treeView.onDidCollapseElement((e) => {
    if (e.element instanceof ChangelistTreeItem) {
      store.setChangelistExpanded(e.element.changelist.id, false);
    } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      store.setUnversionedExpanded(false);
    }
  });

  treeView.onDidExpandElement((e) => {
    if (e.element instanceof ChangelistTreeItem) {
      store.setChangelistExpanded(e.element.changelist.id, true);
    } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      store.setUnversionedExpanded(true);
    }
  });

  // Preview file on selection change
  treeView.onDidChangeSelection((e) => {
    const selected = e.selection[0];
    if (selected instanceof FileTreeItem) {
      previewFileTreeItem(selected);
    }
  });

  // Handle checkbox state changes
  treeView.onDidChangeCheckboxState((e) => {
    treeProvider.onDidChangeCheckboxState(e);
  });

  // Auto-expand on changelist creation
  store.onChangelistCreated(async (changelistId: string) => {
    try {
      setTimeout(async () => {
        const changelistItem = treeProvider.getChangelistTreeItemById(changelistId);
        if (changelistItem && changelistItem.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
          await treeView.reveal(changelistItem, { expand: true, select: false, focus: false });
        }
      }, 200);
    } catch (error) {
      // Silently handle errors
    }
  });

  // Auto-expand on file move/drop
  store.onChangelistAutoExpand(async (changelistId: string) => {
    try {
      setTimeout(async () => {
        const changelistItem = treeProvider.getChangelistTreeItemById(changelistId);
        if (changelistItem && changelistItem.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
          await treeView.reveal(changelistItem, { expand: true, select: false, focus: false });
        }
      }, 200);
    } catch (error) {
      // Silently handle errors
    }
  });

  // Create status bar items
  commitStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  commitStatusBarItem.command = CommandIds.CommitFromStatusBar;
  commitStatusBarItem.tooltip = 'Commit selected files';
  commitStatusBarItem.show();

  commitMessageInput = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  commitMessageInput.command = CommandIds.UpdateCommitMessage;
  commitMessageInput.tooltip = 'Click to edit commit message';
  commitMessageInput.text = StatusBarText.MessagePrefix;
  commitMessageInput.show();

  // File system watcher with auto-stage
  let skipNextWatcherRefresh = false;

  const handleFileSystemEvent = async (uri?: vscode.Uri) => {
    if (skipNextWatcherRefresh) {
      skipNextWatcherRefresh = false;
      return;
    }

    if (uri) {
      const config = vscode.workspace.getConfiguration(ConfigKeys.Namespace);
      const autoStageEnabled = config.get<boolean>(ConfigKeys.AutoStageFiles, true);

      if (autoStageEnabled) {
        const relativePath = vscode.workspace.asRelativePath(uri);
        if (!shouldSkipAutoStage(relativePath)) {
          const isTracked = await gitService.isFileTracked(relativePath);
          if (isTracked) {
            try {
              await gitService.stageFile(relativePath);
            } catch (error) {
              console.error(`Failed to auto-stage file ${relativePath}:`, error);
            }
          }
        }
      }
    }

    store.refresh();
  };

  const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  fileSystemWatcher.onDidChange((uri) => handleFileSystemEvent(uri));
  fileSystemWatcher.onDidCreate((uri) => handleFileSystemEvent(uri));
  fileSystemWatcher.onDidDelete(() => handleFileSystemEvent());

  // Build command dependencies
  const deps: CommandDependencies = {
    store,
    gitService,
    treeView,
    statusBar: { commitMessageInput },
    fileWatcher: {
      skipNextRefresh() {
        skipNextWatcherRefresh = true;
      },
    },
  };

  const commands = registerAllCommands(deps);

  context.subscriptions.push(...commands, treeView, fileSystemWatcher);

  store.refresh();
}

export function deactivate() {
  if (commitStatusBarItem) {
    commitStatusBarItem.dispose();
  }
  if (commitMessageInput) {
    commitMessageInput.dispose();
  }
}

function shouldSkipAutoStage(filePath: string): boolean {
  const skipPatterns = [
    /\.tmp$/,
    /\.temp$/,
    /\.swp$/,
    /\.swo$/,
    /~$/,
    /\.log$/,
    /\.out$/,
    /\.exe$/,
    /\.dll$/,
    /\.so$/,
    /\.dylib$/,
    /\.o$/,
    /\.obj$/,
    /\.class$/,
    /\.vscode\//,
    /\.idea\//,
    /\.vs\//,
    /\.DS_Store$/,
    /Thumbs\.db$/,
    /node_modules\//,
    /npm-debug\.log$/,
    /yarn-error\.log$/,
    /\.git\//,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.env$/,
    /\.env\.local$/,
    /\.env\.development$/,
    /\.env\.production$/,
  ];

  return skipPatterns.some((pattern) => pattern.test(filePath));
}

async function previewFileTreeItem(fileItem: FileTreeItem): Promise<void> {
  const uri = fileItem.resourceUri;
  if (!uri) return;
  const isNew = fileItem.file.status === FileStatus.Untracked || fileItem.file.status === FileStatus.Added;
  const command = isNew ? CommandIds.OpenFile : CommandIds.OpenDiff;
  await vscode.commands.executeCommand(command, uri);
}
