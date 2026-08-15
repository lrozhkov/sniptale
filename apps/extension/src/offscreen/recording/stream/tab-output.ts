import {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
  type TabOutputGeometry,
} from '../geometry/tab-source';
import { createCropOutputStream, type CropOutputStream } from './crop-stream';

export {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  remapTabOutputGeometryFromObservedViewport,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
};
export type { TabOutputGeometry };

export function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number } = {}
): Promise<CropOutputStream> {
  return createCropOutputStream(sourceStream, geometry, options);
}
