export const ContextKeys = {
  HasSelectedFiles: 'jetbrains-commit-manager.hasSelectedFiles',
} as const;

export type ContextKeys = (typeof ContextKeys)[keyof typeof ContextKeys];
