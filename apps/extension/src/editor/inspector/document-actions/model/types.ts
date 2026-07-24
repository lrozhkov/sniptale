import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SavePreset } from '../../../../contracts/settings';
import type { EditorEmbedMode } from '../../../../features/editor/contracts/embed';

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

interface EditorDocumentActionContent {
  id: 'image-format' | 'save-to-folder';
  kind: 'content';
  label: string;
  content: ReactNode;
  note?: string;
  value?: string | null;
}

type EditorDocumentActionItem = EditorDocumentActionCommand | EditorDocumentActionContent;

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

export interface BuildEditorDocumentActionGroupsParams {
  defaultImagePresetId: string | null;
  renderImageFormat: () => ReactNode;
  renderSavePresetOptions: () => ReactNode;
  savePresets: SavePreset[];
  copyRenderedImageDisabledReason?: string | null;
  embedMode?: EditorEmbedMode | null;
  onCloseDocument: () => Promise<void> | void;
  onCopyRenderedImage: () => Promise<void> | void;
  onExportSession: () => Promise<void> | void;
  onImportSession: () => Promise<void> | void;
  onOpenImage: () => Promise<void> | void;
  onReturnToHost?: () => Promise<void> | void;
  onSaveImage: () => Promise<void> | void;
  onSaveImageAs: () => Promise<void> | void;
}

export interface EditorDocumentActionCommands {
  closeFile: EditorDocumentActionCommand;
  copyPng: EditorDocumentActionCommand;
  imageFormat: EditorDocumentActionContent;
  exportSession: EditorDocumentActionCommand;
  importSession: EditorDocumentActionCommand;
  openImage: EditorDocumentActionCommand;
  saveImage: EditorDocumentActionCommand;
  saveImageAs: EditorDocumentActionCommand;
  saveToFolder: EditorDocumentActionContent;
}

export type EditorDocumentActionCommandBuilders = Pick<
  EditorDocumentActionCommands,
  | 'closeFile'
  | 'copyPng'
  | 'exportSession'
  | 'importSession'
  | 'openImage'
  | 'saveImage'
  | 'saveImageAs'
>;

export type EditorDocumentActionContentBuilders = Pick<
  EditorDocumentActionCommands,
  'imageFormat' | 'saveToFolder'
>;
