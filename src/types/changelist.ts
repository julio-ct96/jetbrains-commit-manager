import { FileItem } from './fileItem';

export interface Changelist {
  id: string;
  name: string;
  description?: string;
  files: FileItem[];
  isDefault?: boolean;
  isExpanded?: boolean;
  createdAt: Date;
}
