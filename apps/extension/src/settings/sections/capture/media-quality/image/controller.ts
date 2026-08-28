import { useEffect, useRef, useState } from 'react';

import { useSettingsStore } from '../../../../runtime/store/useSettingsStore';
import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  parseFullPageQualityPolicy,
  resolveFullPageQualityProfile,
  type FullPageQualityPolicy,
  type FullPageQualityProfile,
} from '../../../../../contracts/full-page-capture';
import type { TranslationKey } from '../../../../../platform/i18n';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export function useImageSettingsSection() {
  const { settings, updateSettings, isLoading } = useSettingsStore();
  const [imageFormat, setImageFormat] = useState<ImageFormat>(settings.imageFormat || 'png');
  const [imageQuality, setImageQuality] = useState(settings.imageQuality || 100);
  const persistedQualityRef = useRef(settings.imageQuality || 100);
  const [fullPageQuality, setFullPageQuality] = useState<FullPageQualityPolicy>(() => ({
    ...(settings.fullPageQuality ?? DEFAULT_FULL_PAGE_QUALITY_POLICY),
  }));
  const [fullPageQualityError, setFullPageQualityError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    setImageFormat(settings.imageFormat || 'png');
    setImageQuality(settings.imageQuality || 100);
    persistedQualityRef.current = settings.imageQuality || 100;
    setFullPageQuality({ ...(settings.fullPageQuality ?? DEFAULT_FULL_PAGE_QUALITY_POLICY) });
    setFullPageQualityError(null);
  }, [settings]);

  const persistFullPageQuality = async (candidate: FullPageQualityPolicy) => {
    const parsed = parseFullPageQualityPolicy(candidate);
    if (!parsed) {
      setFullPageQualityError('imageSettings.section.fullPageInvalidValue');
      return;
    }
    const previous = fullPageQuality;
    setFullPageQuality(parsed);
    setFullPageQualityError(null);
    try {
      await updateSettings({ fullPageQuality: parsed });
    } catch {
      setFullPageQuality(previous);
      setFullPageQualityError('imageSettings.section.fullPageSaveFailed');
    }
  };

  return {
    imageFormat,
    imageQuality,
    fullPage: {
      error: fullPageQualityError,
      policy: fullPageQuality,
      handleProfileChange: (profile: FullPageQualityProfile) => {
        const next =
          profile === 'custom'
            ? { ...fullPageQuality, profile }
            : resolveFullPageQualityProfile(profile);
        void persistFullPageQuality(next);
      },
      handleValuePreview: (
        field: 'maxFileSizeMiB' | 'maxMegapixels' | 'minScalePercent',
        value: number
      ) => {
        setFullPageQuality({ ...fullPageQuality, [field]: value, profile: 'custom' });
        setFullPageQualityError(null);
      },
      handleValueCommit: (
        field: 'maxFileSizeMiB' | 'maxMegapixels' | 'minScalePercent',
        value: number
      ) => void persistFullPageQuality({ ...fullPageQuality, [field]: value, profile: 'custom' }),
      handleReset: () => void persistFullPageQuality({ ...DEFAULT_FULL_PAGE_QUALITY_POLICY }),
    },
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
