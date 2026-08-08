// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBlurFrameManager } from './operations';

const feedbackMocks = vi.hoisted(() => ({
  applyAutoBlurWithSettings: vi.fn(),
  loadSettingsOrDefault: vi.fn(),
  logger: { error: vi.fn() },
  showToast: vi.fn(),
}));

vi.mock('./operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./operations')>()),
  applyAutoBlurWithSettings: feedbackMocks.applyAutoBlurWithSettings,
  loadSettingsOrDefault: feedbackMocks.loadSettingsOrDefault,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => feedbackMocks.logger,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: feedbackMocks.showToast,
}));

import { useApplyOnceAction } from './actions';

let applyOnce: (() => Promise<void>) | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;
const beginApplying = vi.fn();
const failApplying = vi.fn();
const finishApplying = vi.fn();
const frameManager = {
  clearAutoBlurFrames: vi.fn(),
  frames: [],
  syncAutoBlurFrames: vi.fn(() => ({ addedCount: 0, removedCount: 0, skippedCount: 0 })),
} satisfies AutoBlurFrameManager;

function Harness() {
  applyOnce = useApplyOnceAction({
    beginApplying,
    failApplying,
    finishApplying,
    frameManager,
    runFullPageScan: (_owner, operation) => operation(new AbortController().signal),
  });
  return null;
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  feedbackMocks.loadSettingsOrDefault.mockResolvedValue({
    autoApplyEnabled: false,
    blurSettings: { amount: 10, blurType: 'solid', showBorder: false },
    selectedCategories: ['email'],
  });
  await renderHarness();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  applyOnce = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('apply-once auto-blur feedback', () => {
  it('reports the number of elements that were actually hidden', async () => {
    feedbackMocks.applyAutoBlurWithSettings.mockResolvedValue({
      addedCount: 10,
      removedCount: 0,
      skippedCount: 0,
    });

    await act(async () => applyOnce?.());

    expect(feedbackMocks.applyAutoBlurWithSettings).toHaveBeenCalledWith(
      expect.objectContaining({ scanMode: 'full-page' })
    );
    expect(feedbackMocks.showToast).toHaveBeenCalledOnce();
    expect(feedbackMocks.showToast).toHaveBeenCalledWith('Найденные данные скрыты: 10', 'success');
    expect(failApplying).not.toHaveBeenCalled();
    expect(beginApplying).toHaveBeenCalledOnce();
    expect(finishApplying).toHaveBeenCalledOnce();
  });

  it('uses neutral feedback when no matching data was found', async () => {
    feedbackMocks.applyAutoBlurWithSettings.mockResolvedValue({
      addedCount: 0,
      removedCount: 0,
      skippedCount: 0,
    });

    await act(async () => applyOnce?.());

    expect(feedbackMocks.showToast).toHaveBeenCalledWith('Данные для размытия не найдены', 'info');
  });

  it('keeps controller failure state and reports an actionable error', async () => {
    const error = new Error('scan failed');
    feedbackMocks.applyAutoBlurWithSettings.mockRejectedValue(error);

    await act(async () => applyOnce?.());

    expect(failApplying).toHaveBeenCalledWith('content.autoBlur.applyError');
    expect(feedbackMocks.showToast).toHaveBeenCalledWith(
      'Не удалось найти и размыть данные',
      'error'
    );
    expect(feedbackMocks.logger.error).toHaveBeenCalledWith(
      'Failed to apply auto-blur once',
      error
    );
    expect(finishApplying).toHaveBeenCalledOnce();
  });
});
