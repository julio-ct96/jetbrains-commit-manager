export const StatusBarText = {
  MessagePrefix: '📝 ',
} as const;

export type StatusBarText = (typeof StatusBarText)[keyof typeof StatusBarText];
