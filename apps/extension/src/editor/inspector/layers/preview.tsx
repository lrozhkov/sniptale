import type { EditorLayerItem } from '../../../features/editor/document/types';
import { getLayerIcon } from '../../chrome/tool-icons';
import { cx } from '../../chrome/ui';
import { LAYER_ICON_CLASS_NAME, LAYER_ICON_SURFACE_CLASS_NAME } from './shared';

export function LayerPreview({ layer }: { layer: EditorLayerItem }) {
  return (
    <span aria-hidden="true" className={cx(LAYER_ICON_CLASS_NAME, LAYER_ICON_SURFACE_CLASS_NAME)}>
      {getLayerIcon(layer.type)}
    </span>
  );
}
