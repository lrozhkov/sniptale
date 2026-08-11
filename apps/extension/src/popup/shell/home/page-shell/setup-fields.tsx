import type { ReactNode } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { CaptureActionType, ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { getAllowedQuickActionAfterCaptureActions } from '../../../../features/quick-actions-presets/policy';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../features/viewport-presets/format';

const captureActions: CaptureActionType[] = [
  'download_default',
  'ask_preset',
  'ask_system',
  'edit',
  'copy',
  'scenario',
  'save_to_library',
];
const actionKeys: Record<CaptureActionType, Parameters<typeof translate>[0]> = {
  download_default: 'settings.quickActions.afterCaptureDownloadDefault',
  ask_preset: 'settings.quickActions.afterCaptureAskPreset',
  ask_system: 'settings.quickActions.afterCaptureAskSystem',
  edit: 'settings.quickActions.afterCaptureEdit',
  copy: 'settings.quickActions.afterCaptureCopy',
  scenario: 'settings.quickActions.afterCaptureScenario',
  save_to_library: 'settings.quickActions.afterCaptureSaveToLibrary',
};

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label
      className={[
        'grid gap-1.5 text-[11px] font-medium',
        'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function TabCaptureFields(props: {
  config: ScreenshotCaptureConfig;
  viewportPresets: ViewportPreset[];
  patch(value: Partial<ScreenshotCaptureConfig>): void;
}) {
  const viewportOptions = [
    { value: '', label: translate('viewportPresets.section.nativeOption') },
    ...props.viewportPresets
      .filter((item) => item.enabled)
      .map((item) => ({
        value: item.id,
        label: `${getViewportPresetDisplayName(item)} (${formatViewportPresetDimensions(
          item.width,
          item.height
        )})`,
      })),
  ];
  return (
    <>
      <Field label={translate('settings.quickActions.screenshotModeLabel')}>
        <ProductSelect
          controlSize="sm"
          value={props.config.screenshotMode}
          onChange={(value) =>
            props.patch({ screenshotMode: value as ScreenshotCaptureConfig['screenshotMode'] })
          }
          options={[
            { value: 'visible', label: translate('settings.quickActions.screenshotModeVisible') },
            { value: 'full', label: translate('settings.quickActions.screenshotModeFull') },
            {
              value: 'selection',
              label: translate('settings.quickActions.screenshotModeSelection'),
            },
          ]}
        />
      </Field>
      <Field label={translate('settings.quickActions.screenEmulationLabel')}>
        <ProductSelect
          controlSize="sm"
          value={props.config.viewportPresetId ?? ''}
          onChange={(value) => props.patch({ viewportPresetId: value || null })}
          options={viewportOptions}
        />
      </Field>
      <Field label={translate('settings.quickActions.delayLabel')}>
        <ProductSelect
          controlSize="sm"
          value={props.config.delay === null ? '' : String(props.config.delay)}
          onChange={(value) =>
            props.patch({
              delay: value === '' ? null : (Number(value) as ScreenshotCaptureConfig['delay']),
            })
          }
          options={[
            { value: '', label: translate('settings.quickActions.delayNone') },
            ...([3, 5, 10] as const).map((value) => ({
              value: String(value),
              label: `${value} ${translate('settings.quickActions.delayShortSuffix')}`,
            })),
          ]}
        />
      </Field>
    </>
  );
}

export function OutputFields(props: {
  config: ScreenshotCaptureConfig;
  patch(value: Partial<ScreenshotCaptureConfig>): void;
}) {
  const allowed = getAllowedQuickActionAfterCaptureActions(props.config);
  const showEncoding = props.config.afterCapture !== 'copy';
  return (
    <>
      <Field label={translate('settings.quickActions.afterCaptureLabel')}>
        <ProductSelect
          controlSize="sm"
          value={props.config.afterCapture}
          onChange={(value) => props.patch({ afterCapture: value as CaptureActionType })}
          options={captureActions
            .filter((value) => !allowed || allowed.has(value))
            .map((value) => ({ value, label: translate(actionKeys[value]) }))}
        />
      </Field>
      {showEncoding ? (
        <Field label={translate('settings.quickActions.imageFormatLabel')}>
          <ProductSelect
            controlSize="sm"
            value={props.config.imageFormat ?? ''}
            onChange={(value) =>
              props.patch({
                imageFormat: (value || null) as ScreenshotCaptureConfig['imageFormat'],
              })
            }
            options={[
              { value: '', label: translate('settings.quickActions.followSettingsPlaceholder') },
              { value: 'png', label: translate('imageSettings.section.formatPngLabel') },
              { value: 'jpeg', label: translate('imageSettings.section.formatJpegLabel') },
              { value: 'webp', label: translate('imageSettings.section.formatWebpLabel') },
            ]}
          />
        </Field>
      ) : null}
      {showEncoding ? (
        <Field label={translate('settings.quickActions.qualityLabel')}>
          <ProductSelect
            controlSize="sm"
            disabled={!props.config.imageFormat || props.config.imageFormat === 'png'}
            value={props.config.imageQuality === null ? '' : String(props.config.imageQuality)}
            onChange={(value) => props.patch({ imageQuality: value === '' ? null : Number(value) })}
            options={[
              { value: '', label: translate('settings.quickActions.followSettingsPlaceholder') },
              ...[100, 90, 80, 70, 60].map((value) => ({
                value: String(value),
                label: `${value}%`,
              })),
            ]}
          />
        </Field>
      ) : null}
    </>
  );
}
