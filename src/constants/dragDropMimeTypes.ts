export const DragDropMimeTypes = {
  TreeItem: 'application/vnd.code.tree.jetbrains-commit-manager',
  Changelist: 'application/vnd.code.tree.jetbrains-commit-manager.changelist',
} as const;

export type DragDropMimeTypes = (typeof DragDropMimeTypes)[keyof typeof DragDropMimeTypes];
