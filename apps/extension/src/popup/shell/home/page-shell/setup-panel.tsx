import { Camera } from 'lucide-react';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { ViewportPreset } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n/popup';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import {
  AfterCaptureField,
  ImageQualityField,
  TabCaptureAreaField,
  TabCaptureCountdownField,
  TabCaptureSizeField,
} from './setup-fields';
import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';

const ACTION_ICON_CLASS_NAME = [
  'text-[var(--sniptale-color-text-secondary)]',
  'group-hover:text-[var(--sniptale-color-text-primary)]',
  'group-focus-visible:text-[var(--sniptale-color-text-primary)]',
].join(' ');

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
          {desktop ? null : <TabCaptureAreaField config={props.config} patch={patch} />}
          <AfterCaptureField config={props.config} patch={patch} />
          {desktop ? null : (
            <TabCaptureSizeField
              config={props.config}
              viewportPresets={props.viewportPresets}
              patch={patch}
            />
          )}
          <ImageQualityField config={props.config} patch={patch} />
          <TabCaptureCountdownField config={props.config} patch={patch} />
        </div>
      </div>
      <div className={`mt-3 ${actionFooterSurfaceClassName}`}>
        <div className="grid grid-cols-1">
          <PopupActionButton
            icon={Camera}
            label={translate('popup.home.captureButtonLabel')}
            iconClassName={ACTION_ICON_CLASS_NAME}
            tone="primary"
            centered
            disabled={props.pending || Boolean(props.disabledReason)}
            title={props.disabledReason ?? translate('popup.home.captureButtonTitle')}
            onClick={props.onCapture}
          />
        </div>
      </div>
    </div>
  );
}
