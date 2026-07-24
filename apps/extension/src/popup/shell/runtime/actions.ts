import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { getTabCapabilities } from '../../../features/tab-capabilities/capabilities';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type { MicrophoneOption } from '../../recording/microphone';
import {
  refreshMicrophoneDevices,
  type RefreshMicrophoneDevicesOptions,
} from '../../recording/microphone-flow';
import type { WebcamOption } from '../../recording/webcam';
import {
  refreshWebcamDevices,
  type RefreshWebcamDevicesOptions,
} from '../../recording/webcam-flow';
import { useGalleryStatusUpdater } from '../gallery/status';

const logger = createLogger({ namespace: 'PopupRuntimeEffects' });

type PopupRuntimeActionsParams = {
  microphoneDevices: MicrophoneOption[];
  setActiveTabCapabilities: Dispatch<SetStateAction<ActiveTabCapabilities>>;
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
  setIsLoadingMicrophones: Dispatch<SetStateAction<boolean>>;
  setIsLoadingWebcams: Dispatch<SetStateAction<boolean>>;
  setMicrophoneDevices: Dispatch<SetStateAction<MicrophoneOption[]>>;
  setWebcamDevices: Dispatch<SetStateAction<WebcamOption[]>>;
  webcamDevices: WebcamOption[];
};

function useLatestDeviceRefs(params: {
  microphoneDevices: MicrophoneOption[];
  webcamDevices: WebcamOption[];
}) {
  const microphoneDevicesRef = useRef(params.microphoneDevices);
  const webcamDevicesRef = useRef(params.webcamDevices);

  useEffect(() => {
    microphoneDevicesRef.current = params.microphoneDevices;
  }, [params.microphoneDevices]);

  useEffect(() => {
    webcamDevicesRef.current = params.webcamDevices;
  }, [params.webcamDevices]);

  return { microphoneDevicesRef, webcamDevicesRef };
}

export function usePopupRuntimeActions(params: PopupRuntimeActionsParams) {
  const { microphoneDevicesRef, webcamDevicesRef } = useLatestDeviceRefs(params);

  const refreshMicrophones = useCallback(
    (options?: RefreshMicrophoneDevicesOptions) =>
      refreshMicrophoneDevices(
        params.setIsLoadingMicrophones,
        params.setMicrophoneDevices,
        microphoneDevicesRef.current,
        options
      ),
    [microphoneDevicesRef, params.setIsLoadingMicrophones, params.setMicrophoneDevices]
  );
  const refreshWebcams = useCallback(
    (options?: RefreshWebcamDevicesOptions) =>
      refreshWebcamDevices(
        params.setIsLoadingWebcams,
        params.setWebcamDevices,
        webcamDevicesRef.current,
        options
      ),
    [params.setIsLoadingWebcams, params.setWebcamDevices, webcamDevicesRef]
  );
  const refreshGalleryStatus = useGalleryStatusUpdater(params.setGalleryStatus);
  const refreshActiveTabCapabilities = useCallback(async () => {
    try {
      const [tab] = await browserTabs.query({ active: true, currentWindow: true });
      params.setActiveTabCapabilities(getTabCapabilities(tab));
    } catch (error) {
      logger.error('Failed to resolve active tab capabilities', error);
      params.setActiveTabCapabilities(getTabCapabilities(null));
    }
  }, [params]);

  return { refreshMicrophones, refreshWebcams, refreshGalleryStatus, refreshActiveTabCapabilities };
}
