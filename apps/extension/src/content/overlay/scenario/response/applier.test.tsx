// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioProjectSummary,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../features/scenario/contracts/types/project';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import { createDefaultScenarioRestoreSnapshot } from '../session/defaults';
import { useScenarioResponseApplier } from './applier';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestApplyScenarioResponse: ReturnType<typeof useScenarioResponseApplier> | null = null;

const sessionRef = { current: createDefaultScenarioRestoreSnapshot().session };
const applySurfaceState = vi.fn();
const setOptimisticCaptureMode = vi.fn();
const setProjects = vi.fn();
const setHighlightToken = vi.fn();
const setRecentSteps = vi.fn();
const setSession = vi.fn();
const setTrashedSteps = vi.fn();

function Harness() {
  latestApplyScenarioResponse = useScenarioResponseApplier({
    applySurfaceState,
    sessionRef,
    setOptimisticCaptureMode: setOptimisticCaptureMode as (
      captureMode: ScenarioCaptureMode | null
    ) => void,
    setProjects: setProjects as React.Dispatch<React.SetStateAction<ScenarioProjectSummary[]>>,
    setHighlightToken: setHighlightToken as React.Dispatch<React.SetStateAction<number>>,
    setRecentSteps: setRecentSteps as React.Dispatch<React.SetStateAction<ScenarioRecentStep[]>>,
    setSession: setSession as React.Dispatch<React.SetStateAction<ScenarioSessionState>>,
    setTrashedSteps: setTrashedSteps as React.Dispatch<React.SetStateAction<ScenarioTrashedStep[]>>,
  });

  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

function getLatestApplyScenarioResponse() {
  expect(latestApplyScenarioResponse).not.toBeNull();
  return latestApplyScenarioResponse as ReturnType<typeof useScenarioResponseApplier>;
}

function createSnapshotResponseFixture() {
  const snapshot = createDefaultScenarioRestoreSnapshot();

  return {
    expectedProjects: [
      { id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 10 },
    ] satisfies ScenarioProjectSummary[],
    expectedRecentSteps: [
      { id: 'step-1', position: 0, previewDataUrl: 'data:1', title: 'Step 1' },
    ] satisfies ScenarioRecentStep[],
    expectedTrashedSteps: [
      { id: 'trash-1', deletedAt: 20, kind: 'capture', originalIndex: 1, title: 'Trash' },
    ] satisfies ScenarioTrashedStep[],
    snapshot,
  };
}

function applySnapshotResponseFixture() {
  const fixture = createSnapshotResponseFixture();

  act(() => {
    getLatestApplyScenarioResponse()({
      snapshot: fixture.snapshot,
      success: true,
      projects: fixture.expectedProjects,
      recentSteps: fixture.expectedRecentSteps,
      trashedSteps: fixture.expectedTrashedSteps,
    });
  });

  return fixture;
}

function applyResponseDataFixture() {
  const recentSteps = [{ id: 'step-1', position: 0, previewDataUrl: 'data:1', title: 'Step 1' }];

  act(() => {
    getLatestApplyScenarioResponse()({
      success: true,
      recentSteps,
      session: {
        captureMode: 'manual',
        enabled: true,
        pendingProjectSelection: false,
        projectId: 'project-1',
        projectName: 'Project 1',
        rememberProjectSelection: true,
        sidebarVisible: true,
      },
      stepId: 'step-1',
      surface: {
        captureAction: 'scenario',
        screenshotMode: true,
        toolbarVisible: true,
      } satisfies ScenarioRecorderSurfaceState,
    });
  });

  return { recentSteps };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestApplyScenarioResponse = null;
  sessionRef.current = createDefaultScenarioRestoreSnapshot().session;
  vi.clearAllMocks();
});

describe('scenario response applier hook', () => {
  it('keeps the composed response applier stable across rerenders', async () => {
    await renderHarness();
    const firstApplyScenarioResponse = getLatestApplyScenarioResponse();

    await renderHarness();
    const secondApplyScenarioResponse = getLatestApplyScenarioResponse();

    expect(secondApplyScenarioResponse).toBe(firstApplyScenarioResponse);
  });

  it('applies snapshot restores, collections, and preview updates through the composed hook', async () => {
    await renderHarness();
    const fixture = applySnapshotResponseFixture();

    expect(setSession).toHaveBeenCalledWith(fixture.snapshot.session);
    expect(sessionRef.current).toEqual(fixture.snapshot.session);
    expect(applySurfaceState).toHaveBeenCalledWith(fixture.snapshot.surface, {
      syncModeState: false,
    });
    expect(setOptimisticCaptureMode).toHaveBeenCalledWith(null);
    expect(setProjects).toHaveBeenCalledWith(fixture.expectedProjects);
    expect(setRecentSteps).toHaveBeenCalledWith(fixture.expectedRecentSteps);
    expect(setTrashedSteps).toHaveBeenCalledWith(fixture.expectedTrashedSteps);
  });

  it('applies response data and refreshed recent steps without snapshot restore', async () => {
    await renderHarness();
    const { recentSteps } = applyResponseDataFixture();

    expect(setSession).toHaveBeenCalledTimes(1);
    expect(setOptimisticCaptureMode).toHaveBeenCalledWith(null);
    expect(applySurfaceState).toHaveBeenCalledWith({
      captureAction: 'scenario',
      screenshotMode: true,
      toolbarVisible: true,
    });
    expect(setRecentSteps).toHaveBeenCalledWith(recentSteps);
  });
});
