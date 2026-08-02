import { expect, it, vi } from 'vitest';

const { contentMock, loadingMock, useProfilesMock } = vi.hoisted(() => ({
  contentMock: vi.fn(),
  loadingMock: vi.fn(),
  useProfilesMock: vi.fn(),
}));

vi.mock('./use-profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-profiles')>()),
  useVideoQualityProfiles: useProfilesMock,
}));

vi.mock('./content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./content')>()),
  VideoQualityProfilesContent: contentMock,
}));

vi.mock('../../section-surface/loading-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../section-surface/loading-state')>()),
  DelayedSettingsCenteredLoadingState: loadingMock,
}));

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoQualityProfilesSection } from '.';
import type { ReturnTypeUseProfiles } from './types';

function createState(
  settings: ReturnTypeUseProfiles['state']['settings'],
  error: string | null
): ReturnTypeUseProfiles {
  return {
    actions: {
      confirmDelete: vi.fn(async () => undefined),
      saveProfile: vi.fn(async () => undefined),
      selectProfile: vi.fn(async () => undefined),
    },
    dialogs: {
      deleteProfile: null,
      editor: null,
      setDeleteProfile: vi.fn(),
      setEditor: vi.fn(),
    },
    profiles: { builtIn: [], custom: [], isAtLimit: false, selectedId: null },
    state: { busy: false, error, settings },
  };
}

it('shows loading until settings or an error is available', () => {
  useProfilesMock.mockReturnValue(createState(null, null));
  expect(VideoQualityProfilesSection().type).toBe(loadingMock);

  const ready = createState(DEFAULT_VIDEO_SETTINGS, null);
  useProfilesMock.mockReturnValue(ready);
  const content = VideoQualityProfilesSection();
  expect(content.type).toBe(contentMock);
  expect(content.props).toEqual(ready);

  useProfilesMock.mockReturnValue(createState(null, 'load error'));
  expect(VideoQualityProfilesSection().type).toBe(contentMock);
});
