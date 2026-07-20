import { beforeEach, expect, it, vi } from 'vitest';

import { createProjectExportService } from './index';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';

const { loadImagesForProjectMock, renderCompositeExportMock, upsertLedgerMock } = vi.hoisted(
  () => ({
    loadImagesForProjectMock: vi.fn(),
    renderCompositeExportMock: vi.fn(),
    upsertLedgerMock: vi.fn(),
  })
);

vi.mock('../runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime')>()),
  cleanupJob: vi.fn(),
  sendProgress: vi.fn(),
}));

vi.mock('../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media')>()),
  loadImagesForProject: loadImagesForProjectMock,
}));

vi.mock('../render', () => ({
  canUsePassthroughPath: vi.fn(() => false),
  exportPassthrough: vi.fn(),
  renderCompositeExport: renderCompositeExportMock,
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: vi.fn(),
}));

vi.mock('../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/export-ledger')>()),
  loadActiveProjectExportJobLedgerEntry: vi.fn(),
  markProjectExportJobTerminal: vi.fn(),
  requestProjectExportJobCancel: vi.fn(),
  upsertProjectExportJobLedgerEntry: upsertLedgerMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createProject(): VideoProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Project',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: VideoTimelinePlacementMode.ALLOW_OVERLAP,
    duration: 10,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [],
    clips: [],
    cursorTrack: null,
    actionEvents: [],
  };
}

function createExportSettings(): VideoProjectExportSettings {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
    downloadAfterExport: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects invalid selected-clip settings before accepting offscreen export work', async () => {
  const service = createProjectExportService();
  const project = createProject();
  const settings = {
    ...createExportSettings(),
    scope: VideoExportScope.SELECTED_CLIP,
    selectedClipIds: ['missing-clip'],
  };

  await expect(
    service.startProjectExport('job-invalid-selection', project, settings)
  ).rejects.toThrow('Invalid video project export settings');
  expect(upsertLedgerMock).not.toHaveBeenCalled();
  expect(loadImagesForProjectMock).not.toHaveBeenCalled();
  expect(renderCompositeExportMock).not.toHaveBeenCalled();
});
