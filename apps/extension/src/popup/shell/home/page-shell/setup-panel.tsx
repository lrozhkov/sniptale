import { Camera } from 'lucide-react';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col">
          {desktop ? null : (
            <TabCaptureFields
              config={props.config}
              viewportPresets={props.viewportPresets}
              patch={patch}
            />
          )}
          <OutputFields config={props.config} patch={patch} />
        </div>
      </div>
      <div className="mt-3 grid w-full grid-cols-1">
        <PopupActionButton
          icon={Camera}
          label={translate('popup.home.captureButtonLabel')}
          iconClassName="text-[var(--sniptale-color-accent)]"
          tone="primary"
          centered
          disabled={props.pending || Boolean(props.disabledReason)}
          title={props.disabledReason ?? translate('popup.home.captureButtonTitle')}
          onClick={props.onCapture}
        />
      </div>
    </div>
  );
}
