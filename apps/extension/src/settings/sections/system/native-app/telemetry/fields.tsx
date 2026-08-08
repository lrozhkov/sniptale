import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';
import { settingsMetaLabelClassName } from '../../../../section-surface';
import { ToggleRow } from '../components/toggle-row';

export function NativeTelemetryFields(props: {
  disabled: boolean;
  settings: NativeCaptureSettings;
  updateTelemetry: (telemetry: Partial<NativeCaptureSettings['video']['telemetry']>) => void;
}) {
  return (
    <div className="space-y-1">
      <p className={settingsMetaLabelClassName}>{translate('settings.nativeApp.telemetryTitle')}</p>
      <ToggleRow
        checked={props.settings.video.telemetry.collectCursor}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectCursor')}
        onChange={(collectCursor) => props.updateTelemetry({ collectCursor })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectClicks}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectClicks')}
        onChange={(collectClicks) => props.updateTelemetry({ collectClicks })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectKeyEvents}
        description={translate('settings.nativeApp.keyPrivacy')}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectKeyEvents')}
        onChange={(collectKeyEvents) => props.updateTelemetry({ collectKeyEvents })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectTypingSpans}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectTypingSpans')}
        onChange={(collectTypingSpans) => props.updateTelemetry({ collectTypingSpans })}
      />
      <ToggleRow
        checked={props.settings.video.telemetry.collectStaticSignals}
        disabled={props.disabled}
        label={translate('settings.nativeApp.collectStaticSignals')}
        onChange={(collectStaticSignals) => props.updateTelemetry({ collectStaticSignals })}
      />
    </div>
  );
}
