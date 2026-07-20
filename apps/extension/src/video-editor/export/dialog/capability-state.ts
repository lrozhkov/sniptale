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
} from '../../../features/video/project/types';
import { getProjectExportCapabilities } from '../../project/operations/ops';

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

function buildSettingsPatch(
  currentSettings: VideoProjectExportSettings,
  nextSettings: VideoProjectExportSettings
): Partial<VideoProjectExportSettings> | null {
  const changedEntries = (Object.keys(nextSettings) as (keyof VideoProjectExportSettings)[])
    .filter((key) => currentSettings[key] !== nextSettings[key])
    .map((key) => [key, nextSettings[key]]);

  return changedEntries.length > 0
    ? (Object.fromEntries(changedEntries) as Partial<VideoProjectExportSettings>)
    : null;
}

interface CapabilityResolutionStateSetters {
  setCapabilities: React.Dispatch<React.SetStateAction<VideoExportCapabilities | null>>;
  setCapabilitiesPending: React.Dispatch<React.SetStateAction<boolean>>;
  setCapabilityError: React.Dispatch<React.SetStateAction<string | null>>;
}

interface CapabilityResolutionActions {
  currentSettings: VideoProjectExportSettings;
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
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
    capabilityError: args.response.success ? null : (args.response.error ?? null),
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
    capabilityError: args.error instanceof Error ? args.error.message : String(args.error),
    currentSettings: args.currentSettings,
    nextCapabilities: createFallbackExportCapabilities(),
    onChange: args.onChange,
    setCapabilities: args.setCapabilities,
    setCapabilitiesPending: args.setCapabilitiesPending,
    setCapabilityError: args.setCapabilityError,
  });
}

function runCapabilityResolution(
  args: CapabilityResolutionActions &
    CapabilityResolutionStateSetters & {
      activeRef: { current: boolean };
    }
) {
  void getProjectExportCapabilities(args.currentSettings)
    .then((response) => {
      if (!args.activeRef.current) {
        return;
      }

      handleCapabilitySuccess({
        currentSettings: args.currentSettings,
        onChange: args.onChange,
        response,
        setCapabilities: args.setCapabilities,
        setCapabilitiesPending: args.setCapabilitiesPending,
        setCapabilityError: args.setCapabilityError,
      });
    })
    .catch((error: unknown) => {
      if (!args.activeRef.current) {
        return;
      }

      handleCapabilityFailure({
        currentSettings: args.currentSettings,
        error,
        onChange: args.onChange,
        setCapabilities: args.setCapabilities,
        setCapabilitiesPending: args.setCapabilitiesPending,
        setCapabilityError: args.setCapabilityError,
      });
    });
}

export function useExportDialogCapabilities(args: {
  onChange: (patch: Partial<VideoProjectExportSettings>) => void;
  settings: VideoProjectExportSettings;
}) {
  const { onChange, settings } = args;
  const [capabilities, setCapabilities] = React.useState<VideoExportCapabilities | null>(null);
  const [capabilitiesPending, setCapabilitiesPending] = React.useState(true);
  const [capabilityError, setCapabilityError] = React.useState<string | null>(null);
  const settingsRef = React.useRef(settings);

  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    const activeRef = { current: true };

    setCapabilitiesPending(true);
    setCapabilityError(null);
    runCapabilityResolution({
      activeRef,
      currentSettings: settingsRef.current,
      onChange,
      setCapabilities,
      setCapabilitiesPending,
      setCapabilityError,
    });

    return () => {
      activeRef.current = false;
    };
  }, [onChange]);

  return { capabilities, capabilitiesPending, capabilityError };
}
