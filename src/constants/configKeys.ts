export const ConfigKeys = {
  Namespace: 'jetbrains-commit-manager',
  AutoStageFiles: 'autoStageFiles',
} as const;

export type ConfigKeys = (typeof ConfigKeys)[keyof typeof ConfigKeys];
