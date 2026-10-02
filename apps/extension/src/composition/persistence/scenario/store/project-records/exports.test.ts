import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listScenarioExportsMock,
  renameExportMock,
  publishMediaHubLibraryChangedMock,
  randomUuidMock,
  saveScenarioExportMock,
  saveArtifactMock,
} = vi.hoisted(() => ({
  listScenarioExportsMock: vi.fn(),
  renameExportMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  randomUuidMock: vi.fn(),
  saveScenarioExportMock: vi.fn(),
  saveArtifactMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  listScenarioExports: listScenarioExportsMock,
  saveScenarioExport: saveScenarioExportMock,
}));

vi.mock('../../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
  publishMediaHubStorageAlert: vi.fn(),
  subscribeToMediaHubEvents: vi.fn(),
}));

vi.mock('../../projects/exports', async (original) => ({
  ...(await original<typeof import('../../projects/exports')>()),
  renameScenarioHtmlExport: renameExportMock,
}));

vi.mock('../../export-artifacts', () => ({ saveScenarioHtmlArtifact: saveArtifactMock }));

import {
  listScenarioExportRecords,
  renameScenarioHtmlExportRecord,
  saveScenarioExportRecord,
} from './exports';

beforeEach(() => {
  vi.clearAllMocks();
  renameExportMock.mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
  randomUuidMock.mockReturnValue('export-1');
  listScenarioExportsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('scenario project export records', () => {
  it('saves export metadata and publishes a gallery catalog event', async () => {
    await expect(
      saveScenarioExportRecord({
        filename: 'scenario.html',
        format: 'html',
        projectId: 'project-1',
        size: 123,
      })
    ).resolves.toMatchObject({ id: 'export-1', projectId: 'project-1' });

    expect(saveScenarioExportMock).toHaveBeenCalledWith({
      createdAt: 1000,
      filename: 'scenario.html',
      format: 'html',
      id: 'export-1',
      projectId: 'project-1',
      size: 123,
    });
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
      'scenario-export:export-1',
    ]);
  });

  it('lists export metadata newest first', async () => {
    listScenarioExportsMock.mockResolvedValue([
      { createdAt: 1, filename: 'old.md', format: 'markdown', id: 'old', projectId: 'project-1' },
      { createdAt: 2, filename: 'new.html', format: 'html', id: 'new', projectId: 'project-1' },
    ]);

    await expect(listScenarioExportRecords('project-1')).resolves.toEqual([
      expect.objectContaining({ id: 'new' }),
      expect.objectContaining({ id: 'old' }),
    ]);
  });
});

it('announces only a committed selected export rename', async () => {
  let finish!: () => void;
  renameExportMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  const pending = renameScenarioHtmlExportRecord('export-1', 'new.html');
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  finish();
  await pending;
  expect(renameExportMock).toHaveBeenCalledWith('export-1', 'new.html');
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'scenario-export:export-1',
  ]);
});

it('does not announce a failed rename as committed', async () => {
  renameExportMock.mockRejectedValueOnce(new Error('quota'));
  await expect(renameScenarioHtmlExportRecord('export-1', 'new.html')).rejects.toThrow('quota');
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it.each(['guide', 'tour'] as const)(
  'announces saved %s bytes only after durable artifact publication',
  async (mode) => {
    const ref = {
      assetId: 'body',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/body' },
      mimeType: 'text/html',
      sha256: null,
      size: 4,
    };
    let finish!: () => void;
    saveArtifactMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const pending = saveScenarioExportRecord({
      projectId: 'project-1',
      filename: 'saved.html',
      format: 'html',
      size: 4,
      html: { mode, ref },
    });
    expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
    finish();
    expect(await pending).toMatchObject({ html: { mode, assetId: 'body' } });
    expect(saveArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({ html: { mode, assetId: 'body' }, size: 4 }),
      ref
    );
    expect(saveScenarioExportMock).not.toHaveBeenCalled();
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledExactlyOnceWith('create', [
      'scenario-export:export-1',
    ]);
  }
);
it('does not advertise failed artifact publication', async () => {
  saveArtifactMock.mockRejectedValueOnce(new Error('quota'));
  const ref = {
    assetId: 'body',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/body' },
    mimeType: 'text/html',
    sha256: null,
    size: 4,
  };
  await expect(
    saveScenarioExportRecord({
      projectId: 'project-1',
      filename: 'saved.html',
      format: 'html',
      size: 4,
      html: { mode: 'guide', ref },
    })
  ).rejects.toThrow('quota');
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});
