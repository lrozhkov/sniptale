import type { EditorDocumentActionItem } from './item';

export interface EditorDocumentActionGroup {
  id:
    | 'close'
    | 'image-format'
    | 'open-image'
    | 'primary-save'
    | 'quick-destinations'
    | 'save-utilities'
    | 'session';
  items: EditorDocumentActionItem[];
  layout: 'grid' | 'stack';
}
