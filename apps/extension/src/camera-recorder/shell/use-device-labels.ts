import { useEffect, useState } from 'react';
import type { DeviceLabelMap } from './types';

export function useDeviceLabels(): DeviceLabelMap {
  const [labels, setLabels] = useState<DeviceLabelMap>({
    microphones: new Map(),
    webcams: new Map(),
  });

  useEffect(() => {
    let disposed = false;

    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        if (!disposed) {
          setLabels(createDeviceLabelMap(devices));
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  return labels;
}

function createDeviceLabelMap(devices: readonly MediaDeviceInfo[]): DeviceLabelMap {
  const microphones = new Map<string, string>();
  const webcams = new Map<string, string>();

  for (const device of devices) {
    if (!device.deviceId || !device.label) {
      continue;
    }
    if (device.kind === 'audioinput') {
      microphones.set(device.deviceId, device.label);
    }
    if (device.kind === 'videoinput') {
      webcams.set(device.deviceId, device.label);
    }
  }

  return { microphones, webcams };
}
