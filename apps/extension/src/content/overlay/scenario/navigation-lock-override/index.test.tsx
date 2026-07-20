// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const helperMocks = vi.hoisted(() => ({
  restoreNavigationLockState: vi.fn(),
}));

vi.mock('../../screenshot/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../screenshot/bridge')>()),
  restoreNavigationLockState: helperMocks.restoreNavigationLockState,
}));

import { useScenarioNavigationLockOverride } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type HarnessProps = Parameters<typeof useScenarioNavigationLockOverride>[0];

function Harness(props: HarnessProps) {
  useScenarioNavigationLockOverride(props);
  return null;
}

async function renderHarness(props: HarnessProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

function createProps(overrides: Partial<HarnessProps> = {}): HarnessProps {
  return {
    navigationLockEnabled: true,
    pendingProjectSelection: false,
    scenarioCaptureMode: 'by-click',
    scenarioEnabled: true,
    screenshotMode: true,
    setNavigationLockEnabled: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function expectNavigationLockOverrideLifecycle() {
  const props = createProps();

  await renderHarness(props);

  expect(helperMocks.restoreNavigationLockState).toHaveBeenNthCalledWith(
    1,
    false,
    props.setNavigationLockEnabled
  );

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(helperMocks.restoreNavigationLockState).toHaveBeenNthCalledWith(
    2,
    true,
    props.setNavigationLockEnabled
  );
}

async function expectScreenshotModeExitSkipsRelock() {
  const props = createProps();

  await renderHarness(props);
  await renderHarness({
    ...props,
    screenshotMode: false,
  });

  expect(helperMocks.restoreNavigationLockState).toHaveBeenCalledTimes(2);
  expect(helperMocks.restoreNavigationLockState).toHaveBeenLastCalledWith(
    true,
    props.setNavigationLockEnabled
  );
}

describe('useScenarioNavigationLockOverride', () => {
  it(
    'disables and then restores navigation lock for scenario by-click mode',
    expectNavigationLockOverrideLifecycle
  );
  it(
    'does not relock navigation when screenshot mode already exited before cleanup',
    expectScreenshotModeExitSkipsRelock
  );
});
