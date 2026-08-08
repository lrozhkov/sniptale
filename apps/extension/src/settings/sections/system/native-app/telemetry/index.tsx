import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { settingsPanelClassName } from '../../../../section-surface';
import { NativeTelemetryFields } from './fields';

export function NativeTelemetryView(props: {
  disabled: boolean;
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
}) {
  const updateTelemetry = (telemetry: Partial<NativeCaptureSettings['video']['telemetry']>) =>
    props.onChange({
      ...props.settings,
      video: {
        ...props.settings.video,
        telemetry: { ...props.settings.video.telemetry, ...telemetry },
      },
    });
  return (
    <section className={settingsPanelClassName}>
      <NativeTelemetryFields
        disabled={props.disabled}
        settings={props.settings}
        updateTelemetry={updateTelemetry}
      />
    </section>
  );
}
