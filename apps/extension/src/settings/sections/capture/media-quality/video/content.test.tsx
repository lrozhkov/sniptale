// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="confirm-dialog">
        <button onClick={props.onConfirm}>confirm</button>
        <button onClick={props.onCancel}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock('./profile-editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./profile-editor')>()),
  VideoQualityProfileEditor: (props: {
    onClose: () => void;
    onSave: (profile: VideoRecordingProfile) => Promise<void>;
    profile?: VideoRecordingProfile;
  }) => {
    const profile = props.profile;
    return (
      <div data-testid="profile-editor">
        <button onClick={props.onClose}>close-editor</button>
        {profile ? <button onClick={() => void props.onSave(profile)}>save-editor</button> : null}
      </div>
    );
  },
}));

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
  type VideoRecordingProfile,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoQualityProfilesContent } from './content';
import type { ReturnTypeUseProfiles } from './types';

const customProfile: VideoRecordingProfile = {
  id: 'custom:review',
  name: 'Review',
  configuration: {
    ...DEFAULT_VIDEO_SETTINGS.outputProfile,
    codec: VideoOutputCodec.AVC,
    container: VideoOutputContainer.MP4,
    resolution: VideoResolutionPreset.P720,
    quality: VideoQuality.MEDIUM,
  },
};
const secondCustomProfile: VideoRecordingProfile = {
  ...customProfile,
  id: 'custom:compact',
  name: 'Compact',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<ReturnTypeUseProfiles> = {}): ReturnTypeUseProfiles {
  return {
    actions: {
      confirmDelete: vi.fn(async () => undefined),
      reorderProfile: vi.fn(async () => undefined),
      saveProfile: vi.fn(async () => undefined),
      selectProfile: vi.fn(async () => undefined),
    },
    dialogs: {
      deleteProfile: customProfile,
      editor: { profile: customProfile },
      setDeleteProfile: vi.fn(),
      setEditor: vi.fn(),
    },
    profiles: {
      builtIn: BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
      custom: [customProfile, secondCustomProfile],
      isAtLimit: false,
      selectedId: customProfile.id,
    },
    state: {
      busy: false,
      error: 'save error',
      settings: DEFAULT_VIDEO_SETTINGS,
    },
    ...overrides,
  };
}

function renderContent(props = createProps()) {
  act(() => root?.render(<VideoQualityProfilesContent {...props} />));
  return props;
}

function clickByLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  act(() => button?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('renders profile groups and forwards profile, editor, and delete actions', () => {
  const props = renderContent();
  expect(container?.textContent).toContain('Review');
  expect(container?.textContent).toContain('720p · MP4 · H.264 (AVC) · 30 fps');
  expect(container?.textContent).toContain('save error');
  expect(container?.textContent).toContain('settings.collection.defaultBadge');

  const builtInRow = container?.querySelector(
    `[data-settings-collection-item="${props.profiles.builtIn[0]?.id}"]`
  );
  expect(builtInRow?.querySelector('[aria-label="settings.collection.actions.menu"]')).toBeNull();
  expect(builtInRow?.querySelector('[data-collection-direct-action="set-default"]')).not.toBeNull();
  expect(builtInRow?.querySelector('[aria-label="settings.collection.dragHandle"]')).toBeNull();

  const customHandle = container?.querySelector<HTMLElement>(
    `[data-settings-collection-item="${customProfile.id}"] [aria-label="settings.collection.dragHandle"]`
  );
  expect(customHandle).not.toBeNull();

  const addButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('settings.videoQuality.addProfile')
  );
  act(() => addButton?.click());
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'settings.collection.actions.setDefault')
      ?.click()
  );
  act(() => customHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  act(() =>
    customHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  );
  act(() => customHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  clickByLabel('settings.collection.actions.edit');
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'settings.collection.actions.delete')
      ?.click()
  );
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'save-editor')
      ?.click()
  );
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'close-editor')
      ?.click()
  );
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'confirm')
      ?.click()
  );
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'cancel-delete')
      ?.click()
  );

  expect(props.dialogs.setEditor).toHaveBeenCalled();
  expect(props.dialogs.setDeleteProfile).toHaveBeenCalled();
  expect(props.actions.selectProfile).toHaveBeenCalled();
  expect(props.actions.reorderProfile).toHaveBeenCalledWith(customProfile.id, null);
  expect(props.actions.saveProfile).toHaveBeenCalledWith(customProfile);
  expect(props.actions.confirmDelete).toHaveBeenCalled();
});

it('renders the empty custom state without dialogs', () => {
  renderContent(
    createProps({
      dialogs: {
        deleteProfile: null,
        editor: null,
        setDeleteProfile: vi.fn(),
        setEditor: vi.fn(),
      },
      profiles: {
        builtIn: BUILT_IN_VIDEO_RECORDING_QUALITY_PROFILES,
        custom: [],
        isAtLimit: true,
        selectedId: null,
      },
      state: { busy: true, error: null, settings: DEFAULT_VIDEO_SETTINGS },
    })
  );

  expect(container?.textContent).toContain('settings.videoQuality.customEmpty');
  expect(container?.querySelector('[data-testid="profile-editor"]')).toBeNull();
  expect(container?.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
});
