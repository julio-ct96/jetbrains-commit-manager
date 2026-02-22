import { FileItem } from './fileItem';

export interface OptimisticOperationParams {
  store: {
    removeCommittedFiles(fileIds: Set<string>): Map<string, FileItem[]>;
    restoreFiles(snapshot: Map<string, FileItem[]>): void;
  };
  fileIds: Set<string>;
  fileWatcher: { skipNextRefresh(): void };
  operation: () => Promise<boolean>;
  onSuccess: () => void;
  onFailure: () => void;
}
