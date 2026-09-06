import React from 'react';
import {
  createVideoExportCapabilities,
  normalizeVideoProjectExportSettings,
} from '../../../features/video/project/export/capabilities';
import {
  VideoExportCapabilityReason,
  VideoExportFormat,
  VideoMp4Codec,
} from '../../../features/video/project/types';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
  VideoProjectExportSettingsPatch,
} from '../../../features/video/project/types';
import { getProjectExportCapabilities } from '../../project/operations/ops';
import { getUserFacingErrorDetail } from '../../../platform/i18n/user-facing-error';

function createFallbackExportCapabilities(): VideoExportCapabilities {
  return createVideoExportCapabilities({
    formats: [
      { format: VideoExportFormat.MP4, available: false },
      { format: VideoExportFormat.WEBM, available: true },
    ],
    mp4Codecs: [VideoMp4Codec.AVC, VideoMp4Codec.HEVC, VideoMp4Codec.VP9].map((codec) => ({
      codec,
      available: false,
      reason: VideoExportCapabilityReason.CODEC_UNSUPPORTED,
    })),
    defaultMp4VideoCodec: null,
  });
}

function createEncoderInputFingerprint(settings: VideoProjectExportSettings): string {
  return JSON.stringify([
    settings.resolution,
    settings.width,
    settings.height,
    settings.fps,
    settings.quality,
  ]);
}

function buildSettingsPatch(
  currentSettings: VideoProjectExportSettings,
  nextSettings: VideoProjectExportSettings
): VideoProjectExportSettingsPatch | null {
  const keys: Array<keyof VideoProjectExportSettingsPatch> = [
    'width',
    'height',
    'fps',
    'quality',
    'format',
    'mp4VideoCodec',
    'webmVideoCodec',
    'resolution',
    'scope',
    'selectedClipIds',
    'burnInSubtitles',
    'subtitleSidecarFormats',
    'downloadAfterExport',
    'rangeStartSeconds',
    'rangeEndSeconds',
  ];
  const current = currentSettings as unknown as Record<string, unknown>;
  const next = nextSettings as unknown as Record<string, unknown>;
  const changedEntries = keys
    .filter((key) => current[key] !== next[key])
    .map((key) => [key, next[key]]);

  return changedEntries.length > 0
    ? (Object.fromEntries(changedEntries) as VideoProjectExportSettingsPatch)
    : null;
}

interface CapabilityResolutionStateSetters {
  setCapabilities: React.Dispatch<React.SetStateAction<VideoExportCapabilities | null>>;
  setCapabilitiesPending: React.Dispatch<React.SetStateAction<boolean>>;
  setCapabilityError: React.Dispatch<React.SetStateAction<string | null>>;
}

interface CapabilityResolutionActions {
  currentSettings: VideoProjectExportSettings;
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
}

type CapabilityResolutionArgs = CapabilityResolutionActions &
  CapabilityResolutionStateSetters & {
    capabilityError: string | null;
    nextCapabilities: VideoExportCapabilities;
  };

function applyCapabilityResolution(args: CapabilityResolutionArgs) {
  const normalizedSettings = normalizeVideoProjectExportSettings(
    args.currentSettings,
    args.nextCapabilities
  );

  args.setCapabilities(args.nextCapabilities);
  args.setCapabilitiesPending(false);
  args.setCapabilityError(args.capabilityError);

  const patch = buildSettingsPatch(args.currentSettings, normalizedSettings);
  if (patch) {
    args.onChange(patch);
  }
}

function handleCapabilitySuccess(
  args: CapabilityResolutionActions &
    CapabilityResolutionStateSetters & {
      response: Awaited<ReturnType<typeof getProjectExportCapabilities>>;
    }
) {
  applyCapabilityResolution({
    capabilityError: args.response.success
      ? null
      : getUserFacingErrorDetail('browserCommunication'),
    currentSettings: args.currentSettings,
    nextCapabilities:
      args.response.success && args.response.capabilities
        ? args.response.capabilities
        : createFallbackExportCapabilities(),
    onChange: args.onChange,
    setCapabilities: args.setCapabilities,
    setCapabilitiesPending: args.setCapabilitiesPending,
    setCapabilityError: args.setCapabilityError,
  });
}

function handleCapabilityFailure(
  args: CapabilityResolutionActions &
    CapabilityResolutionStateSetters & {
      error: unknown;
    }
) {
  applyCapabilityResolution({
    capabilityError: getUserFacingErrorDetail('browserCommunication'),
    currentSettings: args.currentSettings,
    nextCapabilities: createFallbackExportCapabilities(),
    onChange: args.onChange,
    setCapabilities: args.setCapabilities,
    setCapabilitiesPending: args.setCapabilitiesPending,
    setCapabilityError: args.setCapabilityError,
  });
}

function runCapabilityResolution(
  args: CapabilityResolutionStateSetters & {
    activeRef: { current: boolean };
    committedFingerprintRef: { current: string };
    onChange: CapabilityResolutionActions['onChange'];
    requestedFingerprint: string;
    settingsRef: { current: VideoProjectExportSettings };
  }
) {
  const requestedSettings = args.settingsRef.current;
  void getProjectExportCapabilities(requestedSettings)
    .then((response) => {
      if (
        !args.activeRef.current ||
        args.committedFingerprintRef.current !== args.requestedFingerprint
      ) {
        return;
      }

      handleCapabilitySuccess({
        currentSettings: args.settingsRef.current,
        onChange: args.onChange,
        response,
        setCapabilities: args.setCapabilities,
        setCapabilitiesPending: args.setCapabilitiesPending,
        setCapabilityError: args.setCapabilityError,
      });
    })
    .catch((error: unknown) => {
      if (
        !args.activeRef.current ||
        args.committedFingerprintRef.current !== args.requestedFingerprint
      ) {
        return;
      }

      handleCapabilityFailure({
        currentSettings: args.settingsRef.current,
        error,
        onChange: args.onChange,
        setCapabilities: args.setCapabilities,
        setCapabilitiesPending: args.setCapabilitiesPending,
        setCapabilityError: args.setCapabilityError,
      });
    });
}

export function useExportDialogCapabilities(args: {
  onChange: (patch: VideoProjectExportSettingsPatch) => void;
  settings: VideoProjectExportSettings;
}) {
  const { onChange, settings } = args;
  const [capabilities, setCapabilities] = React.useState<VideoExportCapabilities | null>(null);
  const [capabilitiesPending, setCapabilitiesPending] = React.useState(true);
  const [capabilityError, setCapabilityError] = React.useState<string | null>(null);
  const settingsRef = React.useRef(settings);
  const encoderInputFingerprint = createEncoderInputFingerprint(settings);
  const committedFingerprintRef = React.useRef(encoderInputFingerprint);

  React.useLayoutEffect(() => {
    settingsRef.current = settings;
    committedFingerprintRef.current = encoderInputFingerprint;
  }, [encoderInputFingerprint, settings]);

  React.useEffect(() => {
    const activeRef = { current: true };

    setCapabilitiesPending(true);
    setCapabilityError(null);
    runCapabilityResolution({
      activeRef,
      committedFingerprintRef,
      onChange,
      requestedFingerprint: encoderInputFingerprint,
      settingsRef,
      setCapabilities,
      setCapabilitiesPending,
      setCapabilityError,
    });

    return () => {
      activeRef.current = false;
    };
  }, [encoderInputFingerprint, onChange]);

  return { capabilities, capabilitiesPending, capabilityError };
}
