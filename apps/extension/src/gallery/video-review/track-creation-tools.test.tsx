// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewTextDocument } from '../../features/video/review/text-document';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import { useReviewText } from './use-review-text';
import { useReviewTrackCreation } from './track-creation-tools';
import { useReviewTimelinePlaneDrag } from './timeline-drag';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((close) => close());
  vi.unstubAllGlobals();
});
type Input = Parameters<typeof useReviewTrackCreation>[0];
const edits: ReviewEdit[] = [
  { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
  {
    id: 'speed',
    kind: 'speed',
    start: 6,
    end: 10,
    requestedStart: 6,
    requestedEnd: 10,
    rate: 2,
    audio: 'speed',
  },
];
function mount(overrides: Partial<Input> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor: ReturnType<typeof useReviewText>;
  let current: ReturnType<typeof createReviewTextDocument>;
  const openAudio = vi.fn();
  const record = vi.fn();
  const importFile = vi.fn();
  let input: Partial<Input> = overrides;
  function Probe() {
    const document = useRef(createReviewTextDocument());
    const [, refresh] = useState(0);
    const [selection, select] = useState<ReviewAnchor>({ kind: 'point', time: 0 });
    editor = useReviewText({
      document: document.current,
      edits,
      sourceDuration: 12,
      sourceTime: 0,
      setText: (update) => {
        document.current = update(document.current)!;
        refresh((v) => v + 1);
      },
      select: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
    });
    current = editor.document;
    const creation = useReviewTrackCreation({
      sourceId: 'source',
      track: 'text',
      blocked: false,
      beforeAction: undefined,
      range: undefined,
      text: editor,
      onRecordVoiceover: record,
      onImportFile: importFile,
      onOpenAudio: openAudio,
      ...input,
    });
    const plane = useReviewTimelinePlaneDrag({
      duration: 12,
      time: 0,
      selection,
      onSelect: select,
      onSeek: vi.fn(),
      onTextRangeCommit: creation.active ? creation.commitText : undefined,
    });
    return (
      <>
        {creation.tools}
        <div
          data-plane
          ref={plane.plane}
          onPointerDown={plane.onPointerDown}
          onPointerMove={plane.onPointerMove}
          onPointerUp={plane.onPointerUp}
          onPointerCancel={plane.onPointerCancel}
        >
          <div data-ui="gallery.videoReview.textTrack">Empty lane</div>
        </div>
      </>
    );
  }
  const render = (next: Partial<Input>) => {
    input = next;
    act(() => root.render(<Probe />));
  };
  render(input);
  const plane = host.querySelector<HTMLElement>('[data-plane]')!;
  vi.spyOn(plane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 100));
  Object.assign(plane, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
  cleanup.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const button = (key: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="gallery.videoReview.${key}"]`)!;
  const pointer = (kind: string, x: number) =>
    act(() => {
      const event = new MouseEvent(kind, { bubbles: true, button: 0, clientX: x });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      host.querySelector('[data-ui="gallery.videoReview.textTrack"]')!.dispatchEvent(event);
    });
  return {
    host,
    render,
    button,
    pointer,
    record,
    openAudio,
    importFile,
    document: () => current!,
    editor: () => editor!,
  };
}

it('creates text from a selected source range projected through cuts and speed', () => {
  const f = mount({ range: { kind: 'range', start: 4, end: 10 } });
  act(() => f.button('textFragmentAdd').click());
  expect(f.document().fragments).toHaveLength(1);
  expect(f.document().fragments[0]).toMatchObject({ start: 2, end: 6, timeDomain: 'result' });
});

it('draws text on its empty lane and cancels the next gesture with Escape', () => {
  const f = mount();
  act(() => f.button('textFragmentAdd').click());
  expect(f.button('textFragmentAdd').getAttribute('aria-pressed')).toBe('true');
  f.pointer('pointerdown', 400);
  f.pointer('pointermove', 1000);
  expect(f.document().fragments).toHaveLength(0);
  f.pointer('pointerup', 1000);
  expect(f.document().fragments[0]).toMatchObject({ start: 2, end: 6 });
  expect(f.button('textFragmentAdd').getAttribute('aria-pressed')).toBe('false');
  act(() => f.button('textFragmentAdd').click());
  f.pointer('pointerdown', 400);
  f.pointer('pointermove', 1100);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  f.pointer('pointerup', 1100);
  expect(f.document().fragments).toHaveLength(1);
});

it('refuses a fully removed text range without changing the document', () => {
  const f = mount({ range: { kind: 'range', start: 2, end: 4 } });
  expect(f.button('textFragmentAdd').disabled).toBe(true);
  act(() => f.button('textFragmentAdd').click());
  expect(f.document().fragments).toEqual([]);
});

it('keeps the captured audio lane through admission and rejects another source', () => {
  const pending: (() => void)[] = [];
  const beforeAction: Input['beforeAction'] = (action) => pending.push(action);
  const f = mount({ track: 'music', beforeAction });
  const trigger = f.button('musicLibrary');
  act(() => trigger.click());
  expect(f.openAudio).not.toHaveBeenCalled();
  f.render({ track: 'voiceover', beforeAction });
  act(() => pending.shift()!());
  expect(f.openAudio).toHaveBeenCalledExactlyOnceWith(trigger, 'music');
  act(() => f.button('audioImport').click());
  f.render({ track: 'voiceover', sourceId: 'replacement', beforeAction });
  act(() => pending.shift()!());
  expect(f.openAudio).toHaveBeenCalledOnce();
});

it('exposes recording only for voiceover and blocks creation while busy', () => {
  const f = mount({ track: 'voiceover' });
  act(() => f.button('recordVoiceover').click());
  expect(f.record).toHaveBeenCalledOnce();
  f.render({ track: 'voiceover', blocked: true });
  expect(f.button('recordVoiceover').disabled).toBe(true);
  expect(f.button('audioImport').disabled).toBe(true);
  f.render({ track: 'music' });
  expect(f.button('recordVoiceover')).toBeNull();
});
