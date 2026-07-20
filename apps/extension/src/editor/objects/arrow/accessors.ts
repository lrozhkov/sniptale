import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { readArrowGeometry, readArrowSettings } from './controls';
import type { ArrowPathInstance } from './controls.types';
import type { PointLike } from './types';
import { resolveArrowInteractionAppearance } from './variant';

export function getArrowGeometry(arrow: ArrowPathInstance): {
  start: PointLike;
  end: PointLike;
  control: PointLike | null;
} {
  return readArrowGeometry(arrow);
}

export function getArrowSettings(arrow: ArrowPathInstance): EditorArrowSettings {
  return readArrowSettings(arrow);
}

export function getArrowInteractionAppearance(settings: EditorArrowSettings) {
  return resolveArrowInteractionAppearance(settings);
}
