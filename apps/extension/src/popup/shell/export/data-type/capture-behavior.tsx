import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
} from '../../../../contracts/full-page-capture';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n/popup';
import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  EXPORT_RESOURCE_LIMITS_ABSOLUTE,
  type ExportResourceLimits,
} from '@sniptale/runtime-contracts/export';

export function usePackageCaptureBehaviorPreferences() {
  const [preferences, setPreferences] = useState<FullPageCapturePreferences>({
    ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  });
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const limitsRevisionRef = useRef(0);
  const [resourceLimits, setResourceLimits] = useState<ExportResourceLimits>({
    ...DEFAULT_EXPORT_RESOURCE_LIMITS,
  });
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void loadSettings()
      .then((settings) => {
        if (active && revisionRef.current === 0) {
          setPreferences(settings.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES);
        }
        if (active && limitsRevisionRef.current === 0) {
          setResourceLimits(settings.exportResourceLimits);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, []);
  const update = (next: FullPageCapturePreferences) => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setPreferences(next);
    void patchSettings({ fullPageCapture: next }).catch(() => {
      void loadSettings()
        .then((settings) => {
          if (mountedRef.current && revisionRef.current === revision) {
            setPreferences(settings.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES);
          }
        })
        .catch(() => undefined);
    });
  };
  const updateResourceLimits = (next: ExportResourceLimits) => {
    const revision = limitsRevisionRef.current + 1;
    limitsRevisionRef.current = revision;
    setResourceLimits(next);
    void patchSettings({ exportResourceLimits: next }).catch(() => {
      void loadSettings()
        .then((settings) => {
          if (mountedRef.current && limitsRevisionRef.current === revision) {
            setResourceLimits(settings.exportResourceLimits);
          }
        })
        .catch(() => undefined);
    });
  };
  return { preferences, resourceLimits, update, updateResourceLimits };
}

function ToggleRow(props: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 py-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--sniptale-color-accent)]"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {props.description}
        </span>
      </span>
    </label>
  );
}

export function PackageCaptureBehaviorSettings(props: {
  preferences: FullPageCapturePreferences;
  onChange: (preferences: FullPageCapturePreferences) => void;
  resourceLimits: ExportResourceLimits;
  onResourceLimitsChange: (limits: ExportResourceLimits) => void;
}) {
  return (
    <div
      className={[
        'min-h-0 overflow-y-auto divide-y pr-1',
        'divide-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_60%,transparent)]',
      ].join(' ')}
    >
      <ToggleRow
        checked={props.preferences.preloadLazyContent}
        label={translate('popup.export.captureLazyContentLabel')}
        description={translate('popup.export.captureLazyContentDescription')}
        onChange={(preloadLazyContent) =>
          props.onChange({ ...props.preferences, preloadLazyContent })
        }
      />
      <ToggleRow
        checked={props.preferences.freezeMotion}
        label={translate('popup.export.captureFreezeMotionLabel')}
        description={translate('popup.export.captureFreezeMotionDescription')}
        onChange={(freezeMotion) => props.onChange({ ...props.preferences, freezeMotion })}
      />
      <label className="flex items-start justify-between gap-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-[var(--sniptale-color-text-primary)]">
            {translate('popup.export.captureFloatingElementsLabel')}
          </span>
          <span className="mt-0.5 block text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
            {translate('popup.export.captureFloatingElementsDescription')}
          </span>
        </span>
        <select
          className="h-8 shrink-0 rounded-[8px] border bg-transparent px-2 text-[11px]"
          value={props.preferences.floatingElements}
          onChange={(event) =>
            props.onChange({
              ...props.preferences,
              floatingElements: event.currentTarget
                .value as FullPageCapturePreferences['floatingElements'],
            })
          }
        >
          <option value="once">{translate('popup.export.captureFloatingOnce')}</option>
          <option value="hide">{translate('popup.export.captureFloatingHide')}</option>
          <option value="repeat">{translate('popup.export.captureFloatingRepeat')}</option>
        </select>
      </label>
      <p className="py-2.5 text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
        {translate('popup.export.captureBehaviorHelp')}
      </p>
      <div className="py-2.5">
        <div className="text-[11px] font-medium text-[var(--sniptale-color-text-primary)]">
          {translate('popup.export.resourceLimitsTitle')}
        </div>
        <p className="mt-0.5 text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {translate('popup.export.resourceLimitsDescription')}
        </p>
        <ResourceLimitSelect
          label={translate('popup.export.resourceLimitCountLabel')}
          value={props.resourceLimits.maxFileCount}
          values={[10, 20, 30, 50, EXPORT_RESOURCE_LIMITS_ABSOLUTE.maxFileCount]}
          onChange={(maxFileCount) =>
            props.onResourceLimitsChange({ ...props.resourceLimits, maxFileCount })
          }
        />
        <ResourceLimitSelect
          label={translate('popup.export.resourceLimitFileSizeLabel')}
          value={props.resourceLimits.maxFileSizeMiB}
          values={[10, 20, 30, 50, EXPORT_RESOURCE_LIMITS_ABSOLUTE.maxFileSizeMiB]}
          suffix={translate('popup.export.resourceLimitMiB')}
          onChange={(maxFileSizeMiB) =>
            props.onResourceLimitsChange({ ...props.resourceLimits, maxFileSizeMiB })
          }
        />
        <ResourceLimitSelect
          label={translate('popup.export.resourceLimitTotalSizeLabel')}
          value={props.resourceLimits.maxTotalSizeMiB}
          values={[50, 100, 150, EXPORT_RESOURCE_LIMITS_ABSOLUTE.maxTotalSizeMiB]}
          suffix={translate('popup.export.resourceLimitMiB')}
          onChange={(maxTotalSizeMiB) =>
            props.onResourceLimitsChange({ ...props.resourceLimits, maxTotalSizeMiB })
          }
        />
        <p className="mt-2 text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {translate('popup.export.resourceLimitsHelp')}
        </p>
      </div>
    </div>
  );
}

function ResourceLimitSelect(props: {
  label: string;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
  values: number[];
}) {
  const values = props.values.includes(props.value)
    ? props.values
    : [...props.values, props.value].sort((left, right) => left - right);
  return (
    <label className="mt-2 flex items-center justify-between gap-3">
      <span className="text-[10px] text-[var(--sniptale-color-text-secondary)]">{props.label}</span>
      <select
        className="h-7 w-[92px] rounded-[8px] border bg-transparent px-2 text-[10px]"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {value}
            {props.suffix ? ` ${props.suffix}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
