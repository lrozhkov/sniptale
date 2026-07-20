// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openScreenshotModeSpy, triggerQuickActionSpy } = vi.hoisted(() => ({
  openScreenshotModeSpy: vi.fn(),
  triggerQuickActionSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../navigation/actions', () => ({
  DynamicIcon: () => null,
  IDLE_RECORDING_STATE: null,
  PopupPage: {},
  describeCaptureSource: vi.fn(),
  formatDuration: vi.fn(),
  formatHotkeyShort: vi.fn(),
  getCaptureModeLabels: vi.fn(),
  getQuickActionColor: vi.fn(),
  getQuickActionMeta: vi.fn(),
  getRecordingStatusLabel: vi.fn(),
  getViewportPresetLabel: vi.fn(),
  openDesignSystem: vi.fn(),
  openGallery: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openScreenshotMode: openScreenshotModeSpy,
  openSettings: vi.fn(),
  openGithubRepository: vi.fn(),
  openVideoEditor: vi.fn(),
  triggerQuickAction: triggerQuickActionSpy,
}));

import { usePopupHomeActions } from './actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHookState: ReturnType<typeof usePopupHomeActions> | null = null;

function HookHarness(props: {
  quickActionsDisabledReason?: string | null;
  screenshotDisabledReason?: string | null;
}) {
  latestHookState = usePopupHomeActions(props);
  return <div data-testid="hook-error">{latestHookState.actionError}</div>;
}

async function renderHarness(props: {
  quickActionsDisabledReason?: string | null;
  screenshotDisabledReason?: string | null;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestHookState = null;
  openScreenshotModeSpy.mockReset();
  triggerQuickActionSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('use-popup-home-actions', () => {
  it('stores the screenshot disabled reason without calling popup utilities', async () => {
    await renderHarness({
      screenshotDisabledReason: 'Screenshots are disabled',
    });

    await act(async () => {
      await latestHookState?.handleOpenScreenshotMode();
    });

    expect(container?.textContent).toContain('Screenshots are disabled');
    expect(openScreenshotModeSpy).not.toHaveBeenCalled();
  });

  it('clears stale errors and opens screenshot mode on success', async () => {
    await renderHarness({
      screenshotDisabledReason: 'Screenshots are disabled',
    });

    await act(async () => {
      await latestHookState?.handleOpenScreenshotMode();
    });

    expect(container?.textContent).toContain('Screenshots are disabled');

    await renderHarness({});

    await act(async () => {
      await latestHookState?.handleOpenScreenshotMode();
    });

    expect(openScreenshotModeSpy).toHaveBeenCalled();
    expect(container?.textContent ?? '').not.toContain('Screenshots are disabled');
  });
});

describe('use-popup-home-actions quick actions', () => {
  it('uses explicit and fallback quick-action errors', async () => {
    await renderHarness({
      quickActionsDisabledReason: 'Quick actions are disabled',
    });

    await act(async () => {
      await latestHookState?.handleQuickAction('action-1');
    });

    expect(container?.textContent).toContain('Quick actions are disabled');
    expect(triggerQuickActionSpy).not.toHaveBeenCalled();

    triggerQuickActionSpy.mockRejectedValueOnce(new Error('Action failed'));
    await renderHarness({});
    await act(async () => {
      await latestHookState?.handleQuickAction('action-2');
    });
    expect(container?.textContent).toContain('Action failed');

    triggerQuickActionSpy.mockRejectedValueOnce('no-error-object');
    await act(async () => {
      await latestHookState?.handleQuickAction('action-3');
    });

    expect(triggerQuickActionSpy).toHaveBeenNthCalledWith(1, 'action-2');
    expect(triggerQuickActionSpy).toHaveBeenNthCalledWith(2, 'action-3');
    expect(container?.textContent).toContain('t:popup.home.triggerQuickActionError');
  });
});
