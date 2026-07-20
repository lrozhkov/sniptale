import { useEffect, useState } from 'react';
import { MediaStreamVideo } from '../../features/video/recording/media-stream-video';
import { translate } from '../../platform/i18n';

type PreviewState =
  | { stream: null; status: 'idle' | 'loading' | 'error' }
  | { stream: MediaStream; status: 'ready' };

const PREVIEW_CLASS = [
  'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[16px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_84%,black_16%)]',
].join(' ');

export function CameraPreview({ webcamDeviceId }: { webcamDeviceId: string | null }) {
  const state = useCameraPreview(webcamDeviceId);

  return (
    <div className={PREVIEW_CLASS}>
      {state.status === 'ready' ? (
        <MediaStreamVideo stream={state.stream} />
      ) : (
        <div className="px-4 text-center text-sm text-[var(--sniptale-color-text-muted-strong)]">
          {resolvePreviewStatusText(state.status)}
        </div>
      )}
    </div>
  );
}

function useCameraPreview(webcamDeviceId: string | null): PreviewState {
  const [state, setState] = useState<PreviewState>({ status: 'idle', stream: null });

  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;

    async function startPreview() {
      if (!webcamDeviceId) {
        setState({ status: 'idle', stream: null });
        return;
      }

      setState({ status: 'loading', stream: null });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: webcamDeviceId } },
        });
      } catch {
        if (!disposed) {
          setState({ status: 'error', stream: null });
        }
        return;
      }

      if (disposed) {
        stopStream(stream);
        return;
      }
      setState({ status: 'ready', stream });
    }

    void startPreview();
    return () => {
      disposed = true;
      stopStream(stream);
    };
  }, [webcamDeviceId]);

  return state;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function resolvePreviewStatusText(status: PreviewState['status']): string {
  if (status === 'loading') {
    return translate('popup.video.webcamQualityPreviewLoading');
  }
  if (status === 'error') {
    return translate('popup.video.webcamQualityPreviewError');
  }
  return translate('popup.video.activeWebcamPreviewUnavailable');
}
