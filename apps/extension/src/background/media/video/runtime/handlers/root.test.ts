import { expect, it, vi } from 'vitest';

vi.mock('../../../../capture/download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../capture/download/download-router')>()),
  buildDownloadFilename: (path: string | null, filename: string) => {
    return `${path ?? 'root'}/${filename}`;
  },
  resolvePresetPath: async () => null,
}));

import * as rootHandlers from './index';
import * as exportHandlers from './export';
import * as stateHandlers from './state';

it('re-exports the route handler owner modules through the thin root facade', () => {
  expect(rootHandlers.createUnhandledRouteResult).toBe(stateHandlers.createUnhandledRouteResult);
  expect(rootHandlers.handleRecordingState).toBe(stateHandlers.handleRecordingState);
  expect(rootHandlers.handleOffscreenError).toBe(stateHandlers.handleOffscreenError);
  expect(rootHandlers.handleDownloadRecording).toBe(exportHandlers.handleDownloadRecording);
  expect(rootHandlers.handleStartProjectExport).toBe(exportHandlers.handleStartProjectExport);
  expect(rootHandlers.handleCancelProjectExport).toBe(exportHandlers.handleCancelProjectExport);
});
