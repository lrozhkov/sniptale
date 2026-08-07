import type { NativeAppCapabilities } from '../../../../../contracts/native-app';
import type {
  NativeCaptureSettings,
  NativeTrayActionKey,
} from '@sniptale/runtime-contracts/video/types/types';
import { settingsPanelClassName } from '../../../../section-surface';
import { NativeTrayActionFields } from './tray-action-fields';

export function NativeCommandsView(props: {
  capabilities: NativeAppCapabilities | null;
  disabled: boolean;
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
}) {
  const updateTrayAction = (
    key: NativeTrayActionKey,
    patch: Partial<NativeCaptureSettings['trayActions']['openSettings']>
  ) =>
    props.onChange({
      ...props.settings,
      trayActions: {
        ...props.settings.trayActions,
        [key]: { ...props.settings.trayActions[key], ...patch },
      },
    });
  return (
    <section className={settingsPanelClassName}>
      <NativeTrayActionFields
        capabilities={props.capabilities}
        disabled={props.disabled}
        settings={props.settings}
        updateTrayAction={updateTrayAction}
      />
    </section>
  );
}
