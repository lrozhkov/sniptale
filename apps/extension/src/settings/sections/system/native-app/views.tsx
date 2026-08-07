import type { NativeAppCapabilities } from '../../../../contracts/native-app';
import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { NativeCaptureView } from './capture';
import { NativeCommandsView } from './commands';
import { NativeTelemetryView } from './telemetry';

export function NativeSettingsView(props: {
  capabilities: NativeAppCapabilities | null;
  disabled: boolean;
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
  view: 'capture' | 'commands' | 'telemetry';
}) {
  if (props.view === 'commands') return <NativeCommandsView {...props} />;
  if (props.view === 'telemetry') return <NativeTelemetryView {...props} />;
  return <NativeCaptureView {...props} />;
}
