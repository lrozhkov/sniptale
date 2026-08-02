// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
  type VideoRecordingProfile,
} from '@sniptale/runtime-contracts/video/types/types';

const { loadVideoSettingsMock, mutateVideoSettingsMock } = vi.hoisted(() => ({
  loadVideoSettingsMock: vi.fn(),
  mutateVideoSettingsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: loadVideoSettingsMock,
  mutateVideoSettings: mutateVideoSettingsMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useVideoQualityProfiles } from './use-profiles';

let container: HTMLDivElement | null = null;
let latest: ReturnType<typeof useVideoQualityProfiles> | null = null;
let root: Root | null = null;

const existingProfile: VideoRecordingProfile = {
  id: 'custom:review',
  name: 'Review',
  configuration: {
    ...DEFAULT_VIDEO_SETTINGS.outputProfile,
    codec: VideoOutputCodec.VP9,
    container: VideoOutputContainer.WEBM,
    resolution: VideoResolutionPreset.P720,
    quality: VideoQuality.MEDIUM,
  },
};

function Harness() {
  latest = useVideoQualityProfiles();
  return null;
}

function requireState(): ReturnType<typeof useVideoQualityProfiles> {
  if (!latest) throw new Error('Video profile state is unavailable');
  return latest;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadVideoSettingsMock.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    outputProfile: existingProfile.configuration,
    qualityProfileId: existingProfile.id,
    qualityProfiles: [existingProfile],
  });
  mutateVideoSettingsMock.mockImplementation(async (mutation) =>
    mutation({
      ...DEFAULT_VIDEO_SETTINGS,
      outputProfile: existingProfile.configuration,
      qualityProfileId: existingProfile.id,
      qualityProfiles: [existingProfile],
    })
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('loads built-in and custom profiles and materializes a selected profile', async () => {
  await renderHarness();

  expect(requireState().profiles.builtIn).toHaveLength(4);
  expect(requireState().profiles.custom).toEqual([existingProfile]);

  const maximum = requireState().profiles.builtIn[3];
  if (!maximum) throw new Error('Maximum profile is unavailable');
  await act(async () => requireState().actions.selectProfile(maximum));

  const mutation = mutateVideoSettingsMock.mock.calls[0]?.[0];
  expect(mutation?.(DEFAULT_VIDEO_SETTINGS)).toEqual(
    expect.objectContaining({
      outputProfile: maximum.configuration,
      qualityProfileId: maximum.id,
    })
  );
});

it('updates the active profile and its materialized recording settings atomically', async () => {
  await renderHarness();
  const edited = {
    ...existingProfile,
    name: 'Review MP4',
    configuration: {
      ...existingProfile.configuration,
      codec: VideoOutputCodec.AVC,
      container: VideoOutputContainer.MP4,
      resolution: VideoResolutionPreset.P1080,
      quality: VideoQuality.HIGH,
    },
  } as const;

  await act(async () => requireState().actions.saveProfile(edited));

  const mutation = mutateVideoSettingsMock.mock.calls[0]?.[0];
  expect(
    mutation?.({
      ...DEFAULT_VIDEO_SETTINGS,
      outputProfile: existingProfile.configuration,
      qualityProfileId: existingProfile.id,
      qualityProfiles: [existingProfile],
    })
  ).toEqual(
    expect.objectContaining({
      outputProfile: edited.configuration,
      qualityProfileId: edited.id,
      qualityProfiles: [edited],
    })
  );
});

it('deletes a custom profile and clears its selected-profile marker', async () => {
  await renderHarness();
  act(() => requireState().dialogs.setDeleteProfile(existingProfile));
  await act(async () => requireState().actions.confirmDelete());

  const mutation = mutateVideoSettingsMock.mock.calls[0]?.[0];
  expect(
    mutation?.({
      ...DEFAULT_VIDEO_SETTINGS,
      qualityProfileId: existingProfile.id,
      qualityProfiles: [existingProfile],
    })
  ).toEqual(
    expect.objectContaining({
      qualityProfileId: null,
      qualityProfiles: [],
    })
  );
});

it('surfaces load and save failures without replacing the current settings', async () => {
  loadVideoSettingsMock.mockRejectedValueOnce(new Error('load failed'));
  await renderHarness();
  expect(requireState().state.error).toBe('settings.videoQuality.loadError');

  act(() => root?.unmount());
  root = createRoot(container as HTMLDivElement);
  loadVideoSettingsMock.mockResolvedValueOnce(DEFAULT_VIDEO_SETTINGS);
  await act(async () => root?.render(<Harness />));
  mutateVideoSettingsMock.mockRejectedValueOnce(new Error('save failed'));

  await act(async () =>
    requireState().actions.saveProfile({
      ...existingProfile,
      id: 'custom:new',
      name: ' New profile ',
    })
  );

  expect(requireState().state.error).toBe('settings.videoQuality.saveError');
  expect(requireState().state.settings).toEqual(DEFAULT_VIDEO_SETTINGS);
});

it('rejects a concurrent add at the locked profile limit and keeps the editor open', async () => {
  const profilesAtLimit = Array.from(
    { length: VIDEO_RECORDING_CUSTOM_PROFILE_LIMIT },
    (_, index): VideoRecordingProfile => ({
      ...existingProfile,
      id: `custom:${index}`,
      name: `Profile ${index}`,
    })
  );
  mutateVideoSettingsMock.mockImplementationOnce(async (mutation) =>
    mutation({
      ...DEFAULT_VIDEO_SETTINGS,
      qualityProfileId: null,
      qualityProfiles: profilesAtLimit,
    })
  );
  await renderHarness();
  act(() => requireState().dialogs.setEditor({}));

  await act(async () =>
    requireState().actions.saveProfile({
      ...existingProfile,
      id: 'custom:new',
      name: 'New profile',
    })
  );

  expect(requireState().state.error).toBe('settings.videoQuality.saveError');
  expect(requireState().dialogs.editor).toEqual({});
});
