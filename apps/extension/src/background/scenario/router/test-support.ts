import { vi } from 'vitest';

import type { ScenarioSessionService } from '../session-service';

export function createScenarioSessionServiceStub(): ScenarioSessionService {
  return {
    bufferPendingCapture: vi.fn(),
    bumpProjectRevision: vi.fn(),
    clearPendingCaptureIfCurrent: vi.fn(),
    clearPendingCapture: vi.fn(),
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

export async function flushScenarioRouterPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function createBaseScenarioSession() {
  return {
    enabled: true,
    captureMode: 'manual' as const,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

export function createScenarioPayloadResponse() {
  return {
    session: createBaseScenarioSession(),
    projects: [{ id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 2 }],
  };
}

export function createScenarioAssetEntryFixture() {
  const blob = new Blob(['asset'], { type: 'image/png' });
  return {
    blob,
    createdAt: 10,
    galleryAssetId: null,
    height: 1,
    id: 'asset-1',
    mimeType: blob.type,
    projectId: 'project-1',
    size: blob.size,
    width: 1,
  };
}
