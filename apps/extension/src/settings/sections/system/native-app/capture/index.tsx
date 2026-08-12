import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../platform/i18n';
import { settingsCompactWorkbenchClassName } from '../../../../section-surface';
import { ToggleRow } from '../components/toggle-row';
import { NativeAdvancedFields } from './fields';

export function NativeCaptureView(props: {
  disabled: boolean;
  onChange: (settings: NativeCaptureSettings) => void;
  settings: NativeCaptureSettings;
}) {
  const updateNative = (patch: Partial<NativeCaptureSettings>) =>
    props.onChange({ ...props.settings, ...patch });
  const updateVideo = (video: Partial<NativeCaptureSettings['video']>) =>
    updateNative({ video: { ...props.settings.video, ...video } });
  const updateAdvanced = (advanced: Partial<NativeCaptureSettings['video']['advanced']>) =>
    updateVideo({ advanced: { ...props.settings.video.advanced, ...advanced } });
  return (
    <section className={[settingsCompactWorkbenchClassName, 'space-y-5'].join(' ')}>
      <ToggleRow
        checked={props.settings.screenshots.includeCursor}
        disabled={props.disabled}
        label={translate('settings.nativeApp.includeCursorScreenshot')}
        onChange={(includeCursor) => updateNative({ screenshots: { includeCursor } })}
      />
      <ToggleRow
        checked={props.settings.video.enabled}
        disabled={props.disabled}
        label={translate('settings.nativeApp.enableVideo')}
        onChange={(enabled) => updateVideo({ enabled })}
      />
      <NativeAdvancedFields
        disabled={props.disabled}
        settings={props.settings}
        updateAdvanced={updateAdvanced}
      />
    </section>
  );
}
