import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoRecordingBuiltInProfileId,
  getVideoRecordingProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoSettingsMutation } from '../../../../composition/persistence/capture-settings';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn<(mutation: VideoSettingsMutation) => Promise<VideoRecordingSettings>>(),
}));
vi.mock('../../../../composition/persistence/capture-settings', () => ({
  mutateVideoSettings: mocks.mutate,
}));
import { updateVideoRecordingOutputSettings } from './quality-settings';

let current: VideoRecordingSettings;
beforeEach(() => {
  vi.clearAllMocks();
  current = { ...DEFAULT_VIDEO_SETTINGS };
  mocks.mutate.mockImplementation(async (mutation) => {
    const next = mutation(current);
    current = next;
    return next;
  });
});

it('resolves a selected profile against current settings and preserves concurrent unrelated edits', async () => {
  const profile = {
    id: 'custom:latest',
    name: 'Latest',
    configuration: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, frameRate: 60 as const },
  };
  mocks.mutate.mockImplementationOnce(async (mutation) => {
    current = { ...current, microphoneGain: 1.5, qualityProfiles: [profile] };
    current = mutation(current);
    return current;
  });
  await updateVideoRecordingOutputSettings(
    { kind: 'select-quality-profile', profileId: profile.id },
    () => undefined
  );
  expect(current).toMatchObject({
    microphoneGain: 1.5,
    qualityProfiles: [profile],
    qualityProfileId: profile.id,
    outputProfile: profile.configuration,
  });
});

it('rejects a profile removed before the mutation permit without changing accepted settings', async () => {
  const previous = current;
  await expect(
    updateVideoRecordingOutputSettings(
      { kind: 'select-quality-profile', profileId: 'custom:removed' },
      () => undefined
    )
  ).rejects.toThrow('profile is unavailable');
  expect(current).toBe(previous);
});

it('commits built-in profile configuration and identifier together', async () => {
  const id = VideoRecordingBuiltInProfileId.COMPACT;
  await updateVideoRecordingOutputSettings(
    { kind: 'select-quality-profile', profileId: id },
    () => undefined
  );
  expect(current.outputProfile).toEqual(getVideoRecordingProfile(current, id)?.configuration);
  expect(current.qualityProfileId).toBe(id);
});

it('clears the profile identifier on a manual output edit while preserving custom profiles', async () => {
  const outputProfile = { ...current.outputProfile, frameRate: 60 as const };
  const qualityProfiles = [{ id: 'custom:one', name: 'One', configuration: current.outputProfile }];
  current = { ...current, qualityProfiles };
  await updateVideoRecordingOutputSettings(
    { kind: 'set-output-profile', outputProfile },
    () => undefined
  );
  expect(current).toMatchObject({ outputProfile, qualityProfileId: null, qualityProfiles });
});

it('checks authority again inside the mutation permit before changing settings', async () => {
  const requireAuthority = vi
    .fn()
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      throw new Error('surface retired');
    });
  const previous = current;
  await expect(
    updateVideoRecordingOutputSettings(
      { kind: 'select-quality-profile', profileId: VideoRecordingBuiltInProfileId.COMPACT },
      requireAuthority
    )
  ).rejects.toThrow('surface retired');
  expect(requireAuthority).toHaveBeenCalledTimes(2);
  expect(current).toBe(previous);
});

it('preserves accepted settings after failed persistence and permits an explicit retry', async () => {
  const previous = current;
  mocks.mutate.mockRejectedValueOnce(new Error('storage unavailable'));
  const command = {
    kind: 'select-quality-profile' as const,
    profileId: VideoRecordingBuiltInProfileId.COMPACT,
  };
  await expect(updateVideoRecordingOutputSettings(command, () => undefined)).rejects.toThrow(
    'storage unavailable'
  );
  expect(current).toBe(previous);
  await updateVideoRecordingOutputSettings(command, () => undefined);
  expect(current.qualityProfileId).toBe(command.profileId);
});
