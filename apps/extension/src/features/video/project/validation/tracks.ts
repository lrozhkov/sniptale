import {
  isBoolean,
  isBoundedArray,
  isEnumValue,
  isFiniteNumber,
  isRecord,
  isString,
} from './primitives';
import { VideoProjectTrackRole, VideoTrackKind } from '../types/index';

function isLogicalLane(value: unknown): value is { id: string } {
  return isRecord(value) && isString(value['id']);
}

export function isVideoProjectTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isFiniteNumber(value['order']) &&
    isBoolean(value['visible']) &&
    isBoolean(value['locked']) &&
    isEnumValue(value['kind'], VideoTrackKind) &&
    (value['role'] === undefined ||
      (value['kind'] === VideoTrackKind.PRIMARY &&
        isEnumValue(value['role'], VideoProjectTrackRole))) &&
    (value['isRoot'] === undefined || isBoolean(value['isRoot'])) &&
    (value['logicalLanes'] === undefined || isBoundedArray(value['logicalLanes'], isLogicalLane))
  );
}
