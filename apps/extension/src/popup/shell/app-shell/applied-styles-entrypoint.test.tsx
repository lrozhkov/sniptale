// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentPageAppliedStyleCount: vi.fn(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
  openAppliedPageStyles: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => mocks.logger,
}));

vi.mock('./applied-styles-actions', () => ({
  getCurrentPageAppliedStyleCount: mocks.getCurrentPageAppliedStyleCount,
  openAppliedPageStyles: mocks.openAppliedPageStyles,
}));

import { useAppliedPageStylesEntrypoint } from './applied-styles-entrypoint';

let latest: ReturnType<typeof useAppliedPageStylesEntrypoint> | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness() {
  latest = useAppliedPageStylesEntrypoint();

  return (
    <button
      type="button"
      data-visible={String(latest.showAppliedStylesAction)}
      onClick={latest.handleOpenAppliedStyles}
    >
      open
    </button>
  );
}

async function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness />);
  });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function setRulesUiFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_PAGE_STYLE_RULES__', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setRulesUiFlag(undefined);
  vi.clearAllMocks();
  latest = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  setRulesUiFlag(undefined);
  vi.unstubAllGlobals();
});

describe('useAppliedPageStylesEntrypoint', () => {
  registerAppliedStylesVisibilityTests();
  registerAppliedStylesActionTests();
});

function registerAppliedStylesVisibilityTests() {
  it('stays hidden and skips current-page rule queries when rules UI is release-gated', async () => {
    setRulesUiFlag(false);
    mocks.getCurrentPageAppliedStyleCount.mockResolvedValue(2);

    await renderHarness();
    await flushAsync();

    expect(document.querySelector('button')?.getAttribute('data-visible')).toBe('false');
    expect(mocks.getCurrentPageAppliedStyleCount).not.toHaveBeenCalled();

    latest?.handleOpenAppliedStyles();
    expect(mocks.openAppliedPageStyles).not.toHaveBeenCalled();
  });

  it('shows the footer action when active applied rules exist', async () => {
    mocks.getCurrentPageAppliedStyleCount.mockResolvedValue(2);

    await renderHarness();
    await flushAsync();

    expect(document.querySelector('button')?.getAttribute('data-visible')).toBe('true');
  });

  it('hides the footer action for no-rules and query failures', async () => {
    mocks.getCurrentPageAppliedStyleCount.mockResolvedValueOnce(0);
    await renderHarness();
    await flushAsync();
    expect(document.querySelector('button')?.getAttribute('data-visible')).toBe('false');

    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    mocks.getCurrentPageAppliedStyleCount.mockRejectedValueOnce(new Error('no tab'));
    await renderHarness();
    await flushAsync();

    expect(document.querySelector('button')?.getAttribute('data-visible')).toBe('false');
    expect(mocks.logger.debug).toHaveBeenCalled();
  });
}

function registerAppliedStylesActionTests() {
  it('dispatches the open-inspector action and keeps failures in the popup', async () => {
    mocks.getCurrentPageAppliedStyleCount.mockResolvedValue(1);
    mocks.openAppliedPageStyles.mockRejectedValueOnce(new Error('message failed'));

    await renderHarness();
    await flushAsync();

    await act(async () => {
      latest?.handleOpenAppliedStyles();
      await Promise.resolve();
    });

    expect(mocks.openAppliedPageStyles).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it('ignores late current-page rule summaries after unmount', async () => {
    const summary = createDeferred<number>();
    mocks.getCurrentPageAppliedStyleCount.mockReturnValueOnce(summary.promise);

    await renderHarness();
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    summary.resolve(3);
    await flushAsync();

    expect(document.querySelector('button')).toBeNull();
  });
}
