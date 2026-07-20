import type { FabricObject } from 'fabric';
import { isSourceObject } from '../../../document/model';

export type RasterReplacementType = 'background' | 'image' | 'source-image';

export function getRasterReplacementType(object: FabricObject): RasterReplacementType {
  if (isSourceObject(object)) {
    return 'source-image';
  }

  return object.sniptaleType === 'background' ? 'background' : 'image';
}
