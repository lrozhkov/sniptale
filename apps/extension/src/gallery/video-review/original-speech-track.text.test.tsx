// @vitest-environment jsdom
import { translate, formatNumber } from '../../platform/i18n';
import { ReviewTimelineResizeGuide } from './timeline-resize-guide';
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextTrack } from './original-speech-track';
import { useReviewText } from './use-review-text';
import type { ReviewTextDocument } from '../../features/video/review/text-document';

let root: Root;
let host: HTMLDivElement;
let current: ReviewTextDocument;
let editor: ReturnType<typeof useReviewText>;
const select = vi.fn();
const open = vi.fn();
function Fixture({
  domain = 'result',
  busy = false,
  compact = false,
  fragmentCount = 1,
}: {
  domain?: 'source' | 'result';
  busy?: boolean;
  compact?: boolean;
  fragmentCount?: number;
}) {
  const document = useRef<ReviewTextDocument>({
    version: 1,
    fragments: Array.from({ length: fragmentCount }, (_, index) => ({
      id: index ? 'overlap' : 'text',
      text: 'Hello',
      originalText: '',
      start: 1,
      end: 2,
      timeDomain: domain,
      revision: 0,
      timingRevision: 0,
      alignment: 'manual',
      showInVideo: true,
    })),
  });
  const [, refresh] = useState(0);
  current = document.current;
  editor = useReviewText({
    document: document.current,
    sourceDuration: 10,
    sourceTime: 0,
    edits: [
      {
        id: 'speed',
        kind: 'speed',
        start: 0,
        end: 10,
        requestedStart: 0,
        requestedEnd: 10,
        rate: 2,
        audio: 'speed',
      },
    ],
    setText: (update) => {
      document.current = update(document.current)!;
      refresh((version) => version + 1);
    },
    select,
    seek: vi.fn(),
    pause: vi.fn(),
  });
  return (
    <ReviewTimelineResizeGuide
      hover={null}
      viewport={{ current: null }}
      gutter={0}
      width={1000}
      duration={10}
    >
      <ReviewTextTrack
        editor={editor}
        busy={busy}
        compact={compact}
        selectedId="text"
        onSelect={select}
        onOpenDocument={open}
      />
    </ReviewTimelineResizeGuide>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  select.mockClear();
  open.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function prepare() {
  const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.textTrack"]')!;
  const block = lane.querySelector<HTMLDivElement>('[data-text-id]')!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 64));
  let captured = false;
  Object.assign(block, {
    setPointerCapture: () => {
      captured = true;
    },
    hasPointerCapture: () => captured,
    releasePointerCapture: () => {
      captured = false;
    },
  });
  return block;
}

it.each([false, true])(
  'matches annotation row geometry for compact=%s without document writes',
  (compact) => {
    const step = compact ? 28 : 36;
    for (const fragmentCount of [0, 1, 2]) {
      act(() =>
        root.render(<Fixture key={fragmentCount} compact={compact} fragmentCount={fragmentCount} />)
      );
      const lane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.textTrack"]')!;
      expect(lane.style.height).toBe(`${Math.max(1, fragmentCount) * step}px`);
      expect(lane.className).toContain('bg-[var(--sniptale-color-surface-hover)]');
      expect(lane.className).not.toContain('my-1');
      const blocks = lane.querySelectorAll<HTMLElement>('[data-text-id]');
      expect(blocks).toHaveLength(fragmentCount);
      const tops = [...blocks].map((block) => parseFloat(block.style.top)).sort((a, b) => a - b);
      expect(tops).toEqual(Array.from({ length: fragmentCount }, (_, index) => index * step + 2));
      for (const block of blocks) {
        expect(block.style.height).toBe(`${step - 4}px`);
      }
      const before = structuredClone(current);
      act(() =>
        root.render(<Fixture key={fragmentCount} compact={compact} fragmentCount={fragmentCount} />)
      );
      expect(current).toEqual(before);
    }
  }
);
async function pointer(target: Element, type: string, x: number) {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  });
}
it.each(['source', 'result'] as const)(
  'moves %s text using the declared clock, commits once and cancels previews',
  async (domain) => {
    act(() => root.render(<Fixture domain={domain} />));
    const block = prepare();
    await pointer(block, 'pointerdown', 200);
    await pointer(block, 'pointermove', 300);
    expect(current.fragments[0]?.start).toBe(1);
    await pointer(block, 'pointerup', 300);
    expect(current.fragments[0]).toMatchObject({
      start: domain === 'source' ? 2 : 1.5,
      end: domain === 'source' ? 3 : 2.5,
      revision: 0,
      timingRevision: 1,
    });
    expect(select).toHaveBeenCalledWith('text');
    const accepted = structuredClone(current);
    await pointer(block, 'pointerdown', 300);
    await pointer(block, 'pointermove', 400);
    act(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    await pointer(block, 'pointerup', 400);
    expect(current).toEqual(accepted);
    await pointer(block, 'pointerdown', 300);
    await pointer(block, 'pointermove', 350);
    await pointer(block, 'pointercancel', 350);
    expect(current).toEqual(accepted);
  }
);
it('trims by handles, supports keyboard selection and opens the one track document', async () => {
  act(() => root.render(<Fixture />));
  const block = prepare();
  await pointer(block.querySelector('[data-text-edge="end"]')!, 'pointerdown', 400);
  await pointer(block, 'pointermove', 500);
  expect(host.querySelector<HTMLElement>('[data-resizing]')?.style.left).toBe('500px');
  await pointer(block, 'pointerup', 500);
  expect(host.querySelector('[data-resizing]')).toBeNull();
  expect(current.fragments[0]).toMatchObject({ start: 1, end: 2.5 });
  await pointer(block.querySelector('[data-text-edge="start"]')!, 'pointerdown', 200);
  await pointer(block, 'pointermove', 300);
  await pointer(block, 'pointerup', 300);
  expect(current.fragments[0]).toMatchObject({ start: 1.5, end: 2.5, timingRevision: 2 });
  act(() => block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(select).toHaveBeenCalledWith('text');
  act(() => host.querySelector<HTMLButtonElement>('[data-track-controls] button')!.click());
  expect(open).toHaveBeenCalledOnce();
});
it('rejects gestures while an export or another blocking operation is busy', async () => {
  act(() => root.render(<Fixture busy />));
  const block = prepare();
  await pointer(block, 'pointerdown', 200);
  await pointer(block, 'pointermove', 300);
  await pointer(block, 'pointerup', 300);
  act(() => block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(select).not.toHaveBeenCalled();
  expect(current.fragments[0]).toMatchObject({ start: 1, end: 2, timingRevision: 0 });
});

it('refuses stale or out-of-project edits and supports manual split/merge/removal through one text writer', () => {
  act(() => root.render(<Fixture />));
  const before = structuredClone(current);
  act(() => {
    editor.change('text', { start: -1 });
  });
  expect(current).toEqual(before);
  expect(editor.error).toBe('invalid');
  act(() => {
    editor.change('text', { end: 6 });
  });
  expect(current).toEqual(before);
  act(() => {
    editor.change('text', { end: 3 }, 999);
  });
  expect(editor.error).toBe('stale');
  expect(current).toEqual(before);
  act(() => {
    editor.change('text', { text: 'Hello world' });
  });
  act(() => {
    editor.split('text', 6, 1.5);
  });
  expect(current.fragments).toHaveLength(2);
  const next = current.fragments[1]!;
  act(() => {
    editor.merge('text', next.id);
  });
  expect(current.fragments).toHaveLength(1);
  expect(current.fragments[0]?.text).toBe('Hello world');
  act(() => {
    editor.remove(['text']);
  });
  expect(current.fragments).toHaveLength(0);
});

it.each(['source', 'result'] as const)(
  'shows accepted %s text duration at both resize limits and clears on capture loss',
  async (domain) => {
    act(() => root.render(<Fixture domain={domain} />));
    const block = prepare();
    const readout = () =>
      host.querySelector('[data-ui="gallery.videoReview.resizeDuration"]')?.textContent;
    const duration = (value: number) =>
      translate('gallery.videoReview.resizeDuration').replace(
        '{duration}',
        translate('gallery.videoReview.resizeSeconds').replace(
          '{value}',
          formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, 'ru')
        )
      );
    await pointer(
      block.querySelector('[data-text-edge="end"]')!,
      'pointerdown',
      domain === 'source' ? 200 : 400
    );
    await pointer(block, 'pointermove', 2000);
    expect(readout()).toContain(duration(domain === 'source' ? 9 : 4));
    expect(current.fragments[0]).toMatchObject({ start: 1, end: 2 });
    await pointer(block, 'lostpointercapture', 2000);
    expect(readout()).toBeUndefined();
    await pointer(
      block.querySelector('[data-text-edge="start"]')!,
      'pointerdown',
      domain === 'source' ? 100 : 200
    );
    await pointer(block, 'pointermove', 2000);
    expect(readout()).toContain(duration(0.01));
    await pointer(block, 'pointerup', 2000);
    expect(readout()).toBeUndefined();
    expect(current.fragments[0]).toMatchObject({ start: 1.99, end: 2 });
  }
);
