export const DefaultValues = {
  DefaultChangelistId: 'default',
  DefaultChangelistName: 'Changes',
  DefaultChangelistDescription: 'Default changelist',
  UnversionedSnapshotKey: '__unversioned__',
  UnversionedSectionId: 'unversioned-section',
  FallbackFileName: 'file',
} as const;

export type DefaultValues = (typeof DefaultValues)[keyof typeof DefaultValues];
