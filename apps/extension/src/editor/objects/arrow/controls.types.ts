import type { ObjectEvents, Path, PathProps, SerializedPathProps, TOptions } from 'fabric';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import type { PointLike } from './types';

export type ArrowPathInstance = Path<TOptions<PathProps>, SerializedPathProps, ObjectEvents>;
export type UpdateArrowObject = (
  arrow: ArrowPathInstance,
  options: { settings: EditorArrowSettings; points: PointLike[] }
) => void;
