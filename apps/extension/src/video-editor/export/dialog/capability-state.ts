import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { getProjectExportCapabilities } from '../../project/operations/ops';
import { getUserFacingErrorDetail } from '../../../platform/i18n/user-facing-error';

function createEncoderInputFingerprint(settings: VideoProjectExportSettings): string {
  return JSON.stringify([
    settings.resolution,
    settings.width,
    settings.height,
    settings.fps,
    settings.quality,
  ]);
}

/** Capability results are advisory: only the user changes the selected format or codec. */
export function useExportDialogCapabilities(args: { settings: VideoProjectExportSettings }) {
  const { settings } = args;
  const fingerprint = createEncoderInputFingerprint(settings);
  const settingsRef = useRef(settings);
  const committedFingerprint = useRef(fingerprint);
  const [result, setResult] = useState<{
    fingerprint: string;
    capabilities: VideoExportCapabilities | null;
    error: string | null;
  } | null>(null);

  useLayoutEffect(() => {
    settingsRef.current = settings;
    committedFingerprint.current = fingerprint;
  }, [fingerprint, settings]);

  useEffect(() => {
    let active = true;
    const accept = (capabilities: VideoExportCapabilities | null, error: string | null) => {
      if (active && committedFingerprint.current === fingerprint) {
        setResult({ fingerprint, capabilities, error });
      }
    };
    void getProjectExportCapabilities(settingsRef.current)
      .then((response) => {
        if (response.success && response.capabilities) {
          accept(response.capabilities, null);
        } else {
          accept(null, getUserFacingErrorDetail('browserCommunication'));
        }
      })
      .catch(() => accept(null, getUserFacingErrorDetail('browserCommunication')));
    return () => {
      active = false;
    };
  }, [fingerprint]);

  const current = result?.fingerprint === fingerprint ? result : null;
  return {
    capabilities: current?.capabilities ?? null,
    capabilitiesPending: current === null,
    capabilityError: current?.error ?? null,
  };
}
