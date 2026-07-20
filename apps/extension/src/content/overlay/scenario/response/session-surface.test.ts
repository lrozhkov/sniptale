// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  applyScenarioSnapshotOrData,
  createScenarioResponseDataApplier,
  createScenarioRestoreSnapshotApplier,
} from './session-surface';
import { createDefaultScenarioRestoreSnapshot } from '../session/defaults';

function createResponseSession() {
  return {
    captureMode: 'manual' as const,
    enabled: true,
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
  };
}

describe('scenario-response-session-surface', () => {
  it('prefers snapshot restoration over raw response data', expectSnapshotRestorePrecedence);

  it(
    'applies restore snapshots through session ref, surface sync, and optimistic reset',
    expectSnapshotRestoreApplication
  );

  it(
    'applies response session and surface data without snapshot restore',
    expectResponseDataApplication
  );
});

function expectSnapshotRestorePrecedence() {
  const applyRestoreSnapshot = vi.fn();
  const applyScenarioResponseData = vi.fn();
  const snapshot = createDefaultScenarioRestoreSnapshot();

  applyScenarioSnapshotOrData(
    {
      snapshot,
      success: true,
      surface: {
        captureAction: 'scenario',
        screenshotMode: true,
        toolbarVisible: true,
      },
    },
    {
      applyRestoreSnapshot,
      applyScenarioResponseData,
    }
  );

  expect(applyRestoreSnapshot).toHaveBeenCalledWith(snapshot);
  expect(applyScenarioResponseData).not.toHaveBeenCalled();
}

function expectSnapshotRestoreApplication() {
  const snapshot = createDefaultScenarioRestoreSnapshot();
  const setSession = vi.fn();
  const applySurfaceState = vi.fn();
  const setOptimisticCaptureMode = vi.fn();
  const sessionRef = { current: createResponseSession() };

  createScenarioRestoreSnapshotApplier({
    applySurfaceState,
    sessionRef,
    setOptimisticCaptureMode,
    setSession,
  })(snapshot);

  expect(setSession).toHaveBeenCalledWith(snapshot.session);
  expect(sessionRef.current).toEqual(snapshot.session);
  expect(applySurfaceState).toHaveBeenCalledWith(snapshot.surface, {
    syncModeState: false,
  });
  expect(setOptimisticCaptureMode).toHaveBeenCalledWith(null);
}

function expectResponseDataApplication() {
  const responseSession = createResponseSession();
  const responseSurface = {
    captureAction: 'scenario' as const,
    screenshotMode: true,
    toolbarVisible: true,
  };
  const setSession = vi.fn();
  const applySurfaceState = vi.fn();
  const setOptimisticCaptureMode = vi.fn();

  createScenarioResponseDataApplier({
    applySurfaceState,
    setOptimisticCaptureMode,
    setSession,
  })({
    session: responseSession,
    success: true,
    surface: responseSurface,
  });

  expect(setSession).toHaveBeenCalledWith(responseSession);
  expect(setOptimisticCaptureMode).toHaveBeenCalledWith(null);
  expect(applySurfaceState).toHaveBeenCalledWith(responseSurface);
}
