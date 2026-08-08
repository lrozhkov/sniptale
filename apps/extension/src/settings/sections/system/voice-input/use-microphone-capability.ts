import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listMicrophoneInputDevices,
  readMicrophoneAccessState,
  requestMicrophoneAccess,
  subscribeToMicrophoneDeviceChanges,
  type MicrophoneAccessState,
  type MicrophoneInputDevice,
} from '@sniptale/platform/browser/user-media';

// policyStateIds: [] - this Settings-local view caches browser-owned permission and device
// observations only; the browser remains the microphone capability authority.

export function useMicrophoneCapability() {
  const [access, setAccess] = useState<MicrophoneAccessState>('unknown');
  const [devices, setDevices] = useState<MicrophoneInputDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const generationRef = useRef(0);

  const refreshDevices = useCallback(async () => {
    const generation = generationRef.current;
    setLoading(true);
    try {
      const nextDevices = await listMicrophoneInputDevices();
      if (generation === generationRef.current) setDevices(nextDevices);
    } catch {
      if (generation === generationRef.current) setDevices([]);
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    try {
      const [nextAccess, nextDevices] = await Promise.all([
        readMicrophoneAccessState(),
        listMicrophoneInputDevices(),
      ]);
      if (generation !== generationRef.current) return;
      setAccess(nextAccess);
      setDevices(nextDevices);
    } catch {
      if (generation !== generationRef.current) return;
      setAccess('unknown');
      setDevices([]);
    }
  }, []);

  const read = useCallback(async (): Promise<MicrophoneAccessState> => {
    const generation = generationRef.current;
    try {
      const state = await readMicrophoneAccessState();
      if (generation !== generationRef.current) return 'unknown';
      setAccess(state);
      return state;
    } catch {
      if (generation === generationRef.current) setAccess('unknown');
      return 'unknown';
    }
  }, []);

  const request = useCallback(
    async (deviceId: string | null): Promise<MicrophoneAccessState> => {
      const generation = generationRef.current;
      let state: MicrophoneAccessState;
      try {
        state = await requestMicrophoneAccess(deviceId);
      } catch {
        state = 'unknown';
      }
      if (generation !== generationRef.current) return 'unknown';
      setAccess(state);
      if (state === 'granted') await refreshDevices();
      return state;
    },
    [refreshDevices]
  );

  useEffect(
    () =>
      subscribeToMicrophoneDeviceChanges(() => {
        void refreshDevices();
      }),
    [refreshDevices]
  );

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    setLoading(false);
  }, []);

  return {
    actions: { invalidate, read, refresh, refreshDevices, request, setAccess },
    state: { access, devices, loading },
  };
}
