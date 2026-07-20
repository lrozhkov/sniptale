import type { NativeAppCapabilities } from '../../../contracts/native-app';
import type {
  NativeCaptureSettings,
  NativeTrayActionKey,
} from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n';
import { settingsPanelClassName } from '../../section-surface';
import { ToggleRow } from './toggle-row';
import { NativeAdvancedFields, NativeAdvancedToggles, NativeTelemetryFields } from './fields';
import { NativeTrayActionFields } from './tray-action-fields';

export function NativeSettingsPanel(props: {
  capabilities: NativeAppCapabilities | null;
  disabled: boolean;
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
}) {
  const actions = useNativeSettingsPanelActions(props);

  return (
    <div className={[settingsPanelClassName, 'space-y-6'].join(' ')}>
      <NativeCaptureToggles
        disabled={props.disabled}
        settings={props.settings}
        updateNative={actions.updateNative}
        updateVideo={actions.updateVideo}
      />
      <NativeAdvancedFields
        disabled={props.disabled}
        settings={props.settings}
        updateAdvanced={actions.updateAdvanced}
      />
      <NativeAdvancedToggles
        disabled={props.disabled}
        settings={props.settings}
        updateAdvanced={actions.updateAdvanced}
      />
      <NativeTrayActionFields
        capabilities={props.capabilities}
        disabled={props.disabled}
        settings={props.settings}
        updateTrayAction={actions.updateTrayAction}
      />
      <NativeTelemetryFields
        disabled={props.disabled}
        settings={props.settings}
        updateTelemetry={actions.updateTelemetry}
      />
    </div>
  );
}

function useNativeSettingsPanelActions(props: {
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
}) {
  const { settings } = props;
  const updateNative = (patch: Partial<NativeCaptureSettings>) =>
    props.onChange({ ...settings, ...patch });
  const updateVideo = (video: Partial<NativeCaptureSettings['video']>) =>
    updateNative({ video: { ...settings.video, ...video } });
  return {
    updateAdvanced: (advanced: Partial<NativeCaptureSettings['video']['advanced']>) =>
      updateVideo({ advanced: { ...settings.video.advanced, ...advanced } }),
    updateNative,
    updateTelemetry: (telemetry: Partial<NativeCaptureSettings['video']['telemetry']>) =>
      updateVideo({ telemetry: { ...settings.video.telemetry, ...telemetry } }),
    updateTrayAction: (
      key: NativeTrayActionKey,
      patch: Partial<NativeCaptureSettings['trayActions']['openSettings']>
    ) =>
      updateNative({
        trayActions: {
          ...settings.trayActions,
          [key]: { ...settings.trayActions[key], ...patch },
        },
      }),
    updateVideo,
  };
}

function NativeCaptureToggles(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateNative: (patch: Partial<NativeCaptureSettings>) => void;
  updateVideo: (video: Partial<NativeCaptureSettings['video']>) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {translate('settings.nativeApp.captureTitle')}
      </h2>
      <ToggleRow
        checked={props.settings.screenshots.includeCursor}
        disabled={props.disabled}
        label={translate('settings.nativeApp.includeCursorScreenshot')}
        onChange={(includeCursor) => props.updateNative({ screenshots: { includeCursor } })}
      />
      <ToggleRow
        checked={props.settings.video.enabled}
        disabled={props.disabled}
        label={translate('settings.nativeApp.enableVideo')}
        onChange={(enabled) => props.updateVideo({ enabled })}
      />
    </div>
  );
}
