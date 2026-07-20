import { Path } from 'fabric';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import { buildArrowPathData } from '../paths';
import type { PointLike } from '../types';
import { applyArrowInteractionAppearance } from './appearance';
import { syncArrowMetadata } from './metadata';
import { createArrowPathStyle } from './style';

export interface ArrowUpdateOptions {
  settings?: EditorArrowSettings;
  points?: PointLike[];
  start?: PointLike;
  end?: PointLike;
  control?: PointLike | null;
}

export function applyArrowObjectState(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings,
  points: PointLike[],
  createControls: () => Record<string, import('fabric').Control>
): void {
  const previousTranslation = {
    x: (arrow.left ?? 0) - arrow.pathOffset.x,
    y: (arrow.top ?? 0) - arrow.pathOffset.y,
  };
  const pathData = buildArrowPathData(points, settings);
  const draft = new Path(pathData || 'M 0 0 L 0 0');
  const lineStyle: EditorArrowSettings['style'] = settings.style ?? 'solid';

  arrow.set({
    path: draft.path,
    ...createArrowPathStyle(settings, lineStyle),
  });
  arrow.setDimensions();
  arrow.set({
    left: arrow.pathOffset.x + previousTranslation.x,
    top: arrow.pathOffset.y + previousTranslation.y,
    originX: 'center',
    originY: 'center',
  });

  syncArrowMetadata(arrow, settings, points);
  arrow.controls = createControls();
  applyArrowInteractionAppearance(arrow, settings);
  arrow.set('dirty', true);
  arrow.setCoords();
}
