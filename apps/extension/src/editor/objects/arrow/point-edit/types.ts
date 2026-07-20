import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import type { PointLike } from '../types';

interface ArrowPointUpdateTarget {
  points: PointLike[];
  settings: EditorArrowSettings;
}

export type UpdateArrowObjectFn = (
  arrow: ArrowPathInstance,
  options: ArrowPointUpdateTarget
) => void;
