import type {
  EditorBuiltInShapeCapability,
  EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import type { EditorInspectorToolsPanelProps } from '../types';

export interface RichShapeControlsProps extends Pick<
  EditorInspectorToolsPanelProps,
  | 'applyRichShapePatch'
  | 'arrangeSelection'
  | 'recentColors'
  | 'shapeFillPalette'
  | 'shapeStrokePalette'
  | 'textColorPalette'
  | 'toNumber'
  | 'updateColor'
> {
  capabilities: readonly EditorBuiltInShapeCapability[];
  roughCapable: boolean;
  shape: EditorRichShapeDocumentObject;
}
