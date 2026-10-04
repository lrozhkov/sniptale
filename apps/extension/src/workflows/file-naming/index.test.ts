import { afterEach, expect, it, vi } from 'vitest';
import { createFilenameSession, createOutputFilename, createScreenshotFilename } from './index';
vi.mock('../../composition/persistence/settings', () => ({
  loadSettings: vi.fn(async () => ({ filenameRules: { template: 'custom_{type}' } })),
}));
afterEach(() => vi.useRealTimers());
it('freezes operation time and rules across related outputs', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
  const read = vi.fn(async () => ({ filenameRules: { template: 'session_{time}' } }));
  const session = await createFilenameSession('recording-1', read);
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  const primary = await createOutputFilename(
    { category: 'recordings', type: 'recording', extension: 'mp4' },
    session
  );
  const sidecar = await createOutputFilename(
    { category: 'recordings', type: 'recording', extension: 'webm', suffix: 'webcam' },
    session
  );
  expect(sidecar).toBe(`${primary.slice(0, -4)}_webcam.webm`);
  expect(read).toHaveBeenCalledTimes(1);
});
it('keeps capture format authoritative and accepts an existing settings snapshot', async () => {
  expect(
    await createScreenshotFilename('visible', 'jpeg', { filenameRules: { template: 'picture' } })
  ).toBe('picture_visible.jpg');
});
it('uses standard output if settings cannot be read', async () => {
  const session = await createFilenameSession('one', async () => {
    throw new Error('unavailable');
  });
  expect(
    await createOutputFilename({ category: 'archives', type: 'backup', extension: 'zip' }, session)
  ).toMatch(/^Sniptale_backup_.*\.zip$/);
});
