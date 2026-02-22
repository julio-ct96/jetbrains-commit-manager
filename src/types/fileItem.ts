import { FileStatus } from './fileStatus';

export interface FileItem {
  id: string;
  path: string;
  name: string;
  status: FileStatus;
  isSelected: boolean;
  changelistId?: string;
  relativePath: string;
}
