// @vitest-environment jsdom
import {
  createQuickEditAdvancedState,
  createQuickEditAdvancedContent,
} from '../../features/video/review/advanced/defaults';
import { createReviewCommandFixture } from './editor-fixture.test-support';
import {
  translate,
  formatNumber,
  getCurrentLocale,
  setLocalePreference,
} from '../../platform/i18n';
import { ReviewTimelineResizeGuide } from './timeline-resize-guide';
import { act, Suspense, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextTrack } from './original-speech-track';
import { useReviewText } from './use-review-text';
import type { ReviewEdit } from '../../features/video/review/types';
import {
  createReviewCaptionSettings,
  type ReviewTextDocument,
} from '../../features/video/review/text-document';

const presentation = vi.hoisted(() => ({ row: vi.fn() }));
vi.mock('./track-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./track-row')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    ReviewTrackRow: (props: React.ComponentProps<typeof actual.ReviewTrackRow>) => {
      presentation.row();
      return createElement(actual.ReviewTrackRow, props);
    },
  };
});
const defaultEdits: readonly ReviewEdit[] = [
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
];

let root: Root;
let host: HTMLDivElement;
let current: ReviewTextDocument;
let editor: ReturnType<typeof useReviewText>;
const select = vi.fn();
const toggleCaptions = vi.fn();
function Fixture({
  domain = 'result',
  busy = false,
  compact = false,
  fragmentCount = 1,
  initial,
  edits,
  sourceTime = 0,
  onSelect = select,
  selectedId = 'text',
  suspend = false,
  captionsEnabled = false,
}: {
  domain?: 'source' | 'result';
  busy?: boolean;
  compact?: boolean;
  fragmentCount?: number;
  initial?: ReviewTextDocument;
  edits?: readonly ReviewEdit[];
  sourceTime?: number;
  onSelect?: (id: string) => void;
  selectedId?: string;
  suspend?: boolean;
  captionsEnabled?: boolean;
}) {
  const document = useRef<ReviewTextDocument>(
    initial ?? {
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
    }
  );
  const [, refresh] = useState(0);
  current = document.current;
  const effectiveEdits = edits ?? defaultEdits;
  editor = useReviewText({
    commands: createReviewCommandFixture(() => ({
      duration: 10,
      time: 0,
      document: {
        annotations: [],
        canvasComments: [],
        edits: [...effectiveEdits],
        advancedContent: createQuickEditAdvancedContent(),
      },
      advanced: { ...createQuickEditAdvancedState(), text: document.current },
    })),
    document: document.current,
    captions: { ...createReviewCaptionSettings(), enabled: captionsEnabled },
    sourceDuration: 10,
    sourceTime,
    edits: effectiveEdits,
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
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleCaptions={toggleCaptions}
      />
      {suspend && <Pending />}
    </ReviewTimelineResizeGuide>
  );
}
function Pending(): never {
  throw new Promise(() => {});
}
beforeEach(() => {
  presentation.row.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  select.mockClear();
  toggleCaptions.mockClear();
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
async function pointer(target: Element, type: string, x: number, altKey = false) {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0, altKey });
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
      start: domain === 'source' ? 1 : 1.5,
      end: domain === 'source' ? 1.5 : 2.5,
      timeDomain: 'result',
      revision: 0,
      timingRevision: 1,
    });
    expect(select).not.toHaveBeenCalled();
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
it('trims by handles, supports keyboard selection and toggles caption output', async () => {
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
  expect(toggleCaptions).toHaveBeenCalledOnce();
  expect(host.querySelector('[aria-label="gallery.videoReview.textTrackOpen"]')).toBeNull();
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
    expect(current.fragments[0]).toMatchObject({
      start: domain === 'source' ? 0.99 : 1.99,
      end: domain === 'source' ? 1 : 2,
      timeDomain: 'result',
    });
  }
);

it.each(['source', 'result'] as const)(
  'snaps %s text resize in source pixels and releases with Alt',
  async (domain) => {
    act(() => root.render(<Fixture domain={domain} fragmentCount={2} />));
    act(() => {
      editor.change('overlap', { start: 3, end: 4 });
    });
    const block = prepare();
    const initial = domain === 'source' ? 200 : 400;
    const near = domain === 'source' ? 295 : 595;
    await pointer(block.querySelector('[data-text-edge="end"]')!, 'pointerdown', initial);
    await pointer(block, 'pointermove', near);
    expect(
      Number.parseFloat(host.querySelector<HTMLElement>('[data-resizing]')!.style.left)
    ).toBeCloseTo(near + 5, 3);
    await pointer(block, 'pointermove', near, true);
    expect(
      Number.parseFloat(host.querySelector<HTMLElement>('[data-resizing]')!.style.left)
    ).toBeCloseTo(near, 3);
    await pointer(block, 'pointermove', near);
    await pointer(block, 'pointerup', near);
    expect(current.fragments[0]?.end).toBe(domain === 'source' ? 1.5 : 3);
  }
);

it('keeps a fully cut phrase on its retained source interval without rewriting the document', () => {
  const initial: ReviewTextDocument = {
    version: 1,
    fragments: [
      {
        id: 'text',
        text: 'Hidden phrase',
        originalText: '',
        start: 3,
        end: 4,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
        sourceAnchor: { duration: 1, spans: [{ start: 3, end: 4, offset: 0, duration: 1 }] },
      },
    ],
  };
  const before = structuredClone(initial);
  act(() =>
    root.render(
      <Fixture
        initial={initial}
        edits={[{ id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 }]}
      />
    )
  );
  const block = prepare();
  expect(block.style.left).toBe('30%');
  expect(block.style.width).toBe('10%');
  expect(editor.sourceInterval(current.fragments[0]!)).toEqual({ start: 3, end: 4 });
  expect(current).toEqual(before);
});

it('replaces the old native placement only when an anchored text drag commits', async () => {
  const initial: ReviewTextDocument = {
    version: 1,
    fragments: [
      {
        id: 'text',
        text: 'Phrase',
        originalText: '',
        start: 1,
        end: 2,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
        sourceAnchor: { duration: 1, spans: [{ start: 2, end: 4, offset: 0, duration: 1 }] },
      },
    ],
  };
  act(() => root.render(<Fixture initial={initial} />));
  const block = prepare();
  await pointer(block, 'pointerdown', 200);
  await pointer(block, 'pointermove', 300);
  expect(current.fragments[0]?.sourceAnchor).toEqual(initial.fragments[0]!.sourceAnchor);
  expect(block.style.left).toBe('30%');
  await pointer(block, 'pointerup', 300);
  expect(current.fragments[0]).toMatchObject({ start: 1.5, end: 2.5, timingRevision: 1 });
  expect(current.fragments[0]?.sourceAnchor).toBeUndefined();
});

it('anchors result-text resize to its edge when a handle is grabbed off-center across a speed boundary', async () => {
  const initial: ReviewTextDocument = {
    version: 1,
    fragments: [
      {
        id: 'text',
        text: 'edge',
        originalText: '',
        start: 1,
        end: 3,
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
      },
    ],
  };
  const edits: ReviewEdit[] = [
    {
      id: 'rate',
      kind: 'speed',
      start: 4,
      end: 8,
      requestedStart: 4,
      requestedEnd: 8,
      rate: 2,
      audio: 'speed',
    },
  ];
  act(() => root.render(<Fixture initial={initial} edits={edits} />));
  const block = prepare();
  await pointer(block.querySelector('[data-text-edge="end"]')!, 'pointerdown', 294, true);
  await pointer(block, 'pointermove', 494, true);
  await pointer(block, 'pointerup', 494, true);
  expect(current.fragments[0]!.end).toBeCloseTo(4.5, 7);
  expect(editor.sourceInterval(current.fragments[0]!).end).toBeCloseTo(5, 7);
});

it('skips the unchanged text lane hierarchy while retaining the latest committed selection command', () => {
  const first = vi.fn();
  const latest = vi.fn();
  act(() => root.render(<Fixture onSelect={first} />));
  const renders = presentation.row.mock.calls.length;
  act(() => root.render(<Fixture sourceTime={3} onSelect={latest} />));
  expect(presentation.row).toHaveBeenCalledTimes(renders);
  act(() =>
    host
      .querySelector('[data-text-id]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(latest).toHaveBeenCalledWith('text');
  expect(first).not.toHaveBeenCalled();
  act(() => root.render(<Fixture selectedId="other" />));
  expect(presentation.row.mock.calls.length).toBeGreaterThan(renders);
  const block = host.querySelector<HTMLElement>('[data-text-id]')!;
  expect(block.getAttribute('aria-pressed')).toBe('false');
  act(() => root.render(<Fixture selectedId="other" busy />));
  expect(block.getAttribute('aria-disabled')).toBe('true');
  act(() => root.render(<Fixture selectedId="other" busy compact />));
  expect(block.style.height).toBe('24px');
  act(() => root.render(<Fixture selectedId="other" busy compact captionsEnabled />));
  expect(host.querySelector('[data-track-controls] button')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
});

it('does not publish selection receivers from an abandoned suspended render', () => {
  const committed = vi.fn();
  const abandoned = vi.fn();
  act(() =>
    root.render(
      <Suspense fallback={null}>
        <Fixture onSelect={committed} />
      </Suspense>
    )
  );
  const block = host.querySelector('[data-text-id]')!;
  act(() =>
    root.render(
      <Suspense fallback={null}>
        <Fixture onSelect={abandoned} suspend />
      </Suspense>
    )
  );
  act(() => block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(committed).toHaveBeenCalledWith('text');
  expect(abandoned).not.toHaveBeenCalled();
});

it('updates authored text, projected geometry and locale through the presentation boundary', async () => {
  act(() => root.render(<Fixture />));
  const block = prepare();
  expect(block.style.left).toBe('20%');
  act(() => {
    editor.change('text', { text: 'Updated' });
  });
  expect(block.textContent).toBe('Updated');
  act(() => root.render(<Fixture edits={[]} />));
  expect(block.style.left).toBe('10%');
  const locale = getCurrentLocale();
  const renders = presentation.row.mock.calls.length;
  try {
    await act(async () => setLocalePreference(locale === 'en' ? 'ru' : 'en'));
    expect(host.querySelector('[data-track-label]')?.textContent).toBe(
      translate('gallery.videoReview.textTrack')
    );
    expect(presentation.row.mock.calls.length).toBeGreaterThan(renders);
  } finally {
    await act(async () => setLocalePreference(locale));
  }
});
