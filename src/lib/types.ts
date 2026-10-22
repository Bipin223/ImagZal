import type { OutputFormat } from './formats';

export type ItemStatus = 'queued' | 'working' | 'done' | 'error';

export interface ConvertedFile {
  blob: Blob;
  url: string;
  filename: string;
  width: number;
  height: number;
  format: OutputFormat;
}

export interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: ItemStatus;
  result?: ConvertedFile;
  error?: string;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}
