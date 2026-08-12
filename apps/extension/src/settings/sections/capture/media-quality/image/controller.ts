import { useEffect, useRef, useState } from 'react';

import { useSettingsStore } from '../../../../runtime/store/useSettingsStore';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export function useImageSettingsSection() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [imageFormat, setImageFormat] = useState<ImageFormat>(settings.imageFormat || 'png');
  const [imageQuality, setImageQuality] = useState(settings.imageQuality || 100);
  const persistedQualityRef = useRef(settings.imageQuality || 100);

  useEffect(() => {
    setImageFormat(settings.imageFormat || 'png');
    setImageQuality(settings.imageQuality || 100);
    persistedQualityRef.current = settings.imageQuality || 100;
  }, [settings]);

  return {
    imageFormat,
    imageQuality,
    isLoading,
    isQualityDisabled: imageFormat === 'png',
    handleFormatChange: async (format: ImageFormat) => {
      const previousFormat = imageFormat;
      setImageFormat(format);
      try {
        await updateSettings({ imageFormat: format });
      } catch {
        setImageFormat(previousFormat);
      }
    },
    handleQualityPreview: (quality: number) => {
      setImageQuality(quality);
    },
    handleQualityCommit: async (quality: number) => {
      const previousQuality = persistedQualityRef.current;
      setImageQuality(quality);
      if (quality === previousQuality) {
        return;
      }
      try {
        await updateSettings({ imageQuality: quality });
        persistedQualityRef.current = quality;
      } catch {
        setImageQuality(previousQuality);
      }
    },
  };
}
