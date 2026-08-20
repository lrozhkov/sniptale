import { expect, it } from 'vitest';
import {
  createBaseScenarioSession,
  createScenarioAssetEntryFixture,
  createScenarioPayloadResponse,
  createScenarioSessionServiceStub,
  flushScenarioRouterPromises,
} from './test-support';

it('builds a complete scenario session service stub', () => {
  const service = createScenarioSessionServiceStub();

  expect(service.hasPendingCapture(1)).toBe(false);
  expect(service.getPendingCapture(1)).toBeNull();
  expect(service.syncProjectRevision(1, { hasActiveProject: true })).toBe(1);
  expect(service.syncProjectRevision(1, { hasActiveProject: false })).toBe(0);
  expect(service.bufferPendingCapture).toEqual(expect.any(Function));
  expect(service.updateSurfaceState).toEqual(expect.any(Function));
});

it('flushes pending router microtasks and timers', async () => {
  await expect(flushScenarioRouterPromises()).resolves.toBeUndefined();
});

it('builds the base scenario payload fixture', () => {
  expect(createBaseScenarioSession()).toEqual(
    expect.objectContaining({
      captureMode: 'manual',
      enabled: true,
      projectId: 'project-1',
    })
  );
  expect(createScenarioPayloadResponse()).toEqual({
    projects: [{ id: 'project-1', name: 'Project 1', createdAt: 1, updatedAt: 2 }],
    session: createBaseScenarioSession(),
  });
});

it('builds an OPFS-hydrated scenario asset fixture', () => {
  expect(createScenarioAssetEntryFixture()).toEqual(
    expect.objectContaining({
      assetId: 'opfs-asset-1',
      file: expect.any(File),
      id: 'asset-1',
      mimeType: 'image/png',
      size: 5,
    })
  );
});
