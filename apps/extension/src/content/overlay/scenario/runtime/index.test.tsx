// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { useScenarioControllerRuntime } from './index';
import { createScenarioSession } from '../session/test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ScenarioRuntimeHarness(props: {
  onReady: (runtime: ReturnType<typeof useScenarioControllerRuntime>) => void;
}) {
  const runtime = useScenarioControllerRuntime({
    applyScenarioResponse: vi.fn(),
    currentSurfaceRef: {
      current: {
        captureAction: 'download_default',
        screenshotMode: true,
        toolbarVisible: true,
      },
    },
    effectiveSession: createScenarioSession(),
    navigationLockEnabled: true,
    refreshSession: vi.fn(async () => undefined),
    screenshotMode: true,
    sessionRef: { current: createScenarioSession() },
    setNavigationLockEnabled: vi.fn(),
    setOptimisticCaptureMode: vi.fn(),
  });

  useEffect(() => {
    props.onReady(runtime);
  }, [props, runtime]);

  return null;
}

async function renderHarness(
  onReady: (runtime: ReturnType<typeof useScenarioControllerRuntime>) => void
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioRuntimeHarness onReady={onReady} />);
  });
}

describe('useScenarioControllerRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installContentRuntimeMessagingMock(sendRuntimeMessageMock);
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

  it('opens the scenario editor through the runtime transport and resolves as Promise<void>', async () => {
    let runtime: ReturnType<typeof useScenarioControllerRuntime> | null = null;
    await renderHarness((currentRuntime) => {
      runtime = currentRuntime;
    });

    expect(runtime).not.toBeNull();

    await expect(runtime!.controllerActions.openEditor('step-1')).resolves.toBeUndefined();
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: MessageType.SCENARIO_OPEN_EDITOR,
      projectId: 'project-1',
      stepId: 'step-1',
    });
  });
});
