import { Camera } from 'lucide-react';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';
import { OutputFields, TabCaptureFields } from './setup-fields';

export function ScreenshotSetupPanel(props: {
  config: ScreenshotCaptureConfig;
  viewportPresets: ViewportPreset[];
  pending: boolean;
  disabledReason: string | null;
  onChange(config: ScreenshotCaptureConfig): void;
  onCapture(): void;
}) {
  const desktop = props.config.screenshotMode === 'desktop';
  const patch = (value: Partial<ScreenshotCaptureConfig>) =>
    props.onChange({ ...props.config, ...value });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section
        className={[
          'min-h-0 flex-1 overflow-y-auto rounded-[16px] border p-3',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
        ].join(' ')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {desktop ? null : (
            <TabCaptureFields
              config={props.config}
              viewportPresets={props.viewportPresets}
              patch={patch}
            />
          )}
          <OutputFields config={props.config} patch={patch} />
        </div>
        {desktop ? null : (
          <button
            type="button"
            role="switch"
            aria-checked={props.config.exitAfterCapture}
            className={[
              'mt-3 flex min-h-9 w-full items-center justify-between rounded-[12px] border px-3',
              'border-[var(--sniptale-color-border-soft)] text-sm',
              'text-[var(--sniptale-color-text-muted)]',
            ].join(' ')}
            onClick={() => patch({ exitAfterCapture: !props.config.exitAfterCapture })}
          >
            <span>{translate('settings.quickActions.exitAfterCaptureLabel')}</span>
            <span
              aria-hidden="true"
              className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                props.config.exitAfterCapture
                  ? 'bg-[var(--sniptale-color-accent)]'
                  : 'bg-[var(--sniptale-color-border-strong)]'
              }`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                  props.config.exitAfterCapture ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        )}
      </section>
      <div className={actionFooterSurfaceClassName}>
        <PopupActionButton
          icon={Camera}
          label={
            props.pending
              ? translate('popup.home.capturePendingLabel')
              : translate('popup.home.captureButtonLabel')
          }
          iconClassName="text-[var(--sniptale-color-accent)]"
          tone="primary"
          disabled={props.pending || Boolean(props.disabledReason)}
          title={props.disabledReason ?? translate('popup.home.captureButtonTitle')}
          onClick={props.onCapture}
        />
      </div>
    </div>
  );
}
