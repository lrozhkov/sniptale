import type { TranslationKey } from '../../../platform/i18n';
import type { ImageFormat } from './controller';

interface FormatOption {
  value: ImageFormat;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'png',
    labelKey: 'imageSettings.section.formatPngLabel',
    descriptionKey: 'imageSettings.section.formatPngDescription',
  },
  {
    value: 'jpeg',
    labelKey: 'imageSettings.section.formatJpegLabel',
    descriptionKey: 'imageSettings.section.formatJpegDescription',
  },
  {
    value: 'webp',
    labelKey: 'imageSettings.section.formatWebpLabel',
    descriptionKey: 'imageSettings.section.formatWebpDescription',
  },
];
