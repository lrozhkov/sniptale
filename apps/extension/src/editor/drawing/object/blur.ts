import { Point, type FabricObject } from 'fabric';
import { DEFAULT_BLUR_SETTINGS } from '../../../features/highlighter/style/public';
import type { SourceState } from '../../document/model/source-state';
import { createBlurObject, updateBlurObject } from '../../objects/annotation/blur/object';
import type { DrawingObject } from '../../../features/drawing/public';
import { writeEditorDrawingObject } from './metadata';

const REMOVED_BLUR_METADATA_KEYS = [
  'sniptaleBlurAmount',
  'sniptaleBlurType',
  'sniptaleBlurShowBorder',
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeStyle',
  'sniptaleBlurStrokeWidth',
] as const;

export function clearLegacyBlurMetadata(object: FabricObject): void {
  const metadata = object as FabricObject & Record<string, unknown>;
  REMOVED_BLUR_METADATA_KEYS.forEach((key) => delete metadata[key]);
  object.set({ fill: 'transparent', stroke: null, strokeWidth: 0 });
}

export function createEditorDrawingBlurObject(args: {
  drawing: Extract<DrawingObject, { kind: 'blur' }>;
  labelIndex: number;
  source: SourceState;
}): FabricObject {
  const { bounds } = args.drawing;
  const object = createBlurObject({
    height: bounds.height,
    id: args.drawing.id,
    labelIndex: args.labelIndex,
    left: bounds.x,
    settings: DEFAULT_BLUR_SETTINGS,
    source: args.source,
    top: bounds.y,
    width: bounds.width,
  });
  writeEditorDrawingObject(object, args.drawing);
  clearLegacyBlurMetadata(object);
  if (args.drawing.rotation) {
    const center = new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    object.set({
      angle: args.drawing.rotation,
      left: center.x,
      originX: 'center',
      originY: 'center',
      top: center.y,
    });
    object.setPositionByOrigin(center, 'center', 'center');
  }
  return object;
}

export function refreshEditorDrawingBlurObject(object: FabricObject): void {
  updateBlurObject(object, { settings: DEFAULT_BLUR_SETTINGS });
  clearLegacyBlurMetadata(object);
}
