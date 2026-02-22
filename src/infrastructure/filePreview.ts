import * as vscode from 'vscode';
import { CommandIds } from '../constants';
import { FileTreeItem } from '../tree-items';
import { FileStatus } from '../types';

export async function previewFileTreeItem(fileItem: FileTreeItem): Promise<void> {
  const uri = fileItem.resourceUri;
  if (!uri) return;

  const isNew = fileItem.file.status === FileStatus.Untracked || fileItem.file.status === FileStatus.Added;
  const command = isNew ? CommandIds.OpenFile : CommandIds.OpenDiff;
  await vscode.commands.executeCommand(command, uri);
}
