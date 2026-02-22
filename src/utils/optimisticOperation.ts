import { OptimisticOperationParams } from '../types';

export async function executeWithOptimisticUI(params: OptimisticOperationParams): Promise<boolean> {
  params.fileWatcher.skipNextRefresh();
  const snapshot = params.store.removeCommittedFiles(params.fileIds);
  const success = await params.operation();

  if (success) {
    params.onSuccess();
  } else {
    params.store.restoreFiles(snapshot);
    params.onFailure();
  }

  return success;
}
