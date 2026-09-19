// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
import { parseReviewOperation } from '../../features/video/review/validation';
import type { CanvasComment, ReviewAnchor } from '../../features/video/review/types';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
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
  importedAudioClip: (
    assetId: string,
    duration: number,
    atTime: number,
    timelineDuration: number
  ) => ({
    id: `audio-${assetId}`,
    assetId,
    timelineStart: Math.max(0, Math.min(atTime, Math.max(0, timelineDuration - 0.2))),
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
import { VideoReview } from './index';
import { createEditorFixture } from './editor-fixture.test-support';

function advancedContentAt(snapshot: VideoWorkspaceSnapshot, index = -1) {
  const operations = snapshot.workspace.history.filter(
    (operation) => operation.target === 'advancedContent'
  );
  const operation = index < 0 ? operations.at(-1) : operations[index];
  if (operation?.target !== 'advancedContent') throw new Error('Missing advanced content op');
  return operation.after;
}

it('integrates selection, recoverable text, drawing, history and report actions in the modal', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, back, click, fill, show, close, createUrl, revokeUrl, clipboard } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    expect(show).toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledOnce();
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    );
    expect(host.querySelector('video')!.currentTime).toBe(0.1);
    await click('play');
    await act(async () => host.querySelector('video')!.dispatchEvent(new Event('pause')));
    await click('addComment');
    await fill('First note');
    expect(fixture.button('addComment').disabled).toBe(true);
    expect(host.querySelector('input[type="number"]')).toBeNull();
    const stage = host.querySelector<HTMLDivElement>('[data-ui="gallery.videoReview.stage"]')!;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 360));
    Object.assign(stage, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      stage.dispatchEvent(event);
    };
    await act(async () => {
      pointer('pointerdown', 160, 90);
      pointer('pointermove', 480, 270);
      pointer('pointerup', 480, 270);
    });
    expect(stage.releasePointerCapture).toHaveBeenCalledWith(1);
    await act(async () => {
      pointer('pointerdown', 10, 10);
      pointer('pointercancel', 20, 20);
    });
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(back).not.toHaveBeenCalled();
    await click('removeRegion');
    await act(async () => {
      pointer('pointerdown', 80, 60);
      pointer('pointermove', 320, 180);
      pointer('pointerup', 320, 180);
    });
    await click('save');
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
    await click('editComment');
    await fill('Edited note');
    await click('save');
    await click('undo');
    expect(host.textContent).toContain('First note');
    await click('redo');
    expect(host.textContent).toContain('Edited note');
    await dragTimePlane(host, 100, 300);
    await click('commentRange');
    await fill('Range note');
    await click('discard');
    expect(host.querySelector('textarea')).toBeNull();
    await click('copyReport');
    expect(clipboard).toHaveBeenCalledWith(expect.stringContaining('Edited note'));
    await click('downloadReport');
    expect(integration.download).toHaveBeenCalled();
    clipboard.mockRejectedValueOnce(new Error('denied'));
    await click('copyReport');
    expect(host.textContent).toContain('gallery.videoReview.reportFailed');
    await click('deleteComment');
    expect(host.textContent).not.toContain('Edited note');
    await click('undo');
    expect(host.textContent).toContain('Edited note');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[title^="gallery.videoReview.eventCursorIdle"]')!
        .click()
    );
    expect(host.querySelector('textarea')).not.toBeNull();
    await click('discard');
    await click('telemetry');
    await click('back');
    expect(back).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    expect(close).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:review');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('keeps unsaved text in the editor when Back cannot persist recovery, then retries', async () => {
  const fixture = createEditorFixture(integration);
  const { root, host, back, click, fill } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('addComment');
    await fill('Keep this text');
    integration.draft.mockRejectedValueOnce(new Error('Quota'));
    await click('back');
    expect(back).not.toHaveBeenCalled();
    expect(host.querySelector('textarea')?.value).toBe('Keep this text');
    expect(host.textContent).toContain('gallery.videoReview.saveFailed');
    await click('back');
    expect(back).toHaveBeenCalledOnce();
    expect(fixture.snapshot.draft?.annotation.text).toBe('Keep this text');
  } finally {
    await fixture.cleanup();
  }
});

it('offers source-load retry and surfaces playback failure without exiting', async () => {
  const fixture = createEditorFixture(integration);
  const { root, host, back, click } = fixture;
  integration.load.mockRejectedValueOnce(new Error('Missing source'));
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    expect(host.textContent).toContain('gallery.videoReview.loadFailed');
    await click('retry');
    expect(host.querySelector('video')).not.toBeNull();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Unsupported'));
    await click('play');
    expect(host.textContent).toContain('gallery.videoReview.playbackFailed');
    await act(async () => host.querySelector('video')!.dispatchEvent(new Event('error')));
    expect(back).not.toHaveBeenCalled();
    const event = new Event('cancel', { cancelable: true });
    await act(async () => host.querySelector('dialog')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
  } finally {
    await fixture.cleanup();
  }
});

async function dragTimePlane(host: HTMLElement, start: number, end?: number) {
  const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 80));
  Object.assign(plane, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    plane.dispatchEvent(event);
  };
  await act(async () => pointer('pointerdown', start));
  if (end !== undefined) await act(async () => pointer('pointermove', end));
  await act(async () => pointer('pointerup', end ?? start));
}

it('selects a range by dragging anywhere on the time plane and clears it outside', async () => {
  const fixture = createEditorFixture(integration);
  const { root, host } = fixture;
  let selected: ReviewAnchor = { kind: 'point', time: 0 };
  const seek = vi.fn();
  function Harness() {
    const [selection, select] = useState(selected);
    selected = selection;
    return (
      <ReviewTimeline
        duration={4}
        time={0}
        playing={false}
        selection={selection}
        annotations={[
          { id: 'a', text: 'First', anchor: { kind: 'range', start: 1, end: 3 } },
          { id: 'b', text: 'Second', anchor: { kind: 'range', start: 1, end: 3 } },
        ]}
        markers={[]}
        onSeek={seek}
        onSelect={select}
        onPlay={vi.fn()}
        onMarker={vi.fn()}
        onComment={vi.fn()}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await dragTimePlane(host, 100, 200);
    expect(selected).toEqual({ kind: 'range', start: 1, end: 2 });
    await dragTimePlane(host, 150);
    expect(selected).toEqual({ kind: 'range', start: 1, end: 2 });
    await dragTimePlane(host, 350);
    expect(selected).toEqual({ kind: 'point', time: 3.5 });
    expect(seek).toHaveBeenLastCalledWith(3.5);
    const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
    for (const [kind, x] of [
      ['pointerdown', 100],
      ['pointermove', 200],
    ] as const)
      await act(async () =>
        plane.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x }))
      );
    expect(selected).toEqual({ kind: 'range', start: 1, end: 2 });
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    for (const kind of ['pointermove', 'pointerup'])
      await act(async () =>
        plane.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: 300 }))
      );
    expect(selected).toEqual({ kind: 'point', time: 3.5 });
    expect(host.querySelector('[title="First · Second"]')?.textContent).toContain('2');
    expect(host.querySelector('input[type="number"]')).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('commits safe cuts, skips excluded playback and preserves exact comment navigation', async () => {
  const fixture = createEditorFixture(integration);
  const { root, host, back, click } = fixture;
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  const key = async (key: string) =>
    act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    const video = host.querySelector('video')!;
    await dragTimePlane(host, 140);
    expect(video.currentTime).toBe(1.4);
    await click('cutMode');
    const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
    vi.mocked(plane.releasePointerCapture).mockClear();
    for (const [kind, x] of [
      ['pointerdown', 200],
      ['pointermove', 300],
    ] as const)
      await act(async () =>
        plane.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x }))
      );
    await key('Escape');
    expect(video.currentTime).toBe(1.4);
    expect(plane.getAttribute('aria-valuenow')).toBe('1.4');
    expect(plane.releasePointerCapture).toHaveBeenCalled();
    for (const kind of ['pointermove', 'pointerup'])
      await act(async () =>
        plane.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: 350 }))
      );
    expect(fixture.snapshot.workspace.history).toHaveLength(0);
    await click('addComment');
    await fixture.fill('Restored selection');
    await click('save');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toMatchObject({
      anchor: { kind: 'point', time: 1.4 },
    });
    await click('undo');
    await dragTimePlane(host, 0);
    await key('ArrowLeft');
    expect(video.currentTime).toBe(0);
    await key('ArrowRight');
    expect(video.currentTime).toBe(1);
    await key('ArrowLeft');
    expect(video.currentTime).toBe(0);
    await dragTimePlane(host, 0, 100);
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toMatchObject({
      kind: 'cut',
      start: 0,
      end: 1,
    });
    await click('play');
    expect(video.currentTime).toBe(1);
    await act(async () => {
      video.currentTime = 0.5;
      video.dispatchEvent(new Event('timeupdate'));
    });
    expect(video.currentTime).toBe(1);
    await act(async () => video.dispatchEvent(new Event('pause')));
    await click('undo');
    await click('redo');
    const cut = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.cutLabel 0.0 – 1.0"]'
    )!;
    await act(async () => cut.click());
    expect(video.currentTime).toBe(0);
    await click('removeEdit');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toBeNull();
    await click('undo');
    await click('cutMode');
    await dragTimePlane(host, 150);
    await click('addComment');
    await fixture.fill('Exact annotation');
    await click('save');
    await click('cutMode');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[title="Exact annotation"]')!.click()
    );
    expect(fixture.button('cutMode').getAttribute('aria-pressed')).toBe('false');
  } finally {
    await fixture.cleanup();
  }
});

it('creates a zoom region from the playhead, edits it in the inspector, and persists it', async () => {
  const fixture = createEditorFixture(integration);
  const { root, click } = fixture;
  try {
    await act(async () =>
      root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await click('advancedEditing');
    await click('zoomTrack');
    expect(document.querySelector('[data-ui="gallery.videoReview.zoomLane"]')).not.toBeNull();
    await click('zoomAdd');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(advancedContentAt(fixture.snapshot, 0).zoom.regions).toHaveLength(1);
    expect(advancedContentAt(fixture.snapshot, 0).zoom.enabled).toBe(true);
    expect(advancedContentAt(fixture.snapshot, 0).zoom.regions[0]).toMatchObject({
      start: 0,
      end: 2,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    });
    const inspector = document.querySelector('[data-ui="gallery.videoReview.zoomInspector"]')!;
    expect(inspector).not.toBeNull();
    const scale = inspector.querySelector<HTMLInputElement>(
      '[aria-label="gallery.videoReview.zoomScale"]'
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(scale, '2');
      scale.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(advancedContentAt(fixture.snapshot, 1).zoom.regions[0]!.transform.scale).toBe(2);
    // Track visibility is layout-only: basic mode hides the lane and keeps the region.
    await click('advancedEditing');
    expect(document.querySelector('[data-ui="gallery.videoReview.zoomLane"]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(advancedContentAt(fixture.snapshot).zoom.regions[0]!.transform.scale).toBe(2);
  } finally {
    await fixture.cleanup();
  }
});

it('places new zoom regions in result time after cuts and speed changes (R03)', async () => {
  const history = [
    parseReviewOperation(
      {
        id: 'edit-cut-1',
        at: 1,
        target: 'edit',
        before: null,
        after: { id: 'cut-1', start: 0, end: 1, requestedStart: 0, requestedEnd: 1, kind: 'cut' },
      },
      4
    )!,
    parseReviewOperation(
      {
        id: 'edit-speed-1',
        at: 2,
        target: 'edit',
        before: null,
        after: {
          id: 'speed-1',
          start: 1,
          end: 2,
          requestedStart: 1,
          requestedEnd: 2,
          kind: 'speed',
          rate: 2,
          audio: 'speed',
        },
      },
      4
    )!,
  ].filter((operation) => operation !== null);
  const fixture = createEditorFixture(integration, { history });
  const { root, host, click } = fixture;
  try {
    await act(async () =>
      root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    // Result of cut [0,1) + speed [1,2)x2 + keep [2,4): 2.5 s; source 3 sits at 1.5.
    await dragTimePlane(host, 300);
    await click('advancedEditing');
    await click('zoomTrack');
    await click('zoomAdd');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(advancedContentAt(fixture.snapshot).zoom.regions[0]).toMatchObject({
      start: 1.5,
      end: 2.5,
    });
  } finally {
    await fixture.cleanup();
  }
});

it('refuses a zoom placement while the playhead is on a removed part (R03)', async () => {
  const history = [
    parseReviewOperation(
      {
        id: 'edit-cut-1',
        at: 1,
        target: 'edit',
        before: null,
        after: { id: 'cut-1', start: 0, end: 1, requestedStart: 0, requestedEnd: 1, kind: 'cut' },
      },
      4
    )!,
  ].filter((operation) => operation !== null);
  const fixture = createEditorFixture(integration, { history });
  const { root, host, click } = fixture;
  try {
    await act(async () =>
      root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await dragTimePlane(host, 50);
    await click('advancedEditing');
    await click('zoomTrack');
    await click('zoomAdd');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(fixture.snapshot.workspace.advanced.zoom.regions).toHaveLength(0);
    expect(host.textContent).toContain('gallery.videoReview.placementOnCut');
  } finally {
    await fixture.cleanup();
  }
});

it('ignores the comment shortcut while report copying disables the comment control', async () => {
  const fixture = createEditorFixture(integration);
  let finish!: () => void;
  fixture.clipboard.mockImplementation(
    () =>
      new Promise<undefined>((resolve) => {
        finish = () => resolve(undefined);
      })
  );
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('copyReport');
    expect(fixture.button('addComment').disabled).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })));
    expect(fixture.host.querySelector('textarea')).toBeNull();
    await act(async () => finish());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })));
    expect(fixture.host.querySelector('textarea')).not.toBeNull();
  } finally {
    await act(async () => finish?.());
    await fixture.cleanup();
  }
});

it('blocks history and destructive shortcuts while the export controls are disabled', async () => {
  const fixture = createEditorFixture(integration);
  let fail!: (reason: Error) => void;
  integration.export.mockImplementation(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  integration.index.mockResolvedValue({
    duration: 4,
    boundaries: [0, 1, 2, 3, 4],
    videoCodec: 'vp8',
    audioCodec: null,
    container: 'webm',
    rotation: 0,
  });
  try {
    await act(async () =>
      fixture.root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    await fixture.click('advancedEditing');
    await fixture.click('cutMode');
    await dragTimePlane(fixture.host, 0, 100);
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.cutLabel 0.0 – 1.0"]')!
        .click()
    );
    await fixture.click('exportVideo');
    expect(fixture.button('undo').disabled).toBe(true);
    for (const label of ['advancedEditing', 'zoomTrack', 'audioTrack', 'hideOverlays'])
      expect(fixture.button(label).matches(':disabled')).toBe(true);
    integration.history.mockClear();
    integration.commit.mockClear();
    for (const key of ['z', 'y'])
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }))
      );
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })));
    expect(integration.history).not.toHaveBeenCalled();
    await dragTimePlane(fixture.host, 200, 300);
    expect(integration.commit).not.toHaveBeenCalled();
  } finally {
    await act(async () => fail?.(new Error('Cancelled test export')));
    await fixture.cleanup();
  }
});

it('toggles the persisted advanced mode and restores it after reopening the editor', async () => {
  const fixture = createEditorFixture(integration);
  const { root, button, click } = fixture;
  try {
    await act(async () =>
      root.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
    );
    expect(button('advancedEditing').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[aria-label="gallery.videoReview.zoomTrack"]')).toBeNull();
    await click('advancedEditing');
    expect(button('advancedEditing').getAttribute('aria-pressed')).toBe('true');
    expect(button('zoomTrack').getAttribute('aria-pressed')).toBe('false');
    await click('zoomTrack');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(fixture.snapshot.workspace.advanced.ui).toEqual({
      mode: 'advanced',
      tracks: { actions: true, zoom: true, audio: false },
      overlaysVisible: true,
    });
    expect(integration.advanced).toHaveBeenCalled();
    await click('advancedEditing');
    expect(button('advancedEditing').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[aria-label="gallery.videoReview.zoomTrack"]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(fixture.snapshot.workspace.advanced.ui.mode).toBe('basic');
    expect(fixture.snapshot.workspace.advanced.ui.tracks.zoom).toBe(true);
    // Reopening reads the same durable workspace: the saved mode and track return.
    await act(async () => root.unmount());
    const reopenedHost = document.createElement('div');
    document.body.appendChild(reopenedHost);
    const reopenedRoot = createRoot(reopenedHost);
    const reopenedButton = (key: string) =>
      reopenedHost.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!;
    try {
      await act(async () =>
        reopenedRoot.render(<VideoReview aggregateId="recording:r" onBack={fixture.back} />)
      );
      expect(reopenedButton('advancedEditing').getAttribute('aria-pressed')).toBe('false');
      await act(async () => reopenedButton('advancedEditing').click());
      expect(reopenedButton('zoomTrack').getAttribute('aria-pressed')).toBe('true');
    } finally {
      await act(async () => reopenedRoot.unmount());
      reopenedHost.remove();
    }
  } finally {
    await fixture.cleanup();
  }
});

it('adds an overlay comment, drags it on the stage and deletes it via the editor', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('addOverlayComment');
    expect(fixture.snapshot.workspace.history.at(-1)?.target).toBe('canvasComment');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toMatchObject({
      attachment: 'content',
      position: { x: 0.44, y: 0.5 },
      start: 0,
    });
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).not.toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComments"]')).not.toBeNull();

    const point = host.querySelector<HTMLButtonElement>(
      '[data-ui="gallery.videoReview.canvasComment"] button'
    )!;
    Object.assign(point, { setPointerCapture: vi.fn() });
    const drag = async (dx: number, dy: number) =>
      act(async () => {
        point.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 })
        );
        point.dispatchEvent(
          new MouseEvent('pointermove', { bubbles: true, clientX: dx, clientY: dy, button: 0 })
        );
        point.dispatchEvent(
          new MouseEvent('pointerup', { bubbles: true, clientX: dx, clientY: dy, button: 0 })
        );
      });
    await drag(160, 90);
    const dragged = fixture.snapshot.workspace.history.at(-1)?.after as CanvasComment | undefined;
    expect(dragged?.position.x).toBeCloseTo(0.69, 5);
    expect(dragged?.position.y).toBeCloseTo(0.75, 5);

    await click('stayOnScreen');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toMatchObject({
      attachment: 'viewport',
    });
    await click('undo');
    await click('overlayDelete');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toBeNull();
    expect(host.querySelector('[data-ui="gallery.videoReview.canvasComment"]')).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('reveals the three audio lanes and persists the original audio gate', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('audioTrack');
    const lanes = host.querySelectorAll('[data-ui="gallery.videoReview.audioLane"]');
    expect(lanes).toHaveLength(3);
    expect(host.querySelector('[data-ui="gallery.videoReview.audioTrack"]')).not.toBeNull();
    const mute = host.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.audioClipMute"]'
    )!;
    await act(async () => mute.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(advancedContentAt(fixture.snapshot).audio.original.muted).toBe(true);
  } finally {
    await fixture.cleanup();
  }
});

it('imports a file dropped on the music lane at the drop point', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('audioTrack');
    const music = host.querySelectorAll('[data-ui="gallery.videoReview.audioLane"]')[2]!;
    vi.spyOn(music, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 32));
    const file = new File([new Uint8Array(4)], 'song.mp3', { type: 'audio/mpeg' });
    const dragEvent = (type: string, files: File[]) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 250 });
      Object.defineProperty(event, 'dataTransfer', {
        value: { files, types: files.length ? ['Files'] : [] },
      });
      return event;
    };
    await act(async () => music.dispatchEvent(dragEvent('dragenter', [file])));
    expect(music.getAttribute('data-drop-active')).toBe('true');
    await act(async () => music.dispatchEvent(dragEvent('drop', [file])));
    expect(music.getAttribute('data-drop-active')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    const musicClips = advancedContentAt(fixture.snapshot).audio.music;
    expect(musicClips).toHaveLength(1);
    expect(musicClips[0]!.timelineStart).toBeCloseTo(1.25, 5);
  } finally {
    await fixture.cleanup();
  }
});

it('opens the shared voiceover recorder from the audio lane', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('audioTrack');
    await click('recordVoiceover');
    const modal = host.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('gallery.videoReview.recordVoiceover');
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('sniptale-modal-close, [title="common.actions.close"]')!
        .click()
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await fixture.cleanup();
  }
});

it('persists a pending overlay comment draft on Back', async () => {
  const fixture = createEditorFixture(integration);
  const { host, root, click, back } = fixture;
  try {
    await act(async () => root.render(<VideoReview aggregateId="recording:r" onBack={back} />));
    await click('advancedEditing');
    await click('addOverlayComment');
    const area = host.querySelector<HTMLTextAreaElement>(
      '[data-ui="gallery.videoReview.overlayTextInput"]'
    )!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      area,
      'Saved draft'
    );
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await click('back');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toMatchObject({
      text: 'Saved draft',
    });
    expect(back).toHaveBeenCalledOnce();
  } finally {
    await fixture.cleanup();
  }
});
