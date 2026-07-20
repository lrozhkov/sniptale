import { Path, type FabricObject } from 'fabric';
import type { LinePathInstance } from '../types';

export function isLineObject(object: FabricObject): object is LinePathInstance {
  return object instanceof Path && object.sniptaleType === 'line';
}
