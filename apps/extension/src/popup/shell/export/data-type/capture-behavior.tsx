import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
} from '../../../../contracts/full-page-capture';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n/popup';

export function usePackageCaptureBehaviorPreferences() {
  const [preferences, setPreferences] = useState<FullPageCapturePreferences>({
    ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  });
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void loadSettings()
      .then((settings) => {
        if (active && revisionRef.current === 0) {
          setPreferences(settings.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES);
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
  return { preferences, update };
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
    </div>
  );
}
