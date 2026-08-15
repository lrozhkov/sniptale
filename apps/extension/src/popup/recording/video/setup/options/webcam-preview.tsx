import { useEffect, useState } from 'react';
import { MediaStreamVideo } from '../../../../../features/video/recording/media-stream-video';
import { translate } from '../../../../../platform/i18n/popup';
import type {
  WebcamActualSettings,
  WebcamPresentationMode,
  WebcamPresentationShape,
  WebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  WebcamPresentationMode as PresentationMode,
  WebcamPresentationShape as PresentationShape,
} from '@sniptale/runtime-contracts/video/types/types';
import { pickNumericWebcamActualSettings } from '@sniptale/runtime-contracts/video/types/webcam-actual-settings';
import { buildWebcamQualityConstraints } from '@sniptale/runtime-contracts/video/types/webcam-quality';
import {
  createInactiveMediaProbeState,
  stopMediaProbeStream,
  type InactiveMediaProbeState,
} from './media-probe-state';

type PreviewState =
  | InactiveMediaProbeState
  | {
      status: 'ready';
      capabilities: MediaTrackCapabilities | null;
      settings: WebcamActualSettings;
      stream: MediaStream;
    };

const PREVIEW_BOX_CLASS_NAME = [
  'relative aspect-video w-full overflow-hidden rounded-[10px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_82%,black_18%)]',
].join(' ');
const PREVIEW_STATUS_CLASS_NAME = [
  'flex h-full items-center justify-center px-3 text-center text-xs',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

function createPreviewStreamState(stream: MediaStream): PreviewState {
  const [track] = stream.getVideoTracks();
  if (!track) {
    throw new Error('Camera preview stream has no video track.');
  }

  return {
    capabilities: typeof track.getCapabilities === 'function' ? track.getCapabilities() : null,
    settings: pickNumericWebcamActualSettings(track.getSettings()),
    status: 'ready',
    stream,
  };
}

async function requestPreviewStream({
  currentDeviceId,
  frameRate,
  resolution,
}: {
  currentDeviceId: string;
  frameRate: WebcamQualitySettings['frameRate'];
  resolution: WebcamQualitySettings['resolution'];
}): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: { exact: currentDeviceId },
      ...buildWebcamQualityConstraints({ frameRate, resolution }),
    },
  });
}

function startWebcamPreviewEffect({
  currentDeviceId,
  frameRate,
  resolution,
  setState,
}: {
  currentDeviceId: string | null;
  frameRate: WebcamQualitySettings['frameRate'];
  resolution: WebcamQualitySettings['resolution'];
  setState: (state: PreviewState) => void;
}): () => void {
  let disposed = false;
  let stream: MediaStream | null = null;

  const openPreview = async () => {
    if (!currentDeviceId) {
      setState(createInactiveMediaProbeState('idle'));
      return;
    }

    setState(createInactiveMediaProbeState('loading'));

    try {
      stream = await requestPreviewStream({ currentDeviceId, frameRate, resolution });
      if (disposed) {
        stopMediaProbeStream(stream);
        return;
      }
      setState(createPreviewStreamState(stream));
    } catch {
      stopMediaProbeStream(stream);
      if (!disposed) {
        setState(createInactiveMediaProbeState('error'));
      }
    }
  };

  void openPreview();

  return () => {
    disposed = true;
    stopMediaProbeStream(stream);
  };
}

export function useWebcamPreview({
  currentDeviceId,
  quality,
}: {
  currentDeviceId: string | null;
  quality: WebcamQualitySettings;
}): PreviewState {
  const [state, setState] = useState<PreviewState>(createInactiveMediaProbeState('idle'));
  const { frameRate, resolution } = quality;

  useEffect(
    () => startWebcamPreviewEffect({ currentDeviceId, frameRate, resolution, setState }),
    [currentDeviceId, frameRate, resolution]
  );

  return state;
}

type WebcamPreviewPresentation = {
  cropOffset: { x: number; y: number };
  mode: WebcamPresentationMode;
  shape: WebcamPresentationShape;
};

export function WebcamPreview({
  presentation,
  state,
}: {
  presentation?: WebcamPreviewPresentation | null;
  state: PreviewState;
}) {
  const embedded = presentation?.mode === PresentationMode.EMBEDDED;
  const previewClassName = embedded
    ? presentation.shape === PresentationShape.CIRCLE
      ? 'h-[132px] w-[132px] overflow-hidden rounded-full'
      : 'aspect-video w-full overflow-hidden rounded-[10px]'
    : 'h-full w-full overflow-hidden rounded-[10px]';
  const videoStyle = presentation
    ? {
        objectPosition: `${50 + presentation.cropOffset.x * 50}% ${50 + presentation.cropOffset.y * 50}%`,
      }
    : undefined;
  return (
    <div className={`${PREVIEW_BOX_CLASS_NAME} flex items-center justify-center`}>
      <div className={previewClassName} data-ui="popup.video.webcam-preview-mask">
        {state.status === 'ready' ? (
          <MediaStreamVideo
            className="h-full w-full object-cover"
            stream={state.stream}
            {...(videoStyle === undefined ? {} : { style: videoStyle })}
          />
        ) : (
          <div className={PREVIEW_STATUS_CLASS_NAME}>{resolvePreviewStatusText(state)}</div>
        )}
      </div>
    </div>
  );
}

function resolvePreviewStatusText(state: PreviewState): string {
  if (state.status === 'loading') {
    return translate('popup.video.webcamQualityPreviewLoading');
  }
  if (state.status === 'error') {
    return translate('popup.video.webcamQualityPreviewError');
  }
  return translate('popup.video.webcamQualityPreviewEmpty');
}
