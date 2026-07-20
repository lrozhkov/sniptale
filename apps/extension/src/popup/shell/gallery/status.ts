import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import {
  getStorageEstimateInfo,
  type StoragePressureLevel,
} from '../../../features/media-hub/storage-capacity';

type GalleryStatusSetter = Dispatch<
  SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
>;
const logger = createLogger({ namespace: 'PopupGalleryStatus' });

export function useGalleryStatusUpdater(setGalleryStatus: GalleryStatusSetter) {
  return useCallback(async () => {
    try {
      const estimate = await getStorageEstimateInfo();
      setGalleryStatus({
        text:
          estimate.quota > 0
            ? `${translate('popup.common.galleryStatusUsedPrefix')} ${formatBytes(estimate.usage)}`
            : translate('popup.common.galleryStatusUnavailable'),
        pressure: estimate.pressure,
      });
    } catch (error) {
      logger.error('Failed to resolve gallery storage status', error);
      setGalleryStatus(null);
    }
  }, [setGalleryStatus]);
}
