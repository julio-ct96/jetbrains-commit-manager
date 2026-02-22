export const FileStatus = {
  Modified: 'modified',
  Added: 'added',
  Deleted: 'deleted',
  Untracked: 'untracked',
  Renamed: 'renamed',
} as const;

export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];
