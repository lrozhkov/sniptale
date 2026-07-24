// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerScenarioSuggestedEventListenersMock = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock('./helpers', () => ({
  registerScenarioSuggestedEventListeners: registerScenarioSuggestedEventListenersMock,
}));

import { useScenarioSuggestedEventLogging } from '.';

type HarnessProps = Parameters<typeof useScenarioSuggestedEventLogging>[0];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness(props: HarnessProps) {
  useScenarioSuggestedEventLogging(props);
  return null;
}

async function renderHarness(props: HarnessProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

function createProps(overrides: Partial<HarnessProps> = {}): HarnessProps {
  return {
    pendingProjectSelection: false,
    projectId: 'project-1',
    scenarioEnabled: true,
    screenshotMode: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

describe('useScenarioSuggestedEventLogging', () => {
  it('resubscribes with the latest project while scenario logging remains active', async () => {
    const cleanup = vi.fn();
    registerScenarioSuggestedEventListenersMock.mockReturnValueOnce(cleanup);

    await renderHarness(createProps());

    expect(registerScenarioSuggestedEventListenersMock).toHaveBeenCalledWith('project-1');

    await renderHarness(createProps({ projectId: 'project-2' }));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(registerScenarioSuggestedEventListenersMock).toHaveBeenLastCalledWith('project-2');
  });

  it('does not subscribe while project selection blocks scenario logging', async () => {
    await renderHarness(createProps({ pendingProjectSelection: true }));

    expect(registerScenarioSuggestedEventListenersMock).not.toHaveBeenCalled();
  });
});
