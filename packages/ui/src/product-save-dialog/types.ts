import type { MouseEvent, ReactNode } from 'react';

export interface ProductSaveDialogPresetItem {
  id: string;
  title: ReactNode;
  path: ReactNode;
}

export interface ProductSaveDialogProps {
  title: ReactNode;
  subtitle: ReactNode;
  closeLabel: string;
  filenameLabel: ReactNode;
  filename: string;
  filenamePlaceholder?: string;
  onFilenameChange: (value: string) => void;
  presetLabel: ReactNode;
  presetCount: ReactNode;
  presetItems: ProductSaveDialogPresetItem[];
  presetsEmptyState?: ReactNode;
  systemFolderLabel: ReactNode;
  systemFolderHint: ReactNode;
  onChoosePreset: (presetId: string, event: MouseEvent<HTMLButtonElement>) => void;
  onChooseSystemFolder: (event: MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
  footer?: ReactNode;
}
