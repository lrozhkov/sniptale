// @vitest-environment jsdom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const integration = vi.hoisted(() => ({
  load: vi.fn(),
  index: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  advanced: vi.fn(),
  download: vi.fn(),
  export: vi.fn(),
}));
vi.mock('../../workflows/video-review/export-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/export-lifecycle')>()),
  exportReviewedVideo: integration.export,
}));
vi.mock('../../workflows/video-review/media-index', () => ({
  inspectReviewMedia: integration.index,
}));
vi.mock('../../workflows/video-review/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/video-review/source')>()),
  loadVideoReviewSource: integration.load,
}));
vi.mock('../../composition/persistence/review-workspaces/store', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/review-workspaces/store')
  >()),
  saveVideoWorkspaceDraft: integration.draft,
  saveVideoWorkspaceAdvanced: integration.advanced,
  commitVideoWorkspace: integration.commit,
  moveVideoWorkspaceHistory: integration.history,
  readVideoWorkspace: integration.read,
}));
vi.mock('../../workflows/video-review/audio-import', () => ({
  importReviewAudio: vi.fn(
    async (args: {
      attach(assetId: string, duration: number): Promise<void>;
      assertCurrentTarget(): void;
      signal: AbortSignal;
    }) => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      await args.attach('project-asset:drop', 2);
    }
  ),
  importedAudioClip: (assetId: string, duration: number, atTime: number) => ({
    id: `audio-${assetId}`,
    assetId,
    timelineStart: atTime,
    sourceOffset: 0,
    duration,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }),
}));
vi.mock('../shared/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/download')>()),
  downloadGalleryBlob: integration.download,
}));

async function dragRange(host: HTMLElement) {
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 80));
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  for (const [type, x] of [
    ['pointerdown', 100],
    ['pointermove', 200],
    ['pointerup', 200],
  ] as const)
    await act(async () =>
      plane.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }))
    );
}

it('deletes the unified selection: cut stays when audio is selected, undo restores it', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  const musicFile = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' });
  const dragEvent = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 250 });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [musicFile], types: ['Files'] },
    });
    return event;
  };
  const cutCount = () =>
    fixture.snapshot.workspace.history.filter(
      (op) => op.target === 'edit' && op.after !== null && op.after.kind === 'cut'
    ).length;
  const musicCount = () => {
    const { history, cursor } = fixture.snapshot.workspace;
    const op = history
      .slice(0, cursor)
      .filter((item) => item.target === 'advancedContent')
      .at(-1) as { after: { audio: { music: unknown[] } } } | undefined;
    return op?.after.audio.music.length ?? 0;
  };
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('audioTrack');
    await click('cutMode');
    await dragRange(host);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(cutCount()).toBe(1);
    const music = host.querySelectorAll('[data-ui="gallery.videoReview.audioLane"]')[2]!;
    music.dispatchEvent(dragEvent('dragenter'));
    music.dispatchEvent(dragEvent('drop'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(musicCount()).toBe(1);
    const clip = host.querySelector<HTMLElement>('[aria-label^="gallery.videoReview.audioMusic"]')!;
    Object.assign(clip, { setPointerCapture: vi.fn() });
    await act(async () =>
      clip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, button: 0 }))
    );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect([musicCount(), cutCount()]).toEqual([0, 1]);
    await click('undo');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect([musicCount(), cutCount()]).toEqual([1, 1]);
    await click('redo');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect([musicCount(), cutCount()]).toEqual([0, 1]);
  } finally {
    await fixture.cleanup();
  }
});
