import type { EditorLayerItem } from '../../../features/editor/document/types';
import { AnnotatableImageSurface } from '@sniptale/ui/annotatable-image-surface';
import { getLayerIcon } from '../../chrome/tool-icons';
import { cx } from '../../chrome/ui';
import { LAYER_ICON_CLASS_NAME, LAYER_ICON_SURFACE_CLASS_NAME } from './shared';

export function LayerPreview({ layer }: { layer: EditorLayerItem }) {
  const previewNode = layer.previewDataUrl ? (
    <img
      src={layer.previewDataUrl}
      alt={layer.name}
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : layer.previewColor ? (
    <div className="h-full w-full" style={{ backgroundColor: layer.previewColor }} />
  ) : (
    <span className={cx(LAYER_ICON_CLASS_NAME, LAYER_ICON_SURFACE_CLASS_NAME, 'h-7 w-7 border-0')}>
      {getLayerIcon(layer.type)}
    </span>
  );

  return (
    <AnnotatableImageSurface
      checkerboard={layer.previewTransparent}
      className={
        'flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] ' +
        'border-[color:var(--sniptale-color-border-soft)]'
      }
    >
      {previewNode}
    </AnnotatableImageSurface>
  );
}
