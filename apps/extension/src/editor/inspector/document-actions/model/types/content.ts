import type { ReactNode } from 'react';

export interface EditorDocumentActionContent {
  id: 'image-format' | 'save-to-folder';
  kind: 'content';
  label: string;
  content: ReactNode;
  note?: string;
  value?: string | null;
}
