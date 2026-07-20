import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MAX_SAVE_BLOB_BASE64_DECODED_BYTES } from '@sniptale/runtime-contracts/validation/base64';
import {
  consumePopupExportStagedArchive,
  releasePopupExportStagedArchive,
  resetPopupExportStagedArchivesForTests,
  stagePopupExportArchiveChunk,
} from './staged-archives';

beforeEach(() => {
  resetPopupExportStagedArchivesForTests();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stageChunk(overrides: Partial<Parameters<typeof stagePopupExportArchiveChunk>[0]> = {}) {
  return stagePopupExportArchiveChunk({
    archiveSessionId: 'archive-session-1',
    base64: 'emlw',
    chunkIndex: 0,
    stagedArchiveId: 'staged-archive-1',
    totalBytes: 3,
    totalChunks: 1,
    ...overrides,
  });
}

it('fails closed when restart clears staged archive authority', () => {
  stageChunk();

  resetPopupExportStagedArchivesForTests();

  expect(() =>
    consumePopupExportStagedArchive({
      archiveSessionId: 'archive-session-1',
      mimeType: 'application/zip',
      stagedArchiveId: 'staged-archive-1',
    })
  ).toThrow('Popup export staged archive is missing or incomplete');
});

it('explicitly releases partial staged archive state', () => {
  stageChunk({ totalBytes: 6, totalChunks: 2 });

  releasePopupExportStagedArchive({
    archiveSessionId: 'archive-session-1',
    stagedArchiveId: 'staged-archive-1',
  });

  expect(() =>
    consumePopupExportStagedArchive({
      archiveSessionId: 'archive-session-1',
      mimeType: 'application/zip',
      stagedArchiveId: 'staged-archive-1',
    })
  ).toThrow('Popup export staged archive is missing or incomplete');
});

it('reserves aggregate staged archive bytes before accepting new sessions', () => {
  stageChunk({
    totalBytes: MAX_SAVE_BLOB_BASE64_DECODED_BYTES,
    totalChunks: 2,
  });

  expect(() =>
    stageChunk({
      archiveSessionId: 'archive-session-2',
      base64: 'eg==',
      stagedArchiveId: 'staged-archive-2',
      totalBytes: 1,
    })
  ).toThrow('Too many popup export staged archive bytes');
});
