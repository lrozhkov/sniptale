// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openScreenshotModeSpy, triggerQuickActionSpy, triggerScreenshotCaptureSpy } = vi.hoisted(
  () => ({
    openScreenshotModeSpy: vi.fn(),
    triggerQuickActionSpy: vi.fn(),
    triggerScreenshotCaptureSpy: vi.fn(),
  })
);

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../navigation/actions')>()),
  openScreenshotMode: openScreenshotModeSpy,
  triggerQuickAction: triggerQuickActionSpy,
  triggerScreenshotCapture: triggerScreenshotCaptureSpy,
}));

import { usePopupHomeActions } from './actions';
import type { QuickAction } from '../../../../contracts/settings';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestHookState: ReturnType<typeof usePopupHomeActions> | null = null;

function HookHarness(props: {
  quickActions: QuickAction[];
  quickActionsDisabledReason?: string | null;
  screenshotDisabledReason?: string | null;
}) {
  latestHookState = usePopupHomeActions(props);
  return <div data-testid="hook-error">{latestHookState.actionError}</div>;
}

async function renderHarness(props: {
  quickActions?: QuickAction[];
  quickActionsDisabledReason?: string | null;
  screenshotDisabledReason?: string | null;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness quickActions={props.quickActions ?? []} {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestHookState = null;
  openScreenshotModeSpy.mockReset();
  triggerQuickActionSpy.mockReset();
  triggerScreenshotCaptureSpy.mockReset();
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

  it('surfaces explicit and fallback errors while opening tools', async () => {
    await renderHarness({});
    openScreenshotModeSpy.mockRejectedValueOnce(new Error('Tools failed'));
    await act(async () => {
      await latestHookState?.handleOpenScreenshotMode();
    });
    expect(container?.textContent).toContain('Tools failed');
    openScreenshotModeSpy.mockRejectedValueOnce('unknown');
    await act(async () => {
      await latestHookState?.handleOpenScreenshotMode();
    });
    expect(container?.textContent).toContain('t:popup.home.openPrepError');
  });
});

describe('use-popup-home-actions direct capture', () => {
  const config = {
    screenshotMode: 'desktop' as const,
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default' as const,
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  };

  it('blocks unavailable capture before transport', async () => {
    await renderHarness({});
    await act(async () => {
      await latestHookState?.handleScreenshotCapture(config, 'Capture blocked');
    });
    expect(container?.textContent).toContain('Capture blocked');
    expect(triggerScreenshotCaptureSpy).not.toHaveBeenCalled();
  });

  it('marks accepted capture pending and ignores duplicate starts', async () => {
    triggerScreenshotCaptureSpy.mockResolvedValue(undefined);
    await renderHarness({});
    await act(async () => {
      await latestHookState?.handleScreenshotCapture(config, null);
    });
    expect(latestHookState?.capturePending).toBe(true);
    await act(async () => {
      await latestHookState?.handleScreenshotCapture(config, null);
    });
    expect(triggerScreenshotCaptureSpy).toHaveBeenCalledOnce();
  });

  it('surfaces explicit and fallback failures and releases pending state', async () => {
    triggerScreenshotCaptureSpy.mockRejectedValueOnce(new Error('Capture failed'));
    await renderHarness({});
    await act(async () => {
      await latestHookState?.handleScreenshotCapture(config, null);
    });
    expect(container?.textContent).toContain('Capture failed');
    expect(latestHookState?.capturePending).toBe(false);
    triggerScreenshotCaptureSpy.mockRejectedValueOnce('unknown');
    await act(async () => {
      await latestHookState?.handleScreenshotCapture(config, null);
    });
    expect(container?.textContent).toContain('t:popup.home.captureError');
  });
});

describe('use-popup-home-actions quick actions', () => {
  it('marks desktop actions for popup-owned source selection', async () => {
    triggerQuickActionSpy.mockResolvedValue(undefined);
    const desktopAction = {
      id: 'desktop-action',
      screenshotMode: 'desktop',
    } as QuickAction;
    await renderHarness({ quickActions: [desktopAction] });

    await act(async () => {
      await latestHookState?.handleQuickAction('desktop-action');
    });

    expect(triggerQuickActionSpy).toHaveBeenCalledWith('desktop-action', true);
  });

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

    expect(triggerQuickActionSpy).toHaveBeenNthCalledWith(1, 'action-2', false);
    expect(triggerQuickActionSpy).toHaveBeenNthCalledWith(2, 'action-3', false);
    expect(container?.textContent).toContain('t:popup.home.triggerQuickActionError');
  });
});
