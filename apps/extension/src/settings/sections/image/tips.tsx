import { translate } from '../../../platform/i18n';

const imageSettingsTipCardClassName = [
  'mt-6 rounded-lg border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_24%,var(--sniptale-color-border-soft)_76%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_8%,transparent)] p-4',
].join(' ');

export function ImageSettingsSectionTips() {
  return (
    <div className={imageSettingsTipCardClassName}>
      <h4 className="mb-2 text-sm font-medium text-[var(--sniptale-color-info)]">
        {translate('imageSettings.section.tipTitle')}
      </h4>
      <ul className="space-y-1.5 text-xs text-[var(--sniptale-color-text-muted)]">
        <li>
          • <strong>{translate('imageSettings.section.formatPngLabel')}</strong> -{' '}
          {translate('imageSettings.section.tipPng')}
        </li>
        <li>
          • <strong>{translate('imageSettings.section.formatJpegLabel')}</strong> -{' '}
          {translate('imageSettings.section.tipJpeg')}
        </li>
        <li>
          • <strong>{translate('imageSettings.section.formatWebpLabel')}</strong> -{' '}
          {translate('imageSettings.section.tipWebp')}
        </li>
        <li>• {translate('imageSettings.section.tipQuality')}</li>
      </ul>
    </div>
  );
}
