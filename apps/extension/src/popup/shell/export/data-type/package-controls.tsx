import { Check, Globe2, Library, Package, PanelsTopLeft } from 'lucide-react';

import { translate } from '../../../../platform/i18n/popup';
import type { PopupPagePackagePreferenceState } from '../session/types';
import { getExportOptionConfigs, setExportOptionActive } from './options/data';
import { cx } from '../selection/utils';

export type PopupPackageDestination = 'export' | 'save';

const presetHeadingClassName = [
  'text-[10px] font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');
const selectedPresetClassName = [
  'border-[var(--sniptale-color-accent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');
const unselectedPresetClassName = [
  'border-[var(--sniptale-color-border-soft)]',
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');
const activeWebCopyCardClassName = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_55%,var(--sniptale-color-border-soft))]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_8%,transparent)]',
].join(' ');
const webCopyIconSurfaceClassName = [
  'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px]',
  'bg-[var(--sniptale-color-surface-canvas)]',
].join(' ');
const requiredBadgeClassName = [
  'text-[9px] font-semibold uppercase tracking-[0.06em]',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

export function PackageDestinationSwitch(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onChange: (destination: PopupPackageDestination) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 rounded-[11px] bg-[var(--sniptale-color-surface-canvas)] p-1"
      aria-label={translate('popup.export.packageDestinationLabel')}
    >
      {(['export', 'save'] as const).map((destination) => {
        const active = props.destination === destination;
        const Icon = destination === 'export' ? Package : Library;
        return (
          <button
            key={destination}
            type="button"
            disabled={props.disabled}
            aria-pressed={active}
            onClick={() => props.onChange(destination)}
            className={cx(
              'flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[11px] font-medium',
              'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
              active
                ? 'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)] shadow-sm'
                : 'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {translate(
              destination === 'export'
                ? 'popup.export.packageDestinationDownload'
                : 'popup.export.packageDestinationLibrary'
            )}
          </button>
        );
      })}
    </div>
  );
}

function setAllArtifacts(
  preferences: PopupPagePackagePreferenceState,
  nextValue: boolean,
  destination: PopupPackageDestination
) {
  const toggles = { ...preferences.values, ...preferences.actions, disabled: false };
  for (const option of getExportOptionConfigs()) {
    if (destination === 'save' && option.key === 'pageDiagnostics') continue;
    setExportOptionActive(option.key, nextValue, toggles);
  }
  if (destination === 'save') {
    preferences.actions.setIncludeFullPageScreenshot(true);
    preferences.actions.setIncludePageDiagnostics(false);
  }
}

function applyPreset(
  preset: 'full' | 'materials' | 'web-copy',
  destination: PopupPackageDestination,
  preferences: PopupPagePackagePreferenceState
) {
  if (preset === 'web-copy') {
    preferences.setIncludeWebCopy(true);
    setAllArtifacts(preferences, false, destination);
    return;
  }
  if (preset === 'materials') {
    preferences.setIncludeWebCopy(false);
    setAllArtifacts(preferences, false, destination);
    preferences.actions.setIncludeJson(true);
    preferences.actions.setIncludeMarkdown(true);
    preferences.actions.setIncludeFiles(true);
    preferences.actions.setIncludeImages(true);
    return;
  }

  preferences.setIncludeWebCopy(true);
  setAllArtifacts(preferences, true, destination);
  if (destination === 'save') preferences.setIncludeWebCopy(true);
}

function getPreset(
  destination: PopupPackageDestination,
  preferences: PopupPagePackagePreferenceState
): 'custom' | 'full' | 'materials' | 'web-copy' {
  const values = Object.values(preferences.values);
  const webCopyOnlyValues =
    destination === 'export'
      ? values
      : [
          preferences.values.includeAnnotations,
          preferences.values.includeBasicLogs,
          preferences.values.includeCssDiagnostics,
          preferences.values.includeFiles,
          preferences.values.includeImages,
          preferences.values.includeJson,
          preferences.values.includeMarkdown,
        ];
  const presetValues =
    destination === 'export'
      ? values
      : [
          preferences.values.includeAnnotations,
          preferences.values.includeBasicLogs,
          preferences.values.includeCssDiagnostics,
          preferences.values.includeFiles,
          preferences.values.includeFullPageScreenshot,
          preferences.values.includeImages,
          preferences.values.includeJson,
          preferences.values.includeMarkdown,
        ];
  if (preferences.includeWebCopy && webCopyOnlyValues.every((value) => !value)) {
    return 'web-copy';
  }
  if (preferences.includeWebCopy && presetValues.every(Boolean)) return 'full';
  if (
    destination === 'export' &&
    !preferences.includeWebCopy &&
    preferences.values.includeJson &&
    preferences.values.includeMarkdown &&
    preferences.values.includeFiles &&
    preferences.values.includeImages &&
    !preferences.values.includeAnnotations &&
    !preferences.values.includeBasicLogs &&
    !preferences.values.includeCssDiagnostics &&
    !preferences.values.includeFullPageScreenshot &&
    !preferences.values.includePageDiagnostics
  ) {
    return 'materials';
  }
  return 'custom';
}

function getPresetLabelKey(preset: ReturnType<typeof getPreset>) {
  switch (preset) {
    case 'web-copy':
      return 'popup.export.packagePresetWebCopy' as const;
    case 'materials':
      return 'popup.export.packagePresetMaterials' as const;
    case 'full':
      return 'popup.export.packagePresetFull' as const;
    case 'custom':
      return 'popup.export.packagePresetCustom' as const;
  }
}

export function PackagePresetControls(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onRequestSetup: () => void;
  preferences: PopupPagePackagePreferenceState;
  webSnapshotEnabled: boolean;
}) {
  const activePreset = getPreset(props.destination, props.preferences);
  const presets = [
    ['web-copy', 'popup.export.packagePresetWebCopy'],
    ...(props.destination === 'export'
      ? ([['materials', 'popup.export.packagePresetMaterials']] as const)
      : []),
    ['full', 'popup.export.packagePresetFull'],
  ] as const;

  return (
    <div className="pb-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={presetHeadingClassName}>
          {translate('popup.export.packagePresetLabel')}
        </span>
        <span className="text-[10px] text-[var(--sniptale-color-text-dim)]">
          {translate(getPresetLabelKey(activePreset))}
        </span>
      </div>
      <div
        className={cx(
          'grid gap-1.5',
          props.destination === 'export' ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {presets.map(([preset, labelKey]) => (
          <button
            key={preset}
            type="button"
            disabled={props.disabled}
            aria-pressed={activePreset === preset}
            onClick={() => {
              if (preset !== 'materials' && !props.webSnapshotEnabled) {
                props.onRequestSetup();
                return;
              }
              applyPreset(preset, props.destination, props.preferences);
            }}
            className={cx(
              'min-h-8 rounded-[9px] border px-1.5 py-1 text-[10px] font-medium transition-colors',
              activePreset === preset ? selectedPresetClassName : unselectedPresetClassName
            )}
          >
            {translate(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WebCopyPackageCard(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  onRequestSetup: () => void;
  preferences: PopupPagePackagePreferenceState;
  webSnapshotEnabled: boolean;
}) {
  const mandatory = props.destination === 'save';
  const active = props.preferences.includeWebCopy;
  const handleClick = () => {
    if (props.disabled) return;
    if (mandatory) {
      if (!props.webSnapshotEnabled) props.onRequestSetup();
      return;
    }
    if (active) {
      props.preferences.setIncludeWebCopy(false);
      return;
    }
    if (!props.webSnapshotEnabled) {
      props.onRequestSetup();
      return;
    }
    props.preferences.setIncludeWebCopy(true);
  };

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={handleClick}
      data-ui="popup.export.web-copy-card"
      className={cx(
        'mb-2 flex w-full items-start gap-2.5 rounded-[11px] border p-2.5 text-left transition-colors',
        active
          ? activeWebCopyCardClassName
          : 'border-[var(--sniptale-color-border-soft)] hover:border-[var(--sniptale-color-accent)]'
      )}
    >
      <span className={webCopyIconSurfaceClassName}>
        {active ? (
          <Check className="h-4 w-4 text-[var(--sniptale-color-accent)]" />
        ) : (
          <Globe2 className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--sniptale-color-text-primary)]">
          {translate('popup.export.packageWebCopyLabel')}
          {mandatory ? (
            <span className={requiredBadgeClassName}>
              {translate('popup.export.packageWebCopyRequired')}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {translate(
            !props.webSnapshotEnabled
              ? 'popup.export.packageWebCopyDisabledDescription'
              : 'popup.export.packageWebCopyDescription'
          )}
        </span>
      </span>
      <PanelsTopLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--sniptale-color-text-dim)]" />
    </button>
  );
}
