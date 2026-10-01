// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { PreviewSourceField } from './source-field';
import { getPreviewOrigin } from './source-metadata';

const read = vi.hoisted(() => vi.fn());
vi.mock('../../../composition/persistence/recordings/telemetry', () => ({
  getRecordingTelemetry: read,
}));
vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
afterEach(() => vi.resetAllMocks());
const recording = (id: string) =>
  createMediaItem({ id, kind: 'recording', source: { kind: 'recording', recordingId: id } });
const telemetry = (patch: Partial<RecordingTelemetryEntry> = {}): RecordingTelemetryEntry => ({
  recordingId: 'one',
  createdAt: 1,
  updatedAt: 1,
  captureMode: 'SCREEN',
  displaySurface: 'window',
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [],
  ...patch,
});

it('uses retained origin evidence without treating missing URLs as local import', () => {
  expect(getPreviewOrigin(recording('one'))).toBe('gallery.preview.recordedMedia');
  expect(getPreviewOrigin({ ...recording('one'), kind: 'video' })).toBe(
    'gallery.preview.savedMedia'
  );
  expect(getPreviewOrigin(createMediaItem({ kind: 'image', sourceUrl: null }))).toBe(
    'gallery.preview.savedMedia'
  );
  expect(
    getPreviewOrigin(createMediaItem({ source: { kind: 'project-asset', projectAssetId: 'a' } }))
  ).toBe('gallery.preview.projectMedia');
});

it.each([
  ['TAB', null, 'captureTab'],
  ['TAB_CROP', 'browser', 'captureTabCrop'],
  ['CAMERA', null, 'captureCamera'],
  ['SCREEN', 'window', 'captureWindow'],
  ['SCREEN', 'monitor', 'captureScreen'],
  ['SCREEN', null, 'captureDisplay'],
] as const)(
  'shows recording mode %s/%s and available history',
  async (captureMode, displaySurface, label) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    read.mockResolvedValue(telemetry({ captureMode, displaySurface }));
    await act(async () => root.render(<PreviewSourceField item={recording('one')} />));
    expect(container.textContent).toContain(`gallery.preview.${label}`);
    expect(container.textContent).toContain('gallery.preview.recordedActions0');
    expect(container.textContent).toContain('gallery.preview.notRecorded');
    await act(async () => root.unmount());
  }
);

it('ignores stale recording details, distinguishes missing metadata and retries a failure', async () => {
  let finish: (entry: RecordingTelemetryEntry) => void = () => undefined;
  read
    .mockImplementationOnce(
      () =>
        new Promise<RecordingTelemetryEntry>((resolve) => {
          finish = resolve;
        })
    )
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce(telemetry());
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<PreviewSourceField item={recording('one')} />));
  expect(container.textContent).toContain('gallery.preview.sourceLoading');
  await act(async () => root.render(<PreviewSourceField item={recording('two')} />));
  await act(async () => finish(telemetry()));
  expect(container.textContent).toContain('gallery.preview.sourceUnavailable');
  expect(container.textContent).not.toContain('gallery.preview.captureWindow');
  await act(async () => container.querySelector('button')?.click());
  expect(container.textContent).toContain('gallery.preview.captureWindow');
  await act(async () =>
    root.render(<PreviewSourceField item={createMediaItem({ sourceUrl: 'javascript:alert(1)' })} />)
  );
  expect(container.querySelector('a')).toBeNull();
  expect(container.textContent).not.toContain('gallery.preview.captureWindow');
  await act(async () => root.unmount());
});

it('shows missing exported recording details without an impossible retry', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  read.mockResolvedValue(undefined);
  await act(async () =>
    root.render(<PreviewSourceField item={{ ...recording('export'), kind: 'video' }} />)
  );
  expect(container.textContent).toContain('gallery.preview.sourceUnavailable');
  expect(container.querySelector('button')).toBeNull();
  expect(read).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
