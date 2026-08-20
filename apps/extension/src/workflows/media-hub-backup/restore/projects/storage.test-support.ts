import type JSZip from 'jszip';
import { vi } from 'vitest';

export function createStores() {
  const stores = new Map(
    [
      'project_assets',
      'asset_refs',
      'asset_owners',
      'asset_operations',
      'media_library',
      'project_exports',
      'recording_telemetry',
      'recordings',
      'scenario_assets',
      'scenario_exports',
      'scenario_projects',
      'scenario_step_editor_documents',
      'thumbnails',
      'video_effect_bundles',
      'video_projects',
    ].map((name) => [
      name,
      {
        delete: vi.fn(),
        get: vi.fn(),
        index: vi.fn(() => ({ getAll: vi.fn(async () => []) })),
        put: vi.fn(),
      },
    ])
  );
  stores.get('asset_operations')?.get.mockResolvedValue({
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: [],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  });
  return stores;
}

export function createZip(): JSZip {
  return {
    file: vi.fn((path: string) => ({
      async: vi.fn().mockResolvedValue(new Blob([path], { type: 'image/png' })),
    })),
  } as unknown as JSZip;
}

export function createMissingProjectBlobZip(): JSZip {
  return {
    file: vi.fn(() => null),
  } as unknown as JSZip;
}
