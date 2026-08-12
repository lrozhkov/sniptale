import { useEffect, useRef, useState } from 'react';
import {
  BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
  VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT,
  type VideoRecordingProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  loadVideoSettings,
  mutateVideoSettings,
  type VideoSettingsMutation,
} from '../../../../../composition/persistence/capture-settings';
import { translate } from '../../../../../platform/i18n';

type ProfileEditorState = { profile?: VideoRecordingProfile } | null;

function createProfileId(): string {
  return typeof crypto.randomUUID === 'function'
    ? `custom:${crypto.randomUUID()}`
    : `custom:${Date.now()}`;
}

function moveProfileBefore(
  profiles: readonly VideoRecordingProfile[],
  profileId: string,
  beforeProfileId: string | null
): readonly VideoRecordingProfile[] {
  if (profileId === beforeProfileId) return profiles;
  const sourceIndex = profiles.findIndex((profile) => profile.id === profileId);
  if (sourceIndex < 0) return profiles;
  const next = profiles.filter((profile) => profile.id !== profileId);
  const insertionIndex =
    beforeProfileId === null
      ? next.length
      : next.findIndex((profile) => profile.id === beforeProfileId);
  if (insertionIndex < 0) return profiles;
  next.splice(insertionIndex, 0, profiles[sourceIndex]!);
  return next.every((profile, index) => profile.id === profiles[index]?.id) ? profiles : next;
}

export function useVideoQualityProfiles() {
  const [settings, setSettings] = useState<VideoRecordingSettings | null>(null);
  const [editor, setEditor] = useState<ProfileEditorState>(null);
  const [deleteProfile, setDeleteProfile] = useState<VideoRecordingProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadVideoSettings()
      .then((loaded) => {
        if (active) setSettings(loaded);
      })
      .catch(() => {
        if (active) setError(translate('settings.videoQuality.loadError'));
      });
    return () => {
      active = false;
    };
  }, []);

  const commit = async (mutation: VideoSettingsMutation) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await mutateVideoSettings(mutation);
      setSettings(next);
      return true;
    } catch {
      setError(translate('settings.videoQuality.saveError'));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveProfile = async (draft: VideoRecordingProfile) => {
    if (!settings) return;
    const profile = { ...draft, id: draft.id || createProfileId(), name: draft.name.trim() };
    if (
      await commit((current) => {
        const existing = current.qualityProfiles;
        const isExistingProfile = existing.some((item) => item.id === profile.id);
        if (!isExistingProfile && existing.length >= VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT) {
          throw new Error('Video quality profile limit reached');
        }
        const nextProfiles = isExistingProfile
          ? existing.map((item) => (item.id === profile.id ? profile : item))
          : [...existing, profile];
        return current.qualityProfileId === profile.id
          ? {
              ...current,
              outputProfile: { ...profile.configuration },
              qualityProfiles: nextProfiles,
            }
          : { ...current, qualityProfiles: nextProfiles };
      })
    ) {
      setEditor(null);
    }
  };

  const confirmDelete = async () => {
    if (!settings || !deleteProfile) return;
    if (
      await commit((current) => ({
        ...current,
        qualityProfileId:
          current.qualityProfileId === deleteProfile.id ? null : current.qualityProfileId,
        qualityProfiles: current.qualityProfiles.filter(
          (profile) => profile.id !== deleteProfile.id
        ),
      }))
    ) {
      setDeleteProfile(null);
    }
  };

  const selectProfile = async (profile: VideoRecordingProfile) => {
    if (!settings) return;
    await commit((current) => ({
      ...current,
      outputProfile: { ...profile.configuration },
      qualityProfileId: profile.id,
    }));
  };

  const reorderProfile = async (profileId: string, beforeProfileId: string | null) => {
    if (!settings) return;
    const preview = moveProfileBefore(settings.qualityProfiles, profileId, beforeProfileId);
    if (preview === settings.qualityProfiles) return;
    await commit((current) => {
      const qualityProfiles = moveProfileBefore(
        current.qualityProfiles,
        profileId,
        beforeProfileId
      );
      return qualityProfiles === current.qualityProfiles
        ? current
        : { ...current, qualityProfiles: [...qualityProfiles] };
    });
  };

  return {
    actions: { confirmDelete, reorderProfile, saveProfile, selectProfile },
    dialogs: { deleteProfile, editor, setDeleteProfile, setEditor },
    profiles: {
      builtIn: BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
      custom: settings?.qualityProfiles ?? [],
      isAtLimit: (settings?.qualityProfiles.length ?? 0) >= VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT,
      selectedId: settings?.qualityProfileId ?? null,
    },
    state: { busy, error, settings },
  };
}
