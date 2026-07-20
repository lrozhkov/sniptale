import type { ReactNode } from 'react';

import type { EditorEmbedMode } from '../../../../../features/editor/contracts/embed';
import type { SavePreset } from '../../../../../contracts/settings';

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
