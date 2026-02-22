import * as vscode from 'vscode';
import { ConfigKeys } from '../constants';
import { GitService } from '../services';
import { CommitStore } from '../store';

export interface FileWatcher extends vscode.Disposable {
  skipNextRefresh(): void;
}

const SKIP_PATTERNS: RegExp[] = [
  // Temp files
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
  // IDE / Editor
  /\.vscode\//,
  /\.idea\//,
  /\.vs\//,
  /\.DS_Store$/,
  /Thumbs\.db$/,
  // Package managers
  /node_modules\//,
  /npm-debug\.log$/,
  /yarn-error\.log$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  // Git
  /\.git\//,
  // Environment
  /\.env$/,
  /\.env\.local$/,
  /\.env\.development$/,
  /\.env\.production$/,
];

function shouldSkipAutoStage(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function createFileWatcher(deps: { store: CommitStore; gitService: GitService }): FileWatcher {
  const { store, gitService } = deps;
  let skipNext = false;

  const handleFileSystemEvent = async (uri?: vscode.Uri) => {
    if (skipNext) {
      skipNext = false;
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

    await store.refresh();
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  watcher.onDidChange((uri) => handleFileSystemEvent(uri));
  watcher.onDidCreate((uri) => handleFileSystemEvent(uri));
  watcher.onDidDelete(() => handleFileSystemEvent());

  return {
    skipNextRefresh() {
      skipNext = true;
    },
    dispose() {
      watcher.dispose();
    },
  };
}
