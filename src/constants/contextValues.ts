export const ContextValues = {
  Changelist: 'changelist',
  ChangelistNonEmpty: 'changelistNonEmpty',
  DefaultChangelist: 'defaultChangelist',
  DefaultChangelistNonEmpty: 'defaultChangelistNonEmpty',
  File: 'file',
  UnversionedSection: 'unversionedSection',
} as const;

export type ContextValues = (typeof ContextValues)[keyof typeof ContextValues];
