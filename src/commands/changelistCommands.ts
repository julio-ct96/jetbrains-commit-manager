import * as vscode from 'vscode';
import { CommandIds } from '../constants';
import { CommandDependencies } from './types';

export function registerChangelistCommands(deps: CommandDependencies): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CommandIds.CreateChangelist, async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter changelist name',
        placeHolder: 'e.g., Feature X',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) return 'Changelist name cannot be empty';
          if (deps.store.getChangelists().some((c) => c.name === value.trim()))
            return 'Changelist with this name already exists';
          return null;
        },
      });
      if (!name) return;

      await deps.store.createChangelist(name.trim());
    }),

    vscode.commands.registerCommand(CommandIds.DeleteChangelist, async (changelistItem?: any) => {
      let changelistId: string;
      let changelistName: string;

      if (changelistItem && changelistItem.changelist) {
        changelistId = changelistItem.changelist.id;
        changelistName = changelistItem.changelist.name;
      } else {
        const changelists = deps.store.getChangelists().filter((c) => !c.isDefault);
        if (changelists.length === 0) {
          vscode.window.showInformationMessage('No custom changelists to delete.');
          return;
        }

        const options = changelists.map((c) => ({ label: c.name, value: c.id }));
        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select changelist to delete',
        });
        if (!selected) return;

        changelistId = selected.value;
        changelistName = selected.label;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete changelist "${changelistName}"?`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;

      await deps.store.deleteChangelist(changelistId);
    }),

    vscode.commands.registerCommand(CommandIds.RenameChangelist, async (changelistItem?: any) => {
      let changelistId: string;
      let currentName: string;

      if (changelistItem && changelistItem.changelist) {
        changelistId = changelistItem.changelist.id;
        currentName = changelistItem.changelist.name;
      } else {
        const changelists = deps.store.getChangelists();
        if (changelists.length === 0) {
          vscode.window.showInformationMessage('No changelists to rename.');
          return;
        }

        const options = changelists.map((c) => ({ label: c.name, value: c.id }));
        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select changelist to rename',
        });
        if (!selected) return;

        changelistId = selected.value;
        currentName = selected.label;
      }

      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new changelist name',
        placeHolder: 'Enter new name...',
        value: currentName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) return 'Changelist name cannot be empty';
          if (deps.store.getChangelists().some((c) => c.name === value.trim() && c.id !== changelistId))
            return 'Changelist with this name already exists';
          return null;
        },
      });
      if (!newName || newName.trim() === currentName) return;

      try {
        await deps.store.renameChangelist(changelistId, newName.trim());
        vscode.window.showInformationMessage(`Changelist renamed to "${newName.trim()}"`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to rename changelist: ${error}`);
      }
    }),

    vscode.commands.registerCommand(CommandIds.MoveFileToChangelist, async (fileId?: string) => {
      let filesToMove = fileId
        ? [deps.store.getAllFiles().find((f) => f.id === fileId)].filter(Boolean)
        : deps.store.getSelectedFiles();

      if (filesToMove.length === 0) {
        vscode.window.showWarningMessage('No files selected. Please select files first.');
        return;
      }

      const changelists = deps.store.getChangelists();
      const options = changelists.map((c) => ({ label: c.name, value: c.id }));

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select target changelist',
      });
      if (!selected) return;

      for (const file of filesToMove) {
        await deps.store.moveFileToChangelist(file!.id, selected.value);
      }
    }),
  ];
}
