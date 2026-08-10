import type { TranslationKey } from '../../../../../platform/i18n';
import type { ImageFormat } from './controller';

interface FormatOption {
  value: ImageFormat;
  labelKey: TranslationKey;
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'png',
    labelKey: 'imageSettings.section.formatPngLabel',
  },
  {
    value: 'jpeg',
    labelKey: 'imageSettings.section.formatJpegLabel',
  },
  {
    value: 'webp',
    labelKey: 'imageSettings.section.formatWebpLabel',
  },
];
