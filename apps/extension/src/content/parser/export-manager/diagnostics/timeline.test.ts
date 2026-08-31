import { expect, it, vi } from 'vitest';
import { createExportManagerState, updateExportManagerProgress } from '../service/state';
import { buildCaptureTimelineAsset } from './timeline';

it('serializes the bounded Export Manager phase sequence without progress messages or errors', () => {
  vi.spyOn(Date, 'now')
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_025)
    .mockReturnValue(1_050);
  const state = createExportManagerState();
  updateExportManagerProgress(state, {
    activeStepKey: 'pageDiagnostics',
    errors: ['private warning'],
    message: 'localized progress message',
    phase: 'scanning',
  });

  const asset = buildCaptureTimelineAsset(state);
  const payload = JSON.parse(String(asset.content)) as unknown;

  expect(asset.path).toBe('logs/capture-timeline.json');
  expect(payload).toMatchObject({
    events: [{ elapsedMs: 25, phase: 'scanning', step: 'pageDiagnostics' }],
    totalElapsedMs: 50,
  });
  expect(String(asset.content)).not.toContain('private warning');
  expect(String(asset.content)).not.toContain('localized progress message');
});
