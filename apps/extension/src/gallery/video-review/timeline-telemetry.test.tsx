// @vitest-environment jsdom
import { act, Suspense, startTransition } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import { createReviewInteractionEditor } from './interaction-editor';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';

const localeProbe = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ru', translations: 0 }));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => {
    if (key === 'gallery.videoReview.historyMouse') localeProbe.translations++;
    return key;
  },
  useAppLocale: () => localeProbe.locale,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  localeProbe.locale = 'en';
  localeProbe.translations = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const marker = (
  kind: 'action' | 'signal',
  id: string,
  start: number,
  end = start
): ReviewTelemetryMarker => ({
  ref: { kind, id },
  eventType: 'eventClick',
  start,
  end,
});

const render = (
  markers: ReviewTelemetryMarker[],
  cursorArchiveAvailable = false,
  sourceId = 'recording-a'
) =>
  act(() => {
    root.render(
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
        cursorArchiveAvailable={cursorArchiveAvailable}
        sourceId={sourceId}
      />
    );
  });

it('keeps one empty row without showing absent event families', () => {
  render([]);
  expect(host.querySelectorAll('[data-history-family]')).toHaveLength(0);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
});

it('packs populated families in semantic order without empty rows', () => {
  render([
    { ...marker('action', 'mouse', 1), eventType: 'CLICK' },
    { ref: { kind: 'cursor', id: 'cursor' }, eventType: 'cursor', start: 2, end: 3 },
  ]);
  expect(host.querySelector('[data-history-family="keyboard"]')).toBeNull();
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  expect(host.querySelector<HTMLElement>('[data-history-family="mouse"] button')!.style.top).toBe(
    '2px'
  );
  expect(host.querySelector('[data-history-family="cursor"]')).toBeNull();
});

it('retains archived semantic rows while bounded history windows refresh without retaining markers', () => {
  const markers: ReviewTelemetryMarker[] = [
    { ...marker('action', 'mouse', 1), eventType: 'CLICK' },
    { ref: { kind: 'cursor', id: 'cursor' }, eventType: 'cursor', start: 2, end: 3 },
  ];
  render(markers, true);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  render([], true);
  expect(host.querySelectorAll('[data-history-family]')).toHaveLength(1);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  expect(host.querySelector('[data-history-family="cursor"]')).toBeNull();
  expect(host.querySelector('[data-history-family="mouse"] button')).toBeNull();
  render(markers, true);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  render([], true, 'recording-b');
  expect(host.querySelectorAll('[data-history-family]')).toHaveLength(0);
  expect(host.querySelector('[data-history-family="cursor"]')).toBeNull();
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  render([], false, 'recording-b');
  expect(host.querySelectorAll('[data-history-family]')).toHaveLength(0);
});

it('reserves semantic row pitch and groups collisions within the mouse row', () => {
  render([
    marker('action', 'a', 1, 2),
    marker('action', 'b', 1.1, 2.1),
    marker('action', 'c', 1.2, 2.2),
  ]);
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.historyCluster"]')).toHaveLength(1);
  expect(
    host.querySelector('[data-ui="gallery.videoReview.historyCluster"]')?.parentElement?.style.top
  ).toBe('2px');
});

it('groups overflow within three rows and exposes every member for selection', async () => {
  const markers = Array.from({ length: 10 }, (_, i) => ({
    ...marker('action', String(i), 1),
    eventType: 'CLICK',
  }));
  const onMarker = vi.fn();
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        selectedTelemetryRef={markers[8]!.ref}
        animatedIds={new Set([markers[8]!.ref.id])}
        onMarker={onMarker}
      />
    )
  );
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('28px');
  expect(strip.className).not.toContain('overflow-y-auto');
  const cluster = host.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.videoReview.historyCluster"] button'
  )!;
  expect(cluster.getAttribute('aria-pressed')).toBe('true');
  expect(cluster.getAttribute('data-animated')).toBe('true');
  await act(async () => cluster.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role=option]')];
  expect(options).toHaveLength(10);
  expect(options[0]!.textContent).toContain('0:01.000');
  expect(options[8]!.textContent).toContain('gallery.videoReview.clickAnimation');
  await act(async () => options[8]!.click());
  expect(onMarker).toHaveBeenCalledWith(markers[8]);
});

it('exposes readable event text for a history interval with available space', () => {
  render([{ ...marker('action', 'readable', 1, 3), eventType: 'SCROLL' }]);
  expect(host.querySelector('button')?.textContent).toContain('gallery.videoReview.eventScroll');
});

it('describes the captured target and full interval in the action hint', () => {
  render([{ ...marker('signal', 'typing', 1, 4), eventType: 'typing', target: 'Search projects' }]);
  const button = host.querySelector('button')!;
  expect(button.title).toContain('Search projects');
  expect(button.title).toContain('1.0');
  expect(button.title).toContain('4.0');
  expect(button.getAttribute('aria-label')).toContain('Search projects');
});

it('holds groups during zoom then repacks without changing height or selected identity', async () => {
  vi.useFakeTimers();
  const markers = Array.from({ length: 10 }, (_, i) => marker('action', String(i), 1 + i / 100));
  const show = (zoom: number) =>
    act(() =>
      root.render(
        <ReviewTelemetryStrip
          markers={markers}
          duration={10}
          time={0}
          width={1000}
          zoom={zoom}
          selectedTelemetryRef={markers[8]!.ref}
          onMarker={vi.fn()}
        />
      )
    );
  show(1);
  const strip = host.firstElementChild as HTMLDivElement;
  expect(strip.style.height).toBe('28px');
  expect(host.querySelectorAll('button')).toHaveLength(1);
  show(50);
  expect(host.querySelectorAll('button')).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(200));
  show(100);
  await act(async () => vi.advanceTimersByTime(100));
  expect(host.querySelectorAll('button')).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(150));
  expect(host.querySelectorAll('button')).toHaveLength(10);
  expect(new Set([...host.querySelectorAll('button')].map((button) => button.style.top))).toEqual(
    new Set(['2px'])
  );
  expect(strip.style.height).toBe('28px');
  expect(host.querySelectorAll('[aria-pressed=true]')).toHaveLength(1);
  show(1);
  await act(async () => vi.advanceTimersByTime(250));
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(strip.style.height).toBe('28px');
});

it('tints an authored keyboard event without tinting a signal with the same local id', () => {
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={[
          { ...marker('action', 'shared', 1), eventType: 'KEY' },
          { ...marker('signal', 'shared', 5, 6), eventType: 'static-frame' },
        ]}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
        animatedIds={new Set(['shared'])}
      />
    )
  );
  expect(host.querySelectorAll('button[data-animated="true"]')).toHaveLength(1);
});

it('uses the full editor click cursor for ordinary and double clicks', () => {
  const markers = ['CLICK', 'DOUBLE_CLICK'].map((eventType, index) => ({
    ...marker('action', String(index), index + 1),
    eventType,
  }));
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
      />
    )
  );
  expect(host.querySelectorAll('.lucide-mouse-pointer-click')).toHaveLength(2);
  expect(host.querySelector('.lucide-mouse-pointer-2')).toBeNull();
});

it('keeps commands separately selectable above typing coverage and shows their safe labels', () => {
  const onMarker = vi.fn();
  const typing: ReviewTelemetryMarker = {
    ref: { kind: 'signal', id: 'typing' },
    eventType: 'typing',
    start: 0,
    end: 9,
  };
  const key: ReviewTelemetryMarker = {
    ref: { kind: 'action', id: 'command' },
    eventType: 'KEY',
    target: 'Ctrl+K',
    start: 3,
    end: 3,
  };
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={[typing, key]}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={onMarker}
      />
    )
  );
  expect(host.querySelectorAll('[data-ui="gallery.videoReview.historyCluster"]')).toHaveLength(0);
  const keyboard = host.querySelector('[data-history-family="keyboard"]')!;
  const buttons = [...keyboard.querySelectorAll<HTMLButtonElement>('button')];
  expect(buttons).toHaveLength(2);
  const command = buttons.find((button) => button.getAttribute('aria-label')?.includes('Ctrl+K'))!;
  expect(command.textContent).toContain('Ctrl+K');
  act(() => command.click());
  expect(onMarker).toHaveBeenCalledWith(key);
  expect(command.style.top).toBe(buttons[0]!.style.top);
});

it('hides technical cursor gaps from history lanes', () => {
  render([{ ref: { kind: 'cursor', id: 'gap' }, eventType: 'cursor-gap', start: 1, end: 1.025 }]);
  expect(host.querySelector('[data-history-family="cursor"]')).toBeNull();
  expect(host.querySelectorAll('button')).toHaveLength(0);
});

it('keeps technical focus keys hidden and does not author keys from history', () => {
  const onAdd = vi.fn();
  const onSelect = vi.fn();
  const key = {
    id: 'focus',
    timelineId: 'segment:focus',
    segmentId: 'segment',
    binding: { kind: 'project' as const },
    sourceTime: 2,
    time: 2,
    x: 0.5,
    y: 0.5,
    anchor: 'manual' as const,
    interpolation: 'linear' as const,
  };
  const show = (keys: (typeof key)[]) =>
    act(() =>
      root.render(
        <ReviewTelemetryStrip
          markers={[]}
          cursorFocusKeys={keys}
          duration={10}
          time={0}
          width={1000}
          zoom={1}
          onMarker={vi.fn()}
          onCursorFocusKey={onSelect}
          onAddCursorFocusKey={onAdd}
        />
      )
    );
  show([key]);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('28px');
  expect(host.querySelector('[data-ui="cursorFocusPath.timelineKeys"]')).toBeNull();
  show([]);
  expect(host.querySelectorAll('[data-history-family]')).toHaveLength(0);
  act(() =>
    host.firstElementChild!.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 500, clientY: 10 })
    )
  );
  expect(onAdd).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it('does not add a focus key when a packed mouse event receives a double click', () => {
  const onAdd = vi.fn();
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={[{ ...marker('action', 'click', 1), eventType: 'CLICK' }]}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
        onAddCursorFocusKey={onAdd}
        onCursorFocusKey={vi.fn()}
      />
    )
  );
  act(() =>
    host.querySelector('button')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  );
  expect(onAdd).not.toHaveBeenCalled();
});

it('keeps authored technical coverage hidden without modifying its keys', () => {
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        markers={[]}
        duration={10}
        time={5}
        width={1000}
        zoom={1}
        onMarker={vi.fn()}
        onCursorFocusKey={vi.fn()}
        onAddCursorFocusKey={vi.fn()}
        cursorFocusKeys={[
          {
            id: 'manual',
            timelineId: 'gap:manual',
            segmentId: 'gap',
            binding: { kind: 'project' },
            time: 5,
            sourceTime: 5,
            x: 0.2,
            y: 0.3,
            anchor: 'manual',
            interpolation: 'smooth',
            sourceCoverage: { start: 3, end: 7 },
          },
        ]}
      />
    )
  );
  expect(host.querySelector('[data-ui="cursorFocusPath.authoredCoverage"]')).toBeNull();
  expect(host.querySelector('[data-cursor-focus-key="manual"]')).toBeNull();
});

it('keeps static cursor coverage unread across playhead ticks and uses the latest marker command', () => {
  let reads = 0;
  const keys: NonNullable<Parameters<typeof ReviewTelemetryStrip>[0]['cursorFocusKeys']> =
    Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      timelineId: String(index),
      segmentId: 'recorded',
      binding: { kind: 'project' },
      time: index / 100,
      sourceTime: index / 100,
      x: 0.2,
      y: 0.3,
      get anchor() {
        reads++;
        return 'movement' as const;
      },
      interpolation: 'smooth',
    }));
  const markers = [{ ...marker('action', 'click', 1), eventType: 'CLICK' }];
  const first = vi.fn(),
    second = vi.fn(),
    select = vi.fn(),
    add = vi.fn();
  const renderAt = (time: number, onMarker = first) =>
    act(() =>
      root.render(
        <ReviewTelemetryStrip
          markers={markers}
          cursorFocusKeys={keys}
          duration={10}
          time={time}
          playing
          width={1000}
          zoom={1}
          onMarker={onMarker}
          onCursorFocusKey={select}
          onAddCursorFocusKey={add}
        />
      )
    );
  renderAt(0);
  const initialReads = reads;
  renderAt(0.1, second);
  renderAt(0.2, second);
  expect(reads).toBe(initialReads);
  act(() => host.querySelector<HTMLButtonElement>('[data-history-family="mouse"] button')!.click());
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(markers[0]);
});

it('does not dispatch a marker through a handler from an uncommitted suspended render', async () => {
  const markers = [{ ...marker('action', 'command', 1), eventType: 'CLICK' }];
  const committed = vi.fn(),
    abandoned = vi.fn();
  const pending = new Promise<void>(() => {});
  function Wait({ suspend }: { suspend: boolean }) {
    if (suspend) throw pending;
    return null;
  }
  const view = (onMarker: typeof committed, suspend: boolean) => (
    <Suspense fallback={<div>waiting</div>}>
      <ReviewTelemetryStrip
        markers={markers}
        duration={10}
        time={0}
        width={1000}
        zoom={1}
        onMarker={onMarker}
      />
      <Wait suspend={suspend} />
    </Suspense>
  );
  await act(async () => root.render(view(committed, false)));
  await act(async () => {
    startTransition(() => root.render(view(abandoned, true)));
  });
  act(() => host.querySelector<HTMLButtonElement>('[data-history-family="mouse"] button')!.click());
  expect(committed).toHaveBeenCalledWith(markers[0]);
  expect(abandoned).not.toHaveBeenCalled();
});

it('refreshes memoized telemetry labels, selection, capability and coverage geometry from their real inputs', () => {
  const command = vi.fn(),
    select = vi.fn(),
    add = vi.fn();
  const key: NonNullable<Parameters<typeof ReviewTelemetryStrip>[0]['cursorFocusKeys']>[number] = {
    id: 'manual',
    timelineId: 'manual',
    segmentId: 'gap',
    binding: { kind: 'project' },
    time: 5,
    sourceTime: 5,
    x: 0.2,
    y: 0.3,
    anchor: 'manual',
    interpolation: 'smooth',
    sourceCoverage: { start: 3, end: 7 },
  };
  const markers = [{ ...marker('action', 'click', 1), eventType: 'CLICK' }];
  const base = {
    markers,
    cursorFocusKeys: [key],
    duration: 10,
    time: 0,
    playing: true,
    width: 1000,
    zoom: 1,
    onMarker: command,
    onCursorFocusKey: select,
    onAddCursorFocusKey: add,
  };
  act(() => root.render(<ReviewTelemetryStrip {...base} />));
  const initialTranslations = localeProbe.translations;
  act(() => root.render(<ReviewTelemetryStrip {...base} time={1} />));
  expect(localeProbe.translations).toBe(initialTranslations);
  localeProbe.locale = 'ru';
  act(() => root.render(<ReviewTelemetryStrip {...base} time={2} />));
  expect(localeProbe.translations).toBeGreaterThan(initialTranslations);
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        {...base}
        width={500}
        selectedTelemetryRef={markers[0]!.ref}
        captureCapabilities={{
          version: 1,
          pointer: 'unavailable',
          wheel: 'unavailable',
          keyboard: 'available',
          coverage: 'document',
        }}
      />
    )
  );
  expect(
    host.querySelector('[data-history-family="mouse"]')!.getAttribute('data-history-coverage')
  ).toBe('unavailable');
  expect(
    host.querySelector('[data-history-family="mouse"] button')!.getAttribute('aria-pressed')
  ).toBe('true');
  expect(host.querySelector('[data-ui="cursorFocusPath.authoredCoverage"]')).toBeNull();
  act(() =>
    root.render(
      <ReviewTelemetryStrip
        {...base}
        cursorFocusKeys={[{ ...key, sourceCoverage: { start: 1, end: 2 } }]}
      />
    )
  );
  expect(host.querySelector('[data-ui="cursorFocusPath.authoredCoverage"]')).toBeNull();
  expect(host.querySelector('[data-ui="cursorFocusPath.authoredCoverage"]')).toBeNull();
});

it.each([
  ['CLICK', 'move', 3, 4],
  ['KEY', 'start', 2.5, 3],
  ['CLICK', 'end', 2, 3.5],
] as const)(
  'drags %s %s with a preview and one final timing commit',
  async (eventType, edge, start, end) => {
    const m = { ...marker('action', 'authored', 2, 3), eventType };
    const onMarker = vi.fn();
    const editor = createReviewInteractionEditor({
      advanced: createQuickEditAdvancedState(),
      duration: 10,
      time: 0,
      beforeAction: (action) => action(),
      canStart: () => true,
      setMode: vi.fn(),
      setActiveSelection: vi.fn(),
      seek: vi.fn(),
      setInteractionTimeline: vi.fn(),
      setKeyAnimations: vi.fn(),
      setClickAnimations: vi.fn(),
    });
    const update = vi.fn<typeof editor.update>();
    editor.update = update;
    await act(async () =>
      root.render(
        <ReviewTelemetryStrip
          markers={[m]}
          duration={10}
          time={0}
          width={1000}
          zoom={1}
          onMarker={onMarker}
          interactionEditor={editor}
        />
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[data-review-action-key]')!;
    const strip = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.historyStrip"]')!;
    vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 28));
    Object.defineProperties(button, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const target =
      edge === 'move' ? button : button.querySelector<HTMLElement>(`[data-press-edge="${edge}"]`)!;
    const event = async (type: string, x: number, node: HTMLElement = button) =>
      act(async () => {
        const e = new MouseEvent(type, {
          bubbles: true,
          clientX: x,
          button: 0,
          altKey: edge === 'end',
        });
        Object.defineProperty(e, 'pointerId', { value: 1 });
        node.dispatchEvent(e);
      });
    await event('pointerdown', 200, target);
    const nextX = edge === 'move' ? 300 : 250;
    await event('pointermove', nextX);
    expect(button.dataset['reviewDragging']).toBe('true');
    expect(update).not.toHaveBeenCalled();
    await event('pointerup', nextX);
    expect(update).toHaveBeenCalledExactlyOnceWith(m, start, end);
    expect(button.dataset['reviewDragging']).toBeUndefined();
    await act(async () => button.click());
    expect(onMarker).toHaveBeenCalledTimes(1);
    update.mockClear();
    await event('pointerdown', 200, target);
    await event('pointermove', nextX);
    await event('pointercancel', nextX);
    await event('pointerup', nextX);
    expect(update).not.toHaveBeenCalled();
    await event('pointerdown', 200, target);
    await event('pointermove', nextX);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    await event('pointerup', nextX);
    expect(update).not.toHaveBeenCalled();
  }
);
