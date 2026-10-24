import { Text } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import { Teleprompter } from './teleprompter';
import { CameraPreview } from './camera-preview';
import { CameraPreviewLayout } from './camera-layout';
import { resolveDeviceName } from './format';
import type { ControlCapability, DeviceLabelMap } from './types';

const LIVE_PANEL_CLASS = [
  'flex min-h-0 flex-1 flex-col rounded-[4px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-3',
].join(' ');

export function CameraLivePanel(props: {
  visible: boolean;
  messaging: RuntimeMessagingTransport;
  initialTeleprompterEnabled?: boolean;
  capability: ControlCapability | null;
  deviceLabels: DeviceLabelMap;
  error: string | null;
  registrationError: string | null;
  state: VideoRecordingRuntimeState;
}) {
  const [teleprompterEnabled, setTeleprompterEnabled] = useState(
    props.initialTeleprompterEnabled === true
  );
  useEffect(() => {
    if (props.initialTeleprompterEnabled) setTeleprompterEnabled(true);
  }, [props.initialTeleprompterEnabled, props.capability?.recordingId]);
  const showButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (!teleprompterEnabled && restoreFocus.current) {
      restoreFocus.current = false;
      showButton.current?.focus({ preventScroll: true });
    }
  }, [teleprompterEnabled]);
  const cameraId = props.state.liveMedia?.webcamDeviceId ?? null;
  const cameraName = resolveDeviceName(
    cameraId,
    props.deviceLabels.webcams,
    translate('popup.video.activeWebcamNotSelected')
  );
  const error = props.error ?? props.registrationError;
  return (
    <section className={LIVE_PANEL_CLASS} aria-labelledby="camera-recorder-title">
      {props.state.liveMedia?.webcamEnabled === true ? (
        <CameraPreviewLayout
          enabled={teleprompterEnabled}
          label={translate('popup.video.teleprompterResizeCamera')}
          resetLabel={translate('popup.video.teleprompterResetCamera')}
        >
          <CameraPreview
            webcamDeviceId={cameraId}
            capability={props.capability}
            messaging={props.messaging}
            active={
              props.state.status === VideoRecordingStatus.RECORDING ||
              props.state.status === VideoRecordingStatus.PAUSED
            }
          />
        </CameraPreviewLayout>
      ) : null}
      <div hidden={!teleprompterEnabled} className="flex min-h-0 flex-1 flex-col">
        {props.state.displaySurface === 'monitor' ? (
          <p role="note" className="my-2 text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('popup.video.teleprompterMonitorHint')}
          </p>
        ) : null}
        <Teleprompter
          visible={props.visible && teleprompterEnabled}
          onHide={() => {
            restoreFocus.current = true;
            setTeleprompterEnabled(false);
          }}
          recordingId={props.capability?.recordingId ?? null}
          paused={
            !teleprompterEnabled ||
            !props.visible ||
            (props.state.status !== VideoRecordingStatus.IDLE &&
              props.state.status !== VideoRecordingStatus.RECORDING)
          }
        />
      </div>
      <div
        data-ui="camera-recorder.details"
        className={teleprompterEnabled ? 'sr-only' : 'mt-3 shrink-0'}
      >
        <div className="flex items-center justify-between gap-2">
          <h1 id="camera-recorder-title" className="m-0 text-[14px] leading-5 font-medium">
            {translate('popup.video.cameraWindowTitle')}
          </h1>
          {!teleprompterEnabled ? (
            <CameraWindowButton
              ref={showButton}
              icon={Text}
              iconOnly
              label={translate('popup.video.teleprompterShow')}
              onClick={() => setTeleprompterEnabled(true)}
            />
          ) : null}
        </div>
        <div
          className="select-text truncate text-xs text-[var(--sniptale-color-text-secondary)]"
          title={cameraName}
        >
          {cameraName}
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-2 shrink-0 text-sm [overflow-wrap:anywhere] text-[var(--sniptale-color-danger)]"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}
