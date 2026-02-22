// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CommandIds, ConfigKeys, ContextKeys, ContextValues, DefaultValues, StatusBarText, ViewIds } from './constants';
import { GitService } from './gitService';
import { ChangelistTreeItem, FileTreeItem, NativeTreeProvider } from './nativeTreeProvider';
import { FileItem, FileStatus } from './types';

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
    treeProvider = new NativeTreeProvider(workspaceRoot);
    gitService = new GitService(workspaceRoot);

    // Create the tree view
    treeView = vscode.window.createTreeView(ViewIds.Changelists, {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: treeProvider,
    });

    // Listen for tree data changes to update commit button context
    treeProvider.onDidChangeTreeData(() => {
      updateCommitButtonContext();
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

  }

  // Function to update commit button context based on file selection
  function updateCommitButtonContext() {
    const selectedFiles = treeProvider.getSelectedFiles();
    const hasSelectedFiles = selectedFiles.length > 0;
    vscode.commands.executeCommand(CommandIds.SetContext, ContextKeys.HasSelectedFiles, hasSelectedFiles);

    const stagedCount = treeProvider.getChangelists().reduce((sum, c) => sum + c.files.length, 0);
    treeView.badge = stagedCount > 0 ? { value: stagedCount, tooltip: `${stagedCount} staged files` } : undefined;
  }

  // Register commands
  const commands = [
    vscode.commands.registerCommand(CommandIds.Open, () => {
      if (treeView) {
        // Focus on the tree view
        vscode.commands.executeCommand(CommandIds.ChangelistsFocus);
      }
    }),

    // Open a diff for a file from the tree (only called for tracked files with HEAD history)
    vscode.commands.registerCommand(CommandIds.OpenDiff, async (uri: vscode.Uri) => {
      try {
        // Build a proper git-scheme URI with JSON query as expected by Git extension
        const left = vscode.Uri.from({
          scheme: 'git',
          path: uri.fsPath,
          query: JSON.stringify({ path: uri.fsPath, ref: 'HEAD' }),
        });

        const right = uri; // working tree
        const fileName = uri.fsPath.split('/').pop() || DefaultValues.FallbackFileName;
        const title = `${fileName} (HEAD ↔︎ Working Tree)`;

        await vscode.commands.executeCommand(CommandIds.VscodeDiff, left, right, title, { preserveFocus: true });
      } catch (error) {
        // Fallback to open if diff fails
        await vscode.commands.executeCommand(CommandIds.VscodeOpen, uri, { preserveFocus: true });
      }
    }),

    // Open the source file from a file item context menu
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

    vscode.commands.registerCommand(CommandIds.CreateChangelist, async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter changelist name',
        placeHolder: 'e.g., Feature X',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Changelist name cannot be empty';
          }
          if (treeProvider.getChangelists().some((c) => c.name === value.trim())) {
            return 'Changelist with this name already exists';
          }
          return null;
        },
      });

      if (name) {
        treeProvider.createChangelist(name.trim());
        treeProvider.refresh();
        updateAllCommitUI();
      }
    }),

    vscode.commands.registerCommand(CommandIds.DeleteChangelist, async (changelistItem?: any) => {
      let changelistId: string;
      let changelistName: string;

      if (changelistItem && changelistItem.changelist) {
        // Called from inline context menu - changelistItem is a ChangelistTreeItem
        changelistId = changelistItem.changelist.id;
        changelistName = changelistItem.changelist.name;
      } else {
        // Called from command palette or other places - show selection dialog
        const changelists = treeProvider.getChangelists().filter((c) => !c.isDefault);
        if (changelists.length === 0) {
          vscode.window.showInformationMessage('No custom changelists to delete.');
          return;
        }

        const options = changelists.map((c) => ({ label: c.name, value: c.id }));
        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select changelist to delete',
        });

        if (!selected) {
          return;
        }

        changelistId = selected.value;
        changelistName = selected.label;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete changelist "${changelistName}"?`,
        { modal: true },
        'Delete',
      );

      if (confirm === 'Delete') {
        treeProvider.deleteChangelist(changelistId);
        treeProvider.refresh();
        updateAllCommitUI();
      }
    }),

    vscode.commands.registerCommand(CommandIds.RenameChangelist, async (changelistItem?: any) => {
      let changelistId: string;
      let currentName: string;

      if (changelistItem && changelistItem.changelist) {
        // Called from inline context menu - changelistItem is a ChangelistTreeItem
        changelistId = changelistItem.changelist.id;
        currentName = changelistItem.changelist.name;
      } else {
        // Called from command palette or other places - show selection dialog
        const changelists = treeProvider.getChangelists();
        if (changelists.length === 0) {
          vscode.window.showInformationMessage('No changelists to rename.');
          return;
        }

        const options = changelists.map((c) => ({ label: c.name, value: c.id }));
        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select changelist to rename',
        });

        if (!selected) {
          return;
        }

        changelistId = selected.value;
        currentName = selected.label;
      }

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new changelist name',
        placeHolder: 'Enter new name...',
        value: currentName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Changelist name cannot be empty';
          }
          if (treeProvider.getChangelists().some((c) => c.name === value.trim() && c.id !== changelistId)) {
            return 'Changelist with this name already exists';
          }
          return null;
        },
      });

      if (newName && newName.trim() !== currentName) {
        try {
          await treeProvider.renameChangelist(changelistId, newName.trim());
          vscode.window.showInformationMessage(`Changelist renamed to "${newName.trim()}"`);
          treeProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to rename changelist: ${error}`);
        }
      }
    }),

    vscode.commands.registerCommand(CommandIds.CommitSelectedFiles, async () => {
      const selectedFiles = treeProvider.getSelectedFiles();

      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected for commit. Please select files first.');
        return;
      }

      const message = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'Describe your changes...',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Commit message cannot be empty';
          }
          return null;
        },
      });

      if (message) {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Commit', amend: false, push: false },
            { label: 'Amend Commit', amend: true, push: false },
            { label: 'Commit and Push', amend: false, push: true },
            { label: 'Amend Commit and Push', amend: true, push: true },
          ],
          { placeHolder: 'Choose commit action' },
        );
        if (!choice) {
          return;
        }
        const committedIds = new Set(selectedFiles.map((f) => f.id));
        skipNextWatcherRefresh = true;
        const snapshot = treeProvider.removeCommittedFiles(committedIds);
        updateAllCommitUI();
        updateCommitButtonContext();

        const success = await gitService.commitFiles(selectedFiles, message.trim(), { amend: choice.amend });

        if (success) {
          vscode.window.showInformationMessage(`Successfully committed ${selectedFiles.length} file(s)`);
          if (choice.push) {
            const pushed = await gitService.pushCurrentBranch();
            if (pushed) {
              vscode.window.showInformationMessage('Pushed to remote successfully');
            }
          }
        } else {
          treeProvider.restoreFiles(snapshot);
          updateAllCommitUI();
          updateCommitButtonContext();
          vscode.window.showErrorMessage('Failed to commit files. Check the output panel for details.');
        }
      }
    }),

    vscode.commands.registerCommand(CommandIds.StashSelectedFiles, async () => {
      const selectedFiles = treeProvider.getSelectedFiles();

      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected for stash. Please select files first.');
        return;
      }

      // Determine default message based on changelist selection
      let defaultMessage = '';
      const changelists = treeProvider.getChangelists();

      // Check if all selected files are from the same changelist
      const selectedChangelistIds = new Set(selectedFiles.map((f) => f.changelistId).filter((id) => id));
      if (selectedChangelistIds.size === 1) {
        const changelistId = Array.from(selectedChangelistIds)[0];
        const changelist = changelists.find((c) => c.id === changelistId);
        if (changelist && !changelist.isDefault) {
          defaultMessage = changelist.name;
        }
      }

      const message = await vscode.window.showInputBox({
        prompt: 'Enter stash message',
        placeHolder: defaultMessage || 'Describe your changes...',
        value: defaultMessage,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Stash message cannot be empty';
          }
          return null;
        },
      });

      if (message) {
        const success = await gitService.stashFiles(selectedFiles, message.trim());

        if (success) {
          vscode.window.showInformationMessage(`Successfully stashed ${selectedFiles.length} file(s)`);
          treeProvider.refresh();
          updateAllCommitUI();
          updateCommitButtonContext();
        } else {
          vscode.window.showErrorMessage('Failed to stash files. Check the output panel for details.');
        }
      }
    }),

    vscode.commands.registerCommand(CommandIds.MoveFileToChangelist, async (fileId?: string) => {
      let filesToMove: FileItem[] = [];

      if (fileId) {
        // If a specific file ID is provided (from context menu), move that file
        const allFiles = treeProvider.getAllFiles();
        const file = allFiles.find((f) => f.id === fileId);
        if (file) {
          filesToMove = [file];
        }
      } else {
        // Otherwise, move selected files
        filesToMove = treeProvider.getSelectedFiles();
      }

      if (filesToMove.length === 0) {
        vscode.window.showWarningMessage('No files selected. Please select files first.');
        return;
      }

      const changelists = treeProvider.getChangelists();
      const options = changelists.map((c) => ({ label: c.name, value: c.id }));

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select target changelist',
      });

      if (selected) {
        for (const file of filesToMove) {
          await treeProvider.moveFileToChangelist(file.id, selected.value);
        }
        treeProvider.refresh();
        updateAllCommitUI();
        updateCommitButtonContext();
      }
    }),

    vscode.commands.registerCommand(CommandIds.ToggleFileSelection, (fileId: string) => {
      treeProvider.toggleFileSelection(fileId);
      treeProvider.refresh();
      updateAllCommitUI();
      updateCommitButtonContext();
    }),

    vscode.commands.registerCommand(CommandIds.Refresh, () => {
      treeProvider.refresh();
      updateAllCommitUI();
    }),

    vscode.commands.registerCommand(CommandIds.CollapseAll, () => {
      if (treeProvider) {
        treeProvider.collapseAll();
        isExpanded = false;
      }
    }),

    vscode.commands.registerCommand(CommandIds.RevertSelectedFiles, async () => {
      const selectedFiles = treeProvider.getSelectedFiles();

      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected for revert. Please select files first.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to revert ${selectedFiles.length} file(s)? This will discard all uncommitted changes.`,
        { modal: true },
        'Revert',
      );

      if (confirm === 'Revert') {
        const revertedIds = new Set(selectedFiles.map((f) => f.id));
        skipNextWatcherRefresh = true;
        const snapshot = treeProvider.removeCommittedFiles(revertedIds);
        updateAllCommitUI();
        updateCommitButtonContext();

        const success = await gitService.revertFiles(selectedFiles);
        if (success) {
          vscode.window.showInformationMessage(`Successfully reverted ${selectedFiles.length} file(s)`);
        } else {
          treeProvider.restoreFiles(snapshot);
          updateAllCommitUI();
          updateCommitButtonContext();
          vscode.window.showErrorMessage('Failed to revert files. Check the output panel for details.');
        }
      }
    }),

    // Revert a single file from context menu
    vscode.commands.registerCommand(CommandIds.RevertFile, async (arg?: any) => {
      let fileToRevert: FileItem | undefined;
      const allFiles = treeProvider.getAllFiles();

      if (typeof arg === 'string') {
        fileToRevert = allFiles.find((f) => f.id === arg);
      } else if (arg && arg.file) {
        // Invoked from context menu: arg is FileTreeItem
        fileToRevert = arg.file as FileItem;
      } else if (arg && arg.resourceUri) {
        const fsPath: string = arg.resourceUri.fsPath as string;
        // match by path tail relative path presence
        fileToRevert = allFiles.find((f) => fsPath.endsWith(f.path));
      }
      if (!fileToRevert) {
        vscode.window.showWarningMessage('No file selected to revert.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Revert changes in ${fileToRevert.name}? This discards uncommitted changes.`,
        { modal: true },
        'Revert',
      );
      if (confirm !== 'Revert') {
        return;
      }

      skipNextWatcherRefresh = true;
      const snapshot = treeProvider.removeCommittedFiles(new Set([fileToRevert.id]));
      updateAllCommitUI();
      updateCommitButtonContext();

      const success = await gitService.revertFiles([fileToRevert]);
      if (success) {
        vscode.window.showInformationMessage(`Reverted ${fileToRevert.name}`);
      } else {
        treeProvider.restoreFiles(snapshot);
        updateAllCommitUI();
        updateCommitButtonContext();
        vscode.window.showErrorMessage(`Failed to revert ${fileToRevert.name}`);
      }
    }),

    // Revert all files in a changelist from context menu
    vscode.commands.registerCommand(CommandIds.RevertChangelist, async (changelistItem?: any) => {
      if (!changelistItem || !changelistItem.changelist) {
        return;
      }
      const changelistId: string = changelistItem.changelist.id;
      const changelistName: string = changelistItem.changelist.name;
      const files = treeProvider.getChangelists().find((c) => c.id === changelistId)?.files || [];
      if (files.length === 0) {
        vscode.window.showInformationMessage('No files to revert in this changelist.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Revert all ${files.length} file(s) in "${changelistName}"? This discards uncommitted changes.`,
        { modal: true },
        'Revert',
      );
      if (confirm !== 'Revert') {
        return;
      }

      const revertedIds = new Set(files.map((f) => f.id));
      skipNextWatcherRefresh = true;
      const snapshot = treeProvider.removeCommittedFiles(revertedIds);
      updateAllCommitUI();
      updateCommitButtonContext();

      const success = await gitService.revertFiles(files);
      if (success) {
        vscode.window.showInformationMessage(`Reverted ${files.length} file(s) in "${changelistName}"`);
      } else {
        treeProvider.restoreFiles(snapshot);
        updateAllCommitUI();
        updateCommitButtonContext();
        vscode.window.showErrorMessage(`Failed to revert files in "${changelistName}"`);
      }
    }),

    vscode.commands.registerCommand(CommandIds.SelectAllFiles, () => {
      treeProvider.selectAllFiles();
      treeProvider.refresh();
      updateAllCommitUI();
      updateCommitButtonContext();
    }),

    vscode.commands.registerCommand(CommandIds.DeselectAllFiles, () => {
      treeProvider.deselectAllFiles();
      treeProvider.refresh();
      updateAllCommitUI();
      updateCommitButtonContext();
    }),

    // New command for status bar commit button
    vscode.commands.registerCommand(CommandIds.CommitFromStatusBar, async () => {
      const selectedFiles = treeProvider.getSelectedFiles();

      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected for commit. Please select files first.');
        return;
      }

      // Get commit message from the input field
      const message = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'Describe your changes...',
        value: commitMessageInput.text.replace(StatusBarText.MessagePrefix, ''), // Remove the icon prefix
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Commit message cannot be empty';
          }
          return null;
        },
      });

      if (message) {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Commit', amend: false, push: false },
            { label: 'Amend Commit', amend: true, push: false },
            { label: 'Commit and Push', amend: false, push: true },
            { label: 'Amend Commit and Push', amend: true, push: true },
          ],
          { placeHolder: 'Choose commit action' },
        );
        if (!choice) {
          return;
        }
        const committedIds = new Set(selectedFiles.map((f) => f.id));
        skipNextWatcherRefresh = true;
        const snapshot = treeProvider.removeCommittedFiles(committedIds);
        updateAllCommitUI();
        updateCommitButtonContext();
        commitMessageInput.text = StatusBarText.MessagePrefix;

        const success = await gitService.commitFiles(selectedFiles, message.trim(), { amend: choice.amend });

        if (success) {
          vscode.window.showInformationMessage(`Successfully committed ${selectedFiles.length} file(s)`);
          if (choice.push) {
            const pushed = await gitService.pushCurrentBranch();
            if (pushed) {
              vscode.window.showInformationMessage('Pushed to remote successfully');
            }
          }
        } else {
          treeProvider.restoreFiles(snapshot);
          updateAllCommitUI();
          updateCommitButtonContext();
          vscode.window.showErrorMessage('Failed to commit files. Check the output panel for details.');
        }
      }
    }),

    // New command for status bar stash button
    vscode.commands.registerCommand(CommandIds.StashFromStatusBar, async () => {
      const selectedFiles = treeProvider.getSelectedFiles();

      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected for stash. Please select files first.');
        return;
      }

      // Determine default message based on changelist selection
      let defaultMessage = '';
      const changelists = treeProvider.getChangelists();

      // Check if all selected files are from the same changelist
      const selectedChangelistIds = new Set(selectedFiles.map((f) => f.changelistId).filter((id) => id));
      if (selectedChangelistIds.size === 1) {
        const changelistId = Array.from(selectedChangelistIds)[0];
        const changelist = changelists.find((c) => c.id === changelistId);
        if (changelist && !changelist.isDefault) {
          defaultMessage = changelist.name;
        }
      }

      // Get stash message from the input field or prompt
      const message = await vscode.window.showInputBox({
        prompt: 'Enter stash message',
        placeHolder: defaultMessage || 'Describe your changes...',
        value: defaultMessage || commitMessageInput.text.replace(StatusBarText.MessagePrefix, ''), // Use changelist name or current message
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Stash message cannot be empty';
          }
          return null;
        },
      });

      if (message) {
        const success = await gitService.stashFiles(selectedFiles, message.trim());

        if (success) {
          vscode.window.showInformationMessage(`Successfully stashed ${selectedFiles.length} file(s)`);
          treeProvider.refresh();
          updateAllCommitUI();
          updateCommitButtonContext();
          // Clear the commit message input
          commitMessageInput.text = StatusBarText.MessagePrefix;
        } else {
          vscode.window.showErrorMessage('Failed to stash files. Check the output panel for details.');
        }
      }
    }),

    // Command to update commit message in status bar
    vscode.commands.registerCommand(CommandIds.UpdateCommitMessage, async () => {
      const message = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'Describe your changes...',
        value: commitMessageInput.text.replace(StatusBarText.MessagePrefix, ''),
      });

      if (message !== undefined) {
        commitMessageInput.text = `${StatusBarText.MessagePrefix}${message}`;
      }
    }),

    // Command to toggle auto-stage feature
    vscode.commands.registerCommand(CommandIds.ToggleAutoStage, async () => {
      const config = vscode.workspace.getConfiguration(ConfigKeys.Namespace);
      const currentValue = config.get<boolean>(ConfigKeys.AutoStageFiles, true);
      const newValue = !currentValue;

      await config.update(ConfigKeys.AutoStageFiles, newValue, vscode.ConfigurationTarget.Workspace);

      const status = newValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Auto-stage files ${status}`);
    }),

    // Navigate and preview: move focus then select to trigger preview
    vscode.commands.registerCommand(CommandIds.NavigateDown, async () => {
      await vscode.commands.executeCommand(CommandIds.ListFocusDown);
      await vscode.commands.executeCommand(CommandIds.ListSelect);
    }),

    vscode.commands.registerCommand(CommandIds.NavigateUp, async () => {
      await vscode.commands.executeCommand(CommandIds.ListFocusUp);
      await vscode.commands.executeCommand(CommandIds.ListSelect);
    }),

    vscode.commands.registerCommand(CommandIds.ToggleCheckbox, () => {
      const selected = treeView.selection[0];
      if (!(selected instanceof FileTreeItem)) return;
      treeProvider.toggleFileSelection(selected.file.id);
      selected.checkboxState = selected.file.isSelected
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
      treeProvider.updateTreeItem(selected);
      updateAllCommitUI();
      updateCommitButtonContext();
    }),

    // Test command to verify extension is working
    vscode.commands.registerCommand(CommandIds.Test, () => {
      vscode.window.showInformationMessage('JetBrains Commit Manager extension is working!');
    }),
  ];

  context.subscriptions.push(...commands);

  if (treeView) {
    context.subscriptions.push(treeView);
  }

  if (treeProvider) {
    treeProvider.refresh();
    updateAllCommitUI();
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
