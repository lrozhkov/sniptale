import { useEffect, useRef, useState } from 'react';

import { useSettingsStore } from '../../../../runtime/store/useSettingsStore';
import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
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
  const [fullImage, setFullImage] = useState(() => ({
    imageFormat: settings.fullPageImage?.imageFormat ?? settings.imageFormat ?? 'png',
    imageQuality: settings.fullPageImage?.imageQuality ?? settings.imageQuality ?? 100,
  }));
  const persistedFullQuality = useRef(fullImage.imageQuality);
  const [fullCapture, setFullCapture] = useState<FullPageCapturePreferences>(() => ({
    ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
    ...settings.fullPageCapture,
  }));
  const [fullPageQuality, setFullPageQuality] = useState<FullPageQualityPolicy>(() => ({
    ...(settings.fullPageQuality ?? DEFAULT_FULL_PAGE_QUALITY_POLICY),
  }));
  const [fullPageQualityError, setFullPageQualityError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    setImageFormat(settings.imageFormat || 'png');
    setImageQuality(settings.imageQuality || 100);
    persistedQualityRef.current = settings.imageQuality || 100;
    setFullImage({
      imageFormat: settings.fullPageImage?.imageFormat ?? settings.imageFormat ?? 'png',
      imageQuality: settings.fullPageImage?.imageQuality ?? settings.imageQuality ?? 100,
    });
    persistedFullQuality.current =
      settings.fullPageImage?.imageQuality ?? settings.imageQuality ?? 100;
    setFullCapture({ ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES, ...settings.fullPageCapture });
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
    fullImage: {
      ...fullImage,
      handleFormatChange: async (imageFormat: ImageFormat) => {
        const previous = fullImage;
        setFullImage({ ...fullImage, imageFormat });
        try {
          await updateSettings({ fullPageImage: { imageFormat } });
        } catch {
          setFullImage(previous);
          setFullPageQualityError('imageSettings.section.fullPageSaveFailed');
        }
      },
      handleQualityPreview: (imageQuality: number) => setFullImage({ ...fullImage, imageQuality }),
      handleQualityCommit: async (imageQuality: number) => {
        setFullImage({ ...fullImage, imageQuality });
        if (imageQuality === persistedFullQuality.current) return;
        try {
          await updateSettings({ fullPageImage: { imageQuality } });
          persistedFullQuality.current = imageQuality;
        } catch {
          setFullImage({ ...fullImage, imageQuality: persistedFullQuality.current });
          setFullPageQualityError('imageSettings.section.fullPageSaveFailed');
        }
      },
    },
    fullCapture: {
      preferences: fullCapture,
      update: async (patch: Partial<FullPageCapturePreferences>) => {
        const previous = fullCapture;
        setFullCapture({ ...fullCapture, ...patch });
        try {
          await updateSettings({ fullPageCapture: patch });
        } catch {
          setFullCapture(previous);
          setFullPageQualityError('imageSettings.section.fullPageSaveFailed');
        }
      },
    },
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
