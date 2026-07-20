import { vi } from 'vitest';

import type { ScenarioSessionService } from '../../../apps/extension/src/background/scenario/session-service';

export function createScenarioSessionServiceStub(): ScenarioSessionService {
  return {
    bufferPendingCapture: vi.fn(),
    bumpProjectRevision: vi.fn(),
    clearPendingCapture: vi.fn(),
    clearPendingCaptureIfCurrent: vi.fn(),
    clearTab: vi.fn(),
    consumePendingCapture: vi.fn(),
    hasPendingCapture: vi.fn(() => false),
    getPendingCapture: vi.fn(() => null),
    getRestoreSnapshot: vi.fn(),
    resolvePendingCapture: vi.fn(),
    getSession: vi.fn(),
    getSurface: vi.fn(),
    setActiveProject: vi.fn(),
    setCaptureMode: vi.fn(),
    setEnabled: vi.fn(),
    setSidebarVisible: vi.fn(),
    setRememberProjectSelection: vi.fn(),
    syncProjectRevision: vi.fn((_tabId: number, options?: { hasActiveProject?: boolean }) =>
      options?.hasActiveProject ? 1 : 0
    ),
    updateSurfaceState: vi.fn(),
  } as unknown as ScenarioSessionService;
}
