import * as vscode from 'vscode';
import { CommandIds, ConfigKeys, ContextKeys, ContextValues, StatusBarText, ViewIds } from './constants';
import {
  CommandDependencies,
  registerCommitCommands,
  registerStashCommands,
  registerRevertCommands,
  registerChangelistCommands,
  registerSelectionCommands,
  registerNavigationCommands,
  registerFileCommands,
  registerMiscCommands,
} from './commands';
import { GitService } from './services';
import { CommitStore } from './store';
import { NativeTreeProvider } from './nativeTreeProvider';
import { ChangelistTreeItem, FileTreeItem } from './tree-items';
import { FileStatus } from './types';

let treeProvider: NativeTreeProvider;
let treeView: vscode.TreeView<vscode.TreeItem>;
let gitService: GitService;
let commitStatusBarItem: vscode.StatusBarItem;
let commitMessageInput: vscode.StatusBarItem;
let isExpanded: boolean = false; // Track expand/collapse state
let skipNextWatcherRefresh = false;

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('No workspace folder found. Please open a folder to use the commit manager.');
  }

  if (workspaceRoot) {
    gitService = new GitService(workspaceRoot);
    const commitStore = new CommitStore(gitService);
    treeProvider = new NativeTreeProvider(commitStore, workspaceRoot);

    // Create the tree view
    treeView = vscode.window.createTreeView(ViewIds.Changelists, {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: treeProvider,
    });

    // Listen for tree data changes to update UI
    treeProvider.onDidChangeTreeData(() => {
      updateCommitButtonContext();
      updateAllCommitUI();
    });

    // Handle collapse all to toggle to expand all
    treeView.onDidCollapseElement((e) => {
      // When user manually collapses items, update our state and the changelist state
      if (e.element instanceof ChangelistTreeItem) {
        const changelistItem = e.element as ChangelistTreeItem;
        const changelist = treeProvider.getChangelists().find((c) => c.id === changelistItem.changelist.id);
        if (changelist) {
          changelist.isExpanded = false;
        }
      } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      }
      // Check if all changelists are collapsed
      const allCollapsed = treeProvider.getChangelists().every((c) => c.files.length === 0 || !c.isExpanded);
      isExpanded = !allCollapsed;
    });

    treeView.onDidExpandElement((e) => {
      // When user manually expands items, update our state and the changelist state
      if (e.element instanceof ChangelistTreeItem) {
        const changelistItem = e.element as ChangelistTreeItem;
        const changelist = treeProvider.getChangelists().find((c) => c.id === changelistItem.changelist.id);
        if (changelist) {
          changelist.isExpanded = true;
        }
      } else if (e.element.contextValue === ContextValues.UnversionedSection) {
      }
      // Check if any changelist is expanded
      const anyExpanded = treeProvider.getChangelists().some((c) => c.files.length > 0 && c.isExpanded);
      isExpanded = anyExpanded;
    });

    // Preview file on selection change (click or space)
    treeView.onDidChangeSelection((e) => {
      const selected = e.selection[0];
      if (selected instanceof FileTreeItem) {
        previewFileTreeItem(selected);
      }
    });

    // Handle checkbox state changes
    treeView.onDidChangeCheckboxState((e) => {
      treeProvider.onDidChangeCheckboxState(e);
      updateAllCommitUI();
      updateCommitButtonContext();
    });

    // Listen for new changelist creation events
    treeProvider.onChangelistCreated(async (changelistId: string) => {
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

    // Listen for changelist auto-expand events (when files are moved/dropped)
    treeProvider.onChangelistAutoExpand(async (changelistId: string) => {
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

    // Create status bar items for commit functionality
    createCommitStatusBarItems();

    // Initialize commit button context
    updateCommitButtonContext();

    // Build command dependencies
    const deps: CommandDependencies = {
      store: commitStore,
      gitService,
      treeView,
      statusBar: { commitMessageInput },
      fileWatcher: {
        skipNextRefresh() {
          skipNextWatcherRefresh = true;
        },
      },
    };

    // Register all command modules
    const commands = [
      ...registerCommitCommands(deps),
      ...registerStashCommands(deps),
      ...registerRevertCommands(deps),
      ...registerChangelistCommands(deps),
      ...registerSelectionCommands(deps),
      ...registerNavigationCommands(),
      ...registerFileCommands(),
      ...registerMiscCommands(deps),
    ];

    context.subscriptions.push(...commands);
    context.subscriptions.push(treeView);

    treeProvider.refresh();
    updateAllCommitUI();
  }

  // Function to update commit button context based on file selection
  function updateCommitButtonContext() {
    const selectedFiles = treeProvider.getSelectedFiles();
    const hasSelectedFiles = selectedFiles.length > 0;
    vscode.commands.executeCommand(CommandIds.SetContext, ContextKeys.HasSelectedFiles, hasSelectedFiles);

    const stagedCount = treeProvider.getChangelists().reduce((sum, c) => sum + c.files.length, 0);
    treeView.badge = stagedCount > 0 ? { value: stagedCount, tooltip: `${stagedCount} staged files` } : undefined;
  }

  // Set up file system watcher to refresh on file changes
  const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  fileSystemWatcher.onDidChange(async (uri) => {
    if (skipNextWatcherRefresh) {
      skipNextWatcherRefresh = false;
      return;
    }
    if (treeProvider) {
      // Auto-stage the changed file if the feature is enabled
      const config = vscode.workspace.getConfiguration(ConfigKeys.Namespace);
      const autoStageEnabled = config.get<boolean>(ConfigKeys.AutoStageFiles, true);

      if (autoStageEnabled && gitService) {
        const relativePath = vscode.workspace.asRelativePath(uri);

        // Skip auto-staging for certain file types
        if (shouldSkipAutoStage(relativePath)) {
          return;
        }

        // Only auto-stage files that are already tracked by Git
        const isTracked = await gitService.isFileTracked(relativePath);
        if (!isTracked) {
          return;
        }

        try {
          await gitService.stageFile(relativePath);
        } catch (error) {
          console.error(`Failed to auto-stage file ${relativePath}:`, error);
        }
      }

      treeProvider.refresh();
      updateAllCommitUI();
    }
  });
  fileSystemWatcher.onDidCreate(async (uri) => {
    if (skipNextWatcherRefresh) {
      skipNextWatcherRefresh = false;
      return;
    }
    if (treeProvider) {
      // Auto-stage the new file if the feature is enabled
      const config = vscode.workspace.getConfiguration(ConfigKeys.Namespace);
      const autoStageEnabled = config.get<boolean>(ConfigKeys.AutoStageFiles, true);

      if (autoStageEnabled && gitService) {
        const relativePath = vscode.workspace.asRelativePath(uri);

        // Skip auto-staging for certain file types
        if (shouldSkipAutoStage(relativePath)) {
          return;
        }

        // Only auto-stage files that are already tracked by Git
        const isTracked = await gitService.isFileTracked(relativePath);
        if (!isTracked) {
          return;
        }

        try {
          await gitService.stageFile(relativePath);
        } catch (error) {
          console.error(`Failed to auto-stage file ${relativePath}:`, error);
        }
      }

      treeProvider.refresh();
      updateAllCommitUI();
    }
  });
  fileSystemWatcher.onDidDelete(() => {
    if (skipNextWatcherRefresh) {
      skipNextWatcherRefresh = false;
      return;
    }
    if (treeProvider) {
      treeProvider.refresh();
      updateAllCommitUI();
    }
  });

  context.subscriptions.push(fileSystemWatcher);
}

function createCommitStatusBarItems() {
  // Create commit button in status bar
  commitStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  commitStatusBarItem.command = CommandIds.CommitFromStatusBar;
  commitStatusBarItem.tooltip = 'Commit selected files';
  commitStatusBarItem.show();

  // Create commit message input in status bar
  commitMessageInput = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  commitMessageInput.command = CommandIds.UpdateCommitMessage;
  commitMessageInput.tooltip = 'Click to edit commit message';
  commitMessageInput.text = StatusBarText.MessagePrefix;
  commitMessageInput.show();

  updateAllCommitUI();
}

function updateCommitStatusBar() {
  if (!treeProvider) {
    return;
  }

  const selectedFiles = treeProvider.getSelectedFiles();
  const totalFiles = treeProvider.getAllFiles().length;

  if (selectedFiles.length > 0) {
    commitStatusBarItem.text = `$(check) Commit (${selectedFiles.length}/${totalFiles})`;
    commitStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  } else {
    commitStatusBarItem.text = '$(check) Commit';
    commitStatusBarItem.backgroundColor = undefined;
  }
}

function updateAllCommitUI() {
  updateCommitStatusBar();
}

export function deactivate() {
  if (commitStatusBarItem) {
    commitStatusBarItem.dispose();
  }
  if (commitMessageInput) {
    commitMessageInput.dispose();
  }
}

// Helper function to determine if a file should be skipped for auto-staging
function shouldSkipAutoStage(filePath: string): boolean {
  const skipPatterns = [
    // Temporary files
    /\.tmp$/,
    /\.temp$/,
    /\.swp$/,
    /\.swo$/,
    /~$/,

    // Build artifacts
    /\.log$/,
    /\.out$/,
    /\.exe$/,
    /\.dll$/,
    /\.so$/,
    /\.dylib$/,
    /\.o$/,
    /\.obj$/,
    /\.class$/,

    // IDE and editor files
    /\.vscode\//,
    /\.idea\//,
    /\.vs\//,
    /\.DS_Store$/,
    /Thumbs\.db$/,

    // Node.js
    /node_modules\//,
    /npm-debug\.log$/,
    /yarn-error\.log$/,

    // Git
    /\.git\//,

    // Package managers
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,

    // Environment files
    /\.env$/,
    /\.env\.local$/,
    /\.env\.development$/,
    /\.env\.production$/,
  ];

  return skipPatterns.some((pattern) => pattern.test(filePath));
}

// Preview a file tree item (reuses the same commands as click handlers)
async function previewFileTreeItem(fileItem: FileTreeItem): Promise<void> {
  const uri = fileItem.resourceUri;
  if (!uri) {
    return;
  }
  const isNew = fileItem.file.status === FileStatus.Untracked || fileItem.file.status === FileStatus.Added;
  const command = isNew ? CommandIds.OpenFile : CommandIds.OpenDiff;
  await vscode.commands.executeCommand(command, uri);
}
