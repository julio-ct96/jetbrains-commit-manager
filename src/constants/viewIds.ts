export const ViewIds = {
  Changelists: 'jetbrains-commit-manager.changelists',
} as const;

export type ViewIds = (typeof ViewIds)[keyof typeof ViewIds];
