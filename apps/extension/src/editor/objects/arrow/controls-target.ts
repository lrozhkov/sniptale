import { Path } from 'fabric';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { getEditableArrowPoints } from './controls.helpers';
import type { ArrowPathInstance } from './controls.types';
import { readArrowSettings } from './settings';
import type { PointLike } from './types';

function getArrowPathTarget(target: unknown): ArrowPathInstance | null {
  return target instanceof Path && target.sniptaleType === 'arrow'
    ? (target as ArrowPathInstance)
    : null;
}

export function resolveArrowEditableControlState(target: unknown): {
  arrow: ArrowPathInstance;
  editablePoints: PointLike[];
  settings: EditorArrowSettings;
} | null {
  const arrow = getArrowPathTarget(target);
  if (!arrow) {
    return null;
  }

  const settings = readArrowSettings(arrow);
  return {
    arrow,
    editablePoints: getEditableArrowPoints(arrow, settings),
    settings,
  };
}
