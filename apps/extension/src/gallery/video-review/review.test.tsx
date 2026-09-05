// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimeline } from './timeline';
import { ReviewInspector } from './inspector';
import type { ReviewAnchor } from '../../features/video/review/types';
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('keeps original time coordinates through zoom and preserves separate comment navigation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onMarker = vi.fn();
  const onComment = vi.fn();
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  const marker = {
    ref: { kind: 'action' as const, id: 'click' },
    eventType: 'CLICK',
    start: 1,
    end: 1.1,
  };
  try {
    act(() =>
      root.render(
        <ReviewTimeline
          duration={4}
          time={2}
          playing={false}
          selection={{ kind: 'point', time: 2 }}
          annotations={[annotation]}
          markers={[marker]}
          onSeek={vi.fn()}
          onSelect={onSelect}
          onPlay={vi.fn()}
          onMarker={onMarker}
          onComment={onComment}
        />
      )
    );
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.zoomIn"]')!.click()
    );
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="gallery.videoReview.position"]')?.max
    ).toBe('4');
    act(() =>
      host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.range"]')!.click()
    );
    expect(onSelect).toHaveBeenCalledWith({ kind: 'range', start: 2, end: 3 });
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[title="gallery.videoReview.eventClick · 0:01.000"]')!
        .click()
    );
    expect(onMarker).toHaveBeenCalledWith(marker);
    act(() => host.querySelector<HTMLButtonElement>('[title="Comment"]')!.click());
    expect(onComment).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('hover highlights without seeking; comment selection and edit are distinct explicit actions', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onEdit = vi.fn();
  const onHover = vi.fn();
  const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 2 } };
  try {
    act(() =>
      root.render(
        <ReviewInspector
          filename="clip.webm"
          annotations={[annotation]}
          selectedId={null}
          busy={false}
          canUndo={true}
          canRedo={false}
          message={null}
          onBack={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onAdd={vi.fn()}
          onSelect={onSelect}
          onEdit={onEdit}
          onHover={onHover}
          onDelete={vi.fn()}
          onReport={vi.fn()}
        >
          {null}
        </ReviewInspector>
      )
    );
    act(() =>
      host.querySelector('li')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    );
    expect(onHover).toHaveBeenCalledWith(annotation);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('li button')!.click());
    expect(onSelect).toHaveBeenCalledWith(annotation);
    expect(onEdit).not.toHaveBeenCalled();
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.editComment"]')!
        .click()
    );
    expect(onEdit).toHaveBeenCalledWith(annotation);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

const integration = vi.hoisted(() => ({
  load: vi.fn(),
  index: vi.fn(),
  draft: vi.fn(),
  commit: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  download: vi.fn(),
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
vi.mock('../library/actions/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../library/actions/shared')>()),
  downloadBlob: integration.download,
}));
import {
  parseReviewAnnotation,
  parseReviewOperation,
} from '../../features/video/review/validation';
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
    expect(host.querySelector('video')!.currentTime).toBe(1);
    await click('play');
    await act(async () => host.querySelector('video')!.dispatchEvent(new Event('pause')));
    await click('addComment');
    await fill('First note');
    await click('addComment');
    expect(host.textContent).toContain('gallery.videoReview.finishComment');
    await click('selectedRegion');
    const number = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(number, '30');
      number.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('drawRegion');
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
    await click('drawRegion');
    await act(async () => {
      pointer('pointerdown', 10, 10);
      pointer('pointercancel', 20, 20);
    });
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(back).not.toHaveBeenCalled();
    await click('removeRegion');
    await click('selectedRegion');
    await click('save');
    expect(fixture.snapshot.workspace.history).toHaveLength(1);
    await click('editComment');
    await fill('Edited note');
    await click('save');
    await click('undo');
    expect(host.textContent).toContain('First note');
    await click('redo');
    expect(host.textContent).toContain('Edited note');
    await click('range');
    await click('addComment');
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
    const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => {
      checkboxes[1]!.click();
      checkboxes[0]!.click();
    });
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

it('drags a source range and both edges, rejects invalid numeric bounds, and preserves grouped comments', async () => {
  const fixture = createEditorFixture();
  const { root, host } = fixture;
  let selected: ReviewAnchor = { kind: 'range', start: 1, end: 3 };
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
        markers={[
          { ref: { kind: 'cursor', id: '1' }, eventType: 'cursor', start: 1, end: 1 },
          { ref: { kind: 'cursor', id: '2' }, eventType: 'cursor', start: 1.001, end: 1.001 },
        ]}
        onSeek={seek}
        onSelect={select}
        onPlay={vi.fn()}
        onMarker={vi.fn()}
        onComment={vi.fn()}
      />
    );
  }
  const pointer = (node: HTMLElement, type: string, x: number) => {
    Object.assign(node, { setPointerCapture: vi.fn() });
    const event = new MouseEvent(type, { bubbles: true, clientX: x });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    node.dispatchEvent(event);
  };
  try {
    await act(async () => root.render(<Harness />));
    const slider = host.querySelector<HTMLInputElement>(
      '[aria-label="gallery.videoReview.position"]'
    )!;
    vi.spyOn(slider.parentElement!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 44)
    );
    await act(async () => {
      pointer(slider, 'pointerdown', 100);
      pointer(slider, 'pointermove', 200);
      pointer(slider, 'pointerup', 200);
    });
    expect(selected).toEqual({ kind: 'range', start: 1, end: 2 });
    const edges = host.querySelectorAll<HTMLElement>('span.cursor-ew-resize');
    await act(async () => {
      pointer(edges[0]!, 'pointerdown', 100);
      pointer(edges[0]!, 'pointermove', 50);
      pointer(edges[0]!, 'pointerup', 50);
    });
    expect(selected).toEqual({ kind: 'range', start: 0.5, end: 2 });
    await act(async () => {
      pointer(edges[1]!, 'pointerdown', 200);
      pointer(edges[1]!, 'pointermove', 350);
      pointer(edges[1]!, 'pointercancel', 350);
    });
    expect(selected).toEqual({ kind: 'range', start: 0.5, end: 3.5 });
    const fields = host.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const enter = async (node: HTMLInputElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          node,
          value
        );
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await enter(fields[0]!, '3.8');
    expect(selected).toEqual({ kind: 'range', start: 0.5, end: 3.5 });
    await enter(fields[1]!, '3');
    expect(selected).toEqual({ kind: 'range', start: 0.5, end: 3 });
    expect(host.querySelector('[title="First · Second"]')?.textContent).toContain('2');
    expect(
      host.querySelectorAll('[title="gallery.videoReview.eventCursor · 0:01.000"]')
    ).toHaveLength(1);
    await act(async () => {
      pointer(slider, 'pointerdown', 200);
      pointer(slider, 'pointercancel', 200);
    });
    expect(seek).not.toHaveBeenCalled();
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
    await click('cutMode');
    await key('ArrowLeft');
    expect(video.currentTime).toBe(0);
    await key('ArrowRight');
    expect(video.currentTime).toBe(1);
    await key('ArrowLeft');
    expect(video.currentTime).toBe(0);
    await click('applyCut');
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
      '[aria-label="gallery.videoReview.cutLabel 0:00.000 – 0:01.000"]'
    )!;
    await act(async () => cut.click());
    expect(video.currentTime).toBe(0);
    await click('removeEdit');
    expect(fixture.snapshot.workspace.history.at(-1)?.after).toBeNull();
    await click('undo');
    await click('cutMode');
    await click('point');
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
