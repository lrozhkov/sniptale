import type { LucideIcon } from 'lucide-react';

type EditorDocumentActionEmphasis = 'danger' | 'neutral' | 'primary' | 'secondary' | 'tertiary';

export interface EditorDocumentActionCommand {
  id:
    | 'close-file'
    | 'copy-png'
    | 'export-session'
    | 'import-session'
    | 'open-image'
    | 'save-image'
    | 'save-image-as';
  kind: 'command';
  label: string;
  icon: LucideIcon;
  emphasis: EditorDocumentActionEmphasis;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  disabledReason?: string;
  meta?: string;
}
