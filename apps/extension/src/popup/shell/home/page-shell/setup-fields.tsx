import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { CaptureActionType, ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n/popup';
import { openSettingsPage } from '../../../../platform/navigation/extension-pages';
import { InlineCurtainSelect } from '../../../../ui/popup-shell/inline-curtain/select';
import type { InlineCurtainOption } from '../../../../ui/popup-shell/inline-curtain/options';
import { getAllowedQuickActionAfterCaptureActions } from '../../../../features/quick-actions-presets/policy';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../features/viewport-presets/format';
import { orderViewportPresetsForSelector } from '../../../../features/viewport-presets/operations';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import { ImageEditorIcon, ScenarioEditorIcon } from '@sniptale/ui/editor-chrome';
import { Copy, Download, FolderOpen, Images, Save } from 'lucide-react';

const captureActions: CaptureActionType[] = [
  'download_default',
  'ask_preset',
  'ask_system',
  'edit',
  'copy',
  'scenario',
  'save_to_library',
];

const actionIcons: Record<CaptureActionType, NonNullable<InlineCurtainOption['icon']>> = {
  download_default: Download,
  ask_preset: FolderOpen,
  ask_system: Save,
  edit: ImageEditorIcon,
  copy: Copy,
  scenario: ScenarioEditorIcon,
  save_to_library: Images,
};

const actionKeys: Record<CaptureActionType, Parameters<typeof translate>[0]> = {
  download_default: 'settings.quickActions.afterCaptureDownloadDefault',
  ask_preset: 'popup.home.captureChooseFolderLabel',
  ask_system: 'settings.quickActions.afterCaptureAskSystem',
  edit: 'settings.quickActions.afterCaptureEdit',
  copy: 'settings.quickActions.afterCaptureCopy',
  scenario: 'settings.quickActions.afterCaptureScenario',
  save_to_library: 'settings.quickActions.afterCaptureSaveToLibrary',
};

function settingOptions(values: ReadonlyArray<InlineCurtainOption>): InlineCurtainOption[] {
  return values.map((option) => ({ ...option }));
}

type CaptureFieldProps = {
  config: ScreenshotCaptureConfig;
  patch(value: Partial<ScreenshotCaptureConfig>): void;
};

export function TabCaptureAreaField(props: CaptureFieldProps) {
  return (
    <InlineCurtainSelect
      value={props.config.screenshotMode}
      label={translate('popup.home.captureAreaLabel')}
      ariaLabel={translate('popup.home.captureAreaLabel')}
      description={translate('popup.home.captureAreaDescription')}
      options={settingOptions([
        { value: 'visible', label: translate('settings.quickActions.screenshotModeVisible') },
        { value: 'full', label: translate('settings.quickActions.screenshotModeFull') },
        {
          value: 'selection',
          label: translate('settings.quickActions.screenshotModeSelection'),
        },
      ])}
      onChange={(value) =>
        props.patch({ screenshotMode: value as ScreenshotCaptureConfig['screenshotMode'] })
      }
    />
  );
}

export function TabCaptureSizeField(
  props: CaptureFieldProps & { viewportPresets: ViewportPreset[] }
) {
  const viewportOptions = settingOptions([
    { value: '', label: translate('viewportPresets.section.nativeOption') },
    ...orderViewportPresetsForSelector(props.viewportPresets)
      .filter((item) => item.enabled)
      .map((item) => ({
        value: item.id,
        label: getViewportPresetDisplayName(item),
        meta: formatViewportPresetDimensions(item.width, item.height),
        group: translate('viewportPresets.groups.window'),
      })),
  ]);

  return (
    <InlineCurtainSelect
      value={props.config.viewportPresetId ?? ''}
      label={translate('popup.home.captureSizeLabel')}
      ariaLabel={translate('popup.home.captureSizeLabel')}
      description={translate('popup.home.captureSizeDescription')}
      options={viewportOptions}
      onChange={(value) => props.patch({ viewportPresetId: value || null })}
      optionsFooter={<ManageSizePresetsButton />}
    />
  );
}

export function TabCaptureCountdownField(props: CaptureFieldProps) {
  return (
    <InlineCurtainSelect
      value={props.config.delay === null ? '' : String(props.config.delay)}
      label={translate('popup.home.captureCountdownLabel')}
      ariaLabel={translate('popup.home.captureCountdownLabel')}
      description={translate('popup.home.captureCountdownDescription')}
      options={settingOptions([
        { value: '', label: translate('popup.home.captureCountdownOff') },
        ...([3, 5, 10] as const).map((value) => ({
          value: String(value),
          label: `${value} ${translate('settings.quickActions.delayShortSuffix')}`,
        })),
      ])}
      onChange={(value) =>
        props.patch({
          delay: value === '' ? null : (Number(value) as ScreenshotCaptureConfig['delay']),
        })
      }
    />
  );
}

export function AfterCaptureField(props: CaptureFieldProps) {
  const allowed = getAllowedQuickActionAfterCaptureActions(props.config);

  return (
    <InlineCurtainSelect
      value={props.config.afterCapture}
      label={translate('settings.quickActions.afterCaptureLabel')}
      ariaLabel={translate('settings.quickActions.afterCaptureLabel')}
      description={translate('popup.home.afterCaptureDescription')}
      options={captureActions
        .filter((value) => !allowed || allowed.has(value))
        .map((value) => ({ value, label: translate(actionKeys[value]), icon: actionIcons[value] }))}
      onChange={(value) => props.patch({ afterCapture: value as CaptureActionType })}
    />
  );
}

export function ImageQualityField(props: CaptureFieldProps) {
  if (props.config.afterCapture === 'copy') return null;
  return (
    <InlineCurtainSelect
      value={props.config.imageFormat ?? ''}
      selectedLabel={getImageQualitySummary(props.config)}
      label={translate('popup.home.captureQualityLabel')}
      ariaLabel={translate('popup.home.captureQualityAria')}
      description={translate('popup.home.captureQualityDescription')}
      options={[]}
      optionsPanel={<ImageQualityPanel config={props.config} patch={props.patch} />}
      onChange={() => undefined}
    />
  );
}

function ManageSizePresetsButton() {
  return (
    <button
      type="button"
      className={[
        'min-h-8 w-full rounded-[8px] border border-[var(--sniptale-color-border-soft)] px-2',
        'text-xs font-medium text-[var(--sniptale-color-text-secondary)] transition-colors',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
        'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      onClick={() => void openSettingsPage({ route: { section: 'screen-sizes' } })}
    >
      {translate('popup.home.manageSizePresets')}
    </button>
  );
}

const imageFormats = [
  { value: '', labelKey: 'settings.quickActions.followSettingsPlaceholder' },
  { value: 'png', labelKey: 'imageSettings.section.formatPngLabel' },
  { value: 'jpeg', labelKey: 'imageSettings.section.formatJpegLabel' },
  { value: 'webp', labelKey: 'imageSettings.section.formatWebpLabel' },
] as const;
const imageFormatOptionActiveClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');
const imageFormatOptionIdleClassName = [
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

function ImageQualityPanel(props: {
  config: ScreenshotCaptureConfig;
  patch(value: Partial<ScreenshotCaptureConfig>): void;
}) {
  const isLossy = props.config.imageFormat === 'jpeg' || props.config.imageFormat === 'webp';
  const quality = props.config.imageQuality ?? 90;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="px-0.5 text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
          {translate('popup.home.captureFormatLabel')}
        </div>
        <div className="grid gap-1">
          {imageFormats.map((format) => {
            const active = (props.config.imageFormat ?? '') === format.value;
            return (
              <button
                key={format.value}
                type="button"
                className={[
                  'min-h-7 rounded-[7px] px-2 text-left text-xs font-medium transition-colors',
                  active ? imageFormatOptionActiveClassName : imageFormatOptionIdleClassName,
                ].join(' ')}
                onClick={() =>
                  props.patch({
                    imageFormat: (format.value || null) as ScreenshotCaptureConfig['imageFormat'],
                    imageQuality:
                      format.value === 'jpeg' || format.value === 'webp' ? quality : null,
                  })
                }
              >
                {translate(format.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      {isLossy ? (
        <label className="grid gap-2 px-0.5 text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
          <span className="flex items-center justify-between gap-2">
            <span>{translate('popup.home.captureQualityLabel')}</span>
            <span className="tabular-nums text-[var(--sniptale-color-text-primary)]">
              {quality}%
            </span>
          </span>
          <ProductRange
            min="10"
            max="100"
            step="5"
            value={quality}
            aria-label={translate('popup.home.captureQualityAria')}
            onChange={(event) => props.patch({ imageQuality: Number(event.currentTarget.value) })}
          />
        </label>
      ) : null}
    </div>
  );
}

function getImageQualitySummary(config: ScreenshotCaptureConfig): string {
  if (config.imageFormat === null) {
    return translate('settings.quickActions.followSettingsPlaceholder');
  }
  const format = config.imageFormat.toUpperCase();
  return config.imageFormat === 'png' || config.imageQuality === null
    ? format
    : `${format} · ${config.imageQuality}%`;
}
