import {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
  type TabOutputGeometry,
} from '../geometry/tab-source';
import { createGatedCropStream, type GatedCropStream } from './crop-stream';

export {
  isSameTabOutputGeometry,
  remapTabOutputGeometry,
  resolveTabOutputGeometry,
  revalidateTabOutputGeometry,
};
export type { TabOutputGeometry };

export function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number; initiallySuspended?: boolean } = {}
): Promise<GatedCropStream> {
  return createGatedCropStream(sourceStream, geometry, options);
}
