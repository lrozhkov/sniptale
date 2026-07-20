import type { StoragePressureLevel } from '../../../../../features/media-hub/storage-capacity';

export interface GalleryStatus {
  text: string;
  pressure: StoragePressureLevel;
}
