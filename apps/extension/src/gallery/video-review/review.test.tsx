// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewSourceLane } from './timeline-selection';
import { ReviewTimeline } from './timeline';
import type { ReviewAnchor } from '../../features/video/review/types';
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
  commitVideoWorkspace: integration.commit,
  moveVideoWorkspaceHistory: integration.history,
  readVideoWorkspace: integration.read,
}));
vi.mock('../shared/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/download')>()),
  downloadGalleryBlob: integration.download,
}));
import {
  parseReviewAnnotation,
  parseReviewOperation,
} from '../../features/video/review/validation';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { VideoReview } from './index';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type {
  saveVideoWorkspaceDraft,
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
} from '../../composition/persistence/review-workspaces/store';

function createEditorFixture() {
  integration.index.mockRejectedValue(new Error('No safe index'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  for (const [target, key] of [
    [HTMLDialogElement.prototype, 'showModal'],
    [HTMLDialogElement.prototype, 'close'],
    [URL, 'createObjectURL'],
    [URL, 'revokeObjectURL'],
  ] as const) {
    if (!(key in target))
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value: () => undefined,
      });
  }
  const show = vi
    .spyOn(HTMLDialogElement.prototype, 'showModal')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.open = true;
    });
  const close = vi
    .spyOn(HTMLDialogElement.prototype, 'close')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.open = false;
    });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    }
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:review');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const clipboard = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboard },
  });
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'file',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  integration.load.mockImplementation(async () => ({
    source: snapshot.workspace.source,
    snapshot: structuredClone(snapshot),
    file: new File(['video'], 'video.webm'),
    filename: 'video.webm',
    telemetry: {
      captureMode: 'tab',
      viewport: { width: 320, height: 180 },
      actionEvents: [],
      cursorTrack: null,
      signals: [
        { id: 'idle', kind: 'cursor-idle', startTime: 2, endTime: 3, point: null, data: {} },
        {
          id: 'warning',
          kind: 'static-frame',
          startTime: 0,
          endTime: 0,
          point: null,
          data: { code: 'unavailable' },
        },
      ],
    },
  }));
  integration.draft.mockImplementation(
    async (args: Parameters<typeof saveVideoWorkspaceDraft>[0]) => {
      snapshot = {
        ...snapshot,
        draft: args.annotation
          ? {
              aggregateId: 'recording:r',
              annotation: parseReviewAnnotation(args.annotation, 4, true)!,
              before: args.before ? parseReviewAnnotation(args.before, 4)! : null,
              revision: (snapshot.draft?.revision ?? 0) + 1,
              updatedAt: 2,
            }
          : null,
      };
      return structuredClone(snapshot);
    }
  );
  integration.commit.mockImplementation(
    async (args: Parameters<typeof commitVideoWorkspace>[0]) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          revision: snapshot.workspace.revision + 1,
          history: [
            ...snapshot.workspace.history.slice(0, snapshot.workspace.cursor),
            parseReviewOperation(args.operation, 4)!,
          ],
          cursor: snapshot.workspace.cursor + 1,
        },
        draft: args.consumeDraftRevision ? null : snapshot.draft,
      };
      return structuredClone(snapshot);
    }
  );
  integration.history.mockImplementation(
    async (args: Parameters<typeof moveVideoWorkspaceHistory>[0]) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          cursor: snapshot.workspace.cursor + (args.direction === 'undo' ? -1 : 1),
          revision: snapshot.workspace.revision + 1,
        },
      };
      return structuredClone(snapshot);
    }
  );
  integration.read.mockImplementation(async () => structuredClone(snapshot));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const back = vi.fn();
  const button = (key: string) => {
    const node = host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`);
    if (!node) throw new Error(`Missing ${key}`);
    return node;
  };
  const click = async (key: string) => act(async () => button(key).click());
  const fill = async (value: string) =>
    act(async () => {
      const field = host.querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        value
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  return {
    host,
    root,
    back,
    button,
    click,
    fill,
    show,
    close,
    createUrl,
    revokeUrl,
    clipboard,
    get snapshot() {
      return snapshot;
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it('integrates selection, recoverable text, drawing, history and report actions in the modal', async () => {
  const fixture = createEditorFixture();
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
  const fixture = createEditorFixture();
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
  const fixture = createEditorFixture();
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
  const fixture = createEditorFixture();
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
  const fixture = createEditorFixture();
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

it('moves and resizes edit blocks once per gesture, cancelling transient geometry safely', async () => {
  const fixture = createEditorFixture();
  const { host, root } = fixture;
  const change = vi.fn(),
    select = vi.fn();
  const edit = {
    id: 'cut',
    kind: 'cut' as const,
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  try {
    await act(async () =>
      root.render(
        <ReviewSourceLane
          duration={10}
          time={0}
          selection={{ kind: 'point', time: 0 }}
          annotations={[]}
          edits={[edit]}
          boundaries={[0, 2, 4, 6, 8, 10]}
          onEdit={select}
          onChangeEdit={change}
          onSeek={vi.fn()}
          onSelect={vi.fn()}
          onComment={vi.fn()}
        />
      )
    );
    const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.sourceLane"]')!;
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 48));
    const button = lane.querySelector<HTMLButtonElement>('button')!;
    const block = button.parentElement!;
    Object.assign(block, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const event = async (target: Element, kind: string, x: number, button = 0) =>
      act(async () => {
        target.dispatchEvent(new MouseEvent(kind, { bubbles: true, clientX: x, button }));
      });
    await event(button, 'pointerdown', 200);
    await event(block, 'pointermove', 400);
    expect(block.style.left).toBe('40%');
    expect(change).not.toHaveBeenCalled();
    await event(block, 'pointerup', 400);
    expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 4, end: 6 });
    expect(change).toHaveBeenCalledOnce();
    const start = block.querySelector('[data-edge="start"]')!,
      end = block.querySelector('[data-edge="end"]')!;
    await event(start, 'pointerdown', 200);
    await event(block, 'pointermove', 0);
    await event(block, 'pointerup', 0);
    expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 0, end: 4 });
    await event(end, 'pointerdown', 400);
    await event(block, 'pointermove', 700);
    await event(block, 'pointerup', 700);
    expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6 });
    change.mockClear();
    await event(button, 'pointerdown', 200);
    await event(block, 'pointermove', 600);
    await event(block, 'pointercancel', 600);
    await event(block, 'pointerup', 600);
    expect(change).not.toHaveBeenCalled();
    expect(block.style.left).toBe('20%');
    for (const target of [button, start, end]) {
      vi.mocked(block.releasePointerCapture).mockClear();
      const destination = target === start ? 0 : 400;
      await event(target, 'pointerdown', 200);
      await event(block, 'pointermove', destination);
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(block.style.left).toBe('20%');
      expect(block.style.width).toBe('20%');
      expect(block.releasePointerCapture).toHaveBeenCalled();
      await event(block, 'pointerup', destination);
      expect(change).not.toHaveBeenCalled();
    }
    await event(button, 'pointerdown', 200, 2);
    await event(block, 'pointermove', 500);
    await event(block, 'pointerup', 500);
    expect(change).not.toHaveBeenCalled();
    await act(async () =>
      end.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    );
    expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 2, end: 6 });
    await act(async () =>
      start.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
    );
    expect(change).toHaveBeenLastCalledWith(edit, { kind: 'range', start: 0, end: 4 });
  } finally {
    await fixture.cleanup();
  }
});

it('ignores the comment shortcut while report copying disables the comment control', async () => {
  const fixture = createEditorFixture();
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
  const fixture = createEditorFixture();
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
    await fixture.click('cutMode');
    await dragTimePlane(fixture.host, 0, 100);
    await act(async () =>
      fixture.host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.cutLabel 0.0 – 1.0"]')!
        .click()
    );
    await fixture.click('exportVideo');
    expect(fixture.button('undo').disabled).toBe(true);
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
