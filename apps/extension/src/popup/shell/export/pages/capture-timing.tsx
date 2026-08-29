import { useEffect, useRef, useState } from 'react';
import type { PagePackageCaptureTimingPolicy } from '@sniptale/runtime-contracts/page-package';
import { DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING } from '@sniptale/runtime-contracts/page-package';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n/popup';

export function usePageCaptureTimingPreferences() {
  const [timing, setTiming] = useState<PagePackageCaptureTimingPolicy>({
    ...DEFAULT_PAGE_PACKAGE_CAPTURE_TIMING,
  });
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void loadSettings()
      .then((settings) => {
        if (active && revisionRef.current === 0) setTiming(settings.pagePackageCaptureTiming);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, []);
  const update = (next: PagePackageCaptureTimingPolicy) => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setTiming(next);
    void patchSettings({ pagePackageCaptureTiming: next }).catch(() => {
      void loadSettings()
        .then((settings) => {
          if (mountedRef.current && revisionRef.current === revision) {
            setTiming(settings.pagePackageCaptureTiming);
          }
        })
        .catch(() => undefined);
    });
  };
  return { timing, update };
}

function TimingSelect(props: {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-[11px] text-[var(--sniptale-color-text-primary)]">{props.label}</span>
      <select
        className="h-8 rounded-[8px] border bg-transparent px-2 text-[11px]"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      >
        {props.values.map((value) => (
          <option key={value} value={value}>
            {value === 0
              ? translate('popup.export.noDelay')
              : `${value / 1000} ${translate('popup.export.secondsShort')}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PageCaptureTimingSettings(props: {
  timing: PagePackageCaptureTimingPolicy;
  onChange: (timing: PagePackageCaptureTimingPolicy) => void;
}) {
  return (
    <div className="divide-y divide-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_60%,transparent)]">
      <TimingSelect
        label={translate('popup.export.pageLoadTimeout')}
        value={props.timing.loadTimeoutMs}
        values={[15_000, 30_000, 60_000, 120_000, 300_000]}
        onChange={(loadTimeoutMs) => props.onChange({ ...props.timing, loadTimeoutMs })}
      />
      <TimingSelect
        label={translate('popup.export.pageSettleDelay')}
        value={props.timing.settleDelayMs}
        values={[0, 1_000, 2_000, 3_000, 5_000, 10_000]}
        onChange={(settleDelayMs) => props.onChange({ ...props.timing, settleDelayMs })}
      />
      <p className="py-2 text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
        {translate('popup.export.pageTimingHelp')}
      </p>
    </div>
  );
}
