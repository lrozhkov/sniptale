// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CursorFocusTimelineKeys } from './cursor-focus-timeline-keys';
import type { CursorFocusTimelineKey } from '../features/video/project/cursor-focus-path/timeline';
vi.mock('../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
  getCurrentLocale: () => 'en',
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const keys: CursorFocusTimelineKey[] = [
  {
    id: 'auto',
    timelineId: 'a',
    segmentId: 'run',
    binding: { kind: 'project' },
    time: 0,
    sourceTime: 0,
    x: 0.2,
    y: 0.2,
    anchor: 'boundary',
    interpolation: 'smooth',
  },
  {
    id: 'manual',
    timelineId: 'm',
    segmentId: 'run',
    binding: { kind: 'project' },
    time: 0.1,
    sourceTime: 0.1,
    x: 0.5,
    y: 0.5,
    anchor: 'manual',
    interpolation: 'smooth',
  },
  {
    id: 'end',
    timelineId: 'z',
    segmentId: 'run',
    binding: { kind: 'project' },
    time: 4,
    sourceTime: 4,
    x: 0.8,
    y: 0.8,
    anchor: 'boundary',
    interpolation: 'smooth',
  },
];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('retains grouped keys and doubleclick adds once without a deferred seek', async () => {
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  act(() =>
    root.render(
      <CursorFocusTimelineKeys
        keys={keys}
        selectedId="auto"
        time={0}
        duration={4}
        pixelsPerSecond={100}
        onSelect={onSelect}
        onAdd={onAdd}
      />
    )
  );
  act(() => host.querySelector<HTMLButtonElement>('[data-cursor-focus-group] button')!.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  expect(options).toHaveLength(2);
  await act(async () => options[1]!.click());
  expect(onSelect).toHaveBeenCalledWith(keys[1]);
  onSelect.mockClear();
  const row = host.querySelector<HTMLButtonElement>(
    'button[title="videoEditor.sidebar.cursorFocusRowHint"]'
  )!;
  vi.spyOn(host.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 24,
    width: 400,
    height: 24,
    toJSON: () => ({}),
  });
  act(() => {
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 200 }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2, clientX: 200 }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(2);
  expect(onSelect).not.toHaveBeenCalled();
});
it('empty row supports context Add and keyboard navigation never creates captured facts', () => {
  const onAdd = vi.fn();
  const onSelect = vi.fn();
  act(() =>
    root.render(
      <CursorFocusTimelineKeys
        keys={[]}
        time={0}
        duration={4}
        pixelsPerSecond={100}
        onSelect={onSelect}
        onAdd={onAdd}
      />
    )
  );
  vi.spyOn(host.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 24,
    right: 400,
    bottom: 24,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const row = host.querySelector('button')!;
  act(() =>
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 250, clientY: 20 }))
  );
  const add = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')][0]!;
  act(() => add.click());
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(2.5);
  expect(onSelect).not.toHaveBeenCalled();
});

it('keeps context-menu focus stable when playback props rerender', () => {
  const render = (time: number) =>
    act(() =>
      root.render(
        <CursorFocusTimelineKeys
          keys={[]}
          time={time}
          duration={4}
          pixelsPerSecond={100}
          onAdd={vi.fn()}
          onSelect={vi.fn()}
        />
      )
    );
  render(0);
  act(() =>
    host
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 20 }))
  );
  const menu = document.querySelector<HTMLButtonElement>('[role="menu"] button')!;
  expect(document.activeElement).toBe(menu);
  const outside = document.createElement('button');
  document.body.append(outside);
  try {
    outside.focus();
    render(1);
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});

it.each(['command', 'escape', 'outside'] as const)(
  'dismisses context Add with correct %s focus ownership',
  (reason) => {
    const onAdd = vi.fn();
    act(() =>
      root.render(
        <CursorFocusTimelineKeys
          keys={[]}
          time={0}
          duration={4}
          pixelsPerSecond={100}
          onSelect={vi.fn()}
          onAdd={onAdd}
        />
      )
    );
    const row = host.querySelector<HTMLButtonElement>('button')!;
    row.focus();
    act(() =>
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 10 }))
    );
    const command = document.querySelector<HTMLButtonElement>('[role="menu"] button')!;
    expect(document.activeElement).toBe(command);
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      if (reason === 'command') act(() => command.click());
      else if (reason === 'escape')
        act(() =>
          command.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
        );
      else
        act(() => {
          outside.focus();
          outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(reason === 'outside' ? outside : row);
      expect(onAdd).toHaveBeenCalledTimes(reason === 'command' ? 1 : 0);
    } finally {
      outside.remove();
    }
  }
);
