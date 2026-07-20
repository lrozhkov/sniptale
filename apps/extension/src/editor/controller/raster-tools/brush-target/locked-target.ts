import type { FabricObject } from 'fabric';
import { isImageLayerStyleObject } from '../../../objects/image-style';

export function isLockedBaseImageTarget(target: FabricObject): boolean {
  return (
    isImageLayerStyleObject(target) &&
    (target.sniptaleType === 'source-image' || target.sniptaleType === 'background')
  );
}
