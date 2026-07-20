import type {
  EditorRenderedImageOptions,
  EditorRenderedImageSize,
} from '../../document/model/render-options';
import type { SavePreset } from '../../../contracts/settings';
import type { EditorInspectorDocumentActions } from '../types';

export interface EditorInspectorDocumentActionsProps extends Omit<
  EditorInspectorDocumentActions,
  'onApplyFrame'
> {
  canvasSize: EditorRenderedImageSize;
  savePresets: SavePreset[];
  defaultImagePresetId: string | null;
  onSaveToPreset: (presetId: string, options?: EditorRenderedImageOptions) => Promise<void> | void;
}
