// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { expect, it, vi } from 'vitest';
import { Info, Scan } from 'lucide-react';
import { ReviewTrackWorkspace, ReviewTrackWorkspaceHeading } from './track-workspace';
import { ReviewInspectorSectionNavigation } from './inspector-section-navigation';
import {
  createReviewInspectorTrackView,
  useReviewInspectorTrackNavigation,
} from './inspector-navigation';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('switches lane tabs by click and keyboard while retaining the mounted collection', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Fixture({ settings = true }: { settings?: boolean }) {
    const [view] = useState(createReviewInspectorTrackView);
    return (
      <>
        <ReviewTrackWorkspaceHeading id="lane" track="originalAudio" />
        <ReviewTrackWorkspace
          id="lane"
          track="originalAudio"
          view={view}
          list={<input aria-label="filter" defaultValue="retained" />}
          sections={
            settings
              ? [
                  {
                    id: 'audio',
                    label: 'Audio',
                    icon: Info,
                    content: <button>Global settings</button>,
                  },
                ]
              : []
          }
        />
      </>
    );
  }
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const key = async (value: string) =>
    act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true })
      );
    });
  try {
    await act(async () => root.render(<Fixture />));
    const filter = host.querySelector('input')!;
    await act(async () => tabs()[1]!.click());
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[id="lane-list"]')?.hasAttribute('hidden')).toBe(true);
    tabs()[1]!.focus();
    await key('Home');
    expect(document.activeElement).toBe(tabs()[0]);
    expect(host.querySelector('input')).toBe(filter);
    await key('ArrowRight');
    expect(document.activeElement).toBe(tabs()[1]);
    await key('ArrowLeft');
    expect(document.activeElement).toBe(tabs()[0]);
    await key('End');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    await key('Escape');
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => tabs()[0]!.click());
    expect(filter.value).toBe('retained');
    await act(async () => tabs()[1]!.click());
    await act(async () => root.render(<Fixture settings={false} />));
    expect(tabs()).toHaveLength(0);
    expect(host.querySelector('[id="lane-list"]')?.hasAttribute('hidden')).toBe(false);
    expect(host.querySelector('[id="lane-audio"]')).toBeNull();
    expect(host.querySelector('[id="lane-list"]')?.getAttribute('aria-labelledby')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('uses a plain source title and a row above the retained list and individual setting panels', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const modeChanges = vi.fn();
  function Fixture() {
    const [view] = useState(() =>
      createReviewInspectorTrackView((action) => {
        modeChanges();
        action();
      })
    );
    return (
      <>
        <ReviewTrackWorkspaceHeading id="source" track="source" />
        <ReviewTrackWorkspace
          id="source"
          track="source"
          view={view}
          list={<input aria-label="source-filter" defaultValue="retained search" />}
          sections={[
            {
              id: 'information',
              label: 'Project',
              icon: Info,
              content: <div>Source information</div>,
            },
            {
              id: 'canvas',
              label: 'Canvas',
              icon: Scan,
              content: <input aria-label="canvas-setting" />,
            },
          ]}
        />
      </>
    );
  }
  try {
    await act(async () => root.render(<Fixture />));
    expect(host.querySelector('h2')?.textContent).toBe('gallery.videoReview.sourceVideo');
    expect(host.querySelector('h2')?.closest('button')).toBeNull();
    expect(host.querySelector('h2 svg.lucide-film')).not.toBeNull();
    const footer = host.querySelector(
      '[data-ui="gallery.videoReview.inspectorSectionNavigation"]'
    )!;
    const tabs = [...footer.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-label')).toBe('gallery.videoReview.trackTab');
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    const list = host.querySelector<HTMLInputElement>('[aria-label="source-filter"]')!;
    list.value = 'changed filter';
    await act(async () => tabs[2]!.click());
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[aria-label="canvas-setting"]')).not.toBeNull();
    expect(modeChanges).toHaveBeenCalledTimes(1);
    await act(async () => tabs[1]!.click());
    expect(host.querySelector('#source-information')).not.toBeNull();
    expect(modeChanges).toHaveBeenCalledTimes(1);
    await act(async () => tabs[2]!.click());
    expect(modeChanges).toHaveBeenCalledTimes(1);
    expect(host.querySelector('#source-canvas h3')).toBeNull();
    expect(host.querySelector('#source-list')?.hasAttribute('hidden')).toBe(true);
    expect(footer.parentElement!.firstElementChild).toBe(footer);
    tabs[2]!.focus();
    await act(async () =>
      tabs[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    );
    expect(document.activeElement).toBe(tabs[0]);
    expect(host.querySelector('[aria-label="source-filter"]')).toBe(list);
    expect(list.value).toBe('changed filter');
    await act(async () =>
      tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(document.activeElement).toBe(tabs[1]);
    expect(host.querySelector('#source-information')?.textContent).toContain('Source information');
    expect(host.querySelector('#source-information')?.getAttribute('aria-labelledby')).toBe(
      tabs[1]!.id
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('restores each lane view and applies Back and Open Project intents without moving UI ownership', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let owner!: ReturnType<typeof useReviewInspectorTrackNavigation>;
  let admitted = true;
  const guard = vi.fn((action: () => void) => {
    if (admitted) action();
  });
  const section = vi.fn();
  function Fixture() {
    owner = useReviewInspectorTrackNavigation({
      navigation: { shown: 'track', setSection: section },
      selection: { kind: 'none' },
      beforeAction: guard,
      cancelAnnotation: { current: null },
      setDrawing: vi.fn(),
      setCutting: vi.fn(),
      setAudioTool: vi.fn(),
      setAudioRange: vi.fn(),
      select: vi.fn(),
    });
    return (
      <ReviewTrackWorkspace
        key={owner.track}
        id="lane"
        track={owner.track}
        view={owner.view}
        list={<input aria-label="filter" defaultValue="retained" />}
        sections={[
          { id: 'first', label: 'First', icon: Info, content: <input aria-label="first-field" /> },
          {
            id: 'second',
            label: 'Second',
            icon: Scan,
            content: <input aria-label="second-field" />,
          },
        ]}
      />
    );
  }
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  try {
    await act(async () => root.render(<Fixture />));
    const list = host.querySelector('input')!;
    list.value = 'kept filter';
    await act(async () => tabs()[2]!.click());
    expect(host.querySelector('[aria-label="filter"]')).toBe(list);
    expect(list.value).toBe('kept filter');
    const requests = guard.mock.calls.length;
    await act(async () => tabs()[2]!.click());
    expect(guard).toHaveBeenCalledTimes(requests);
    await act(async () => owner.openTrack('music'));
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => tabs()[1]!.click());
    await act(async () => owner.openTrack('source'));
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    await act(async () => owner.back());
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(section).toHaveBeenLastCalledWith('track');
    await act(async () => owner.openProject());
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
    admitted = false;
    await act(async () => tabs()[0]!.click());
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps tab commands free of geometry reads while preserving interrupted motion and resized positions', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let command = false,
    origin = 100,
    scale = 1,
    reduced = false;
  const reads: string[] = [],
    resize: ResizeObserverCallback[] = [],
    progressReads: number[] = [];
  const moves: {
    node: HTMLElement;
    delta: number;
    progress: number;
    cancelled: boolean;
    options: KeyframeAnimationOptions;
  }[] = [];
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize.push(callback);
      }
      observe() {}
      disconnect() {}
    }
  );
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const transform = frames[0]?.['transform'];
      const move = {
        node: this,
        delta:
          typeof transform === 'string'
            ? Number.parseFloat(transform.replace('translateX(', ''))
            : NaN,
        progress: 0,
        cancelled: false,
        options,
      };
      moves.push(move);
      return {
        cancel: () => {
          move.cancelled = true;
        },
        effect: {
          getComputedTiming: () => {
            progressReads.push(move.progress);
            return { progress: move.progress };
          },
        },
      } as unknown as Animation;
    },
  });
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const id = this.dataset['inspectorTabMotion'];
      if (!id) return new DOMRect(this.getAttribute('role') === 'tablist' ? origin : 0, 0, 28, 32);
      if (command) reads.push(id);
      const active = host.querySelector<HTMLElement>(
        '[data-inspector-tab-motion][data-active="true"]'
      )?.dataset['inspectorTabMotion'];
      const base =
        id === 'first'
          ? 0
          : id === 'second'
            ? active === 'first'
              ? 100
              : 30
            : active === 'first'
              ? 130
              : 60;
      const move = [...moves].reverse().find((move) => move.node === this && !move.cancelled);
      return new DOMRect(
        origin + base * scale + (move ? move.delta * (1 - move.progress) : 0),
        0,
        28,
        32
      );
    });
  function Fixture({ many = false }: { many?: boolean }) {
    const [value, setValue] = useState('first');
    return (
      <ReviewInspectorSectionNavigation
        id="motion"
        value={value}
        onChange={(next) => {
          command = false;
          setValue(next);
        }}
        items={[
          { id: 'first', label: 'First', icon: Info },
          { id: 'second', label: 'Second', icon: Info },
          { id: 'third', label: 'Third', icon: Info },
          ...(many
            ? Array.from({ length: 6 }, (_, index) => ({
                id: `extra${index}`,
                label: `Extra ${index}`,
                icon: Info,
              }))
            : []),
        ]}
      />
    );
  }
  const clickThird = () => {
    command = true;
    act(() => host.querySelector<HTMLButtonElement>('#motion-third-tab')!.click());
  };
  const key = (key: string) => {
    command = true;
    act(() =>
      host
        .querySelector('[role="tablist"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    );
  };
  try {
    act(() => root.render(<Fixture />));
    clickThird();
    expect(reads).toEqual([]);
    const first = moves.at(-1)!;
    expect(first.node.dataset['inspectorTabMotion']).toBe('second');
    expect(first.delta).toBe(70);
    expect(first.options).toEqual({ duration: 100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    first.progress = 0.4;
    key('Home');
    expect(reads).toEqual([]);
    expect(first.cancelled).toBe(true);
    const interrupted = [...moves].reverse().find((move) => move.node === first.node)!;
    expect(progressReads).toContain(0.4);
    expect(interrupted.delta).toBeCloseTo(-28, 6);
    interrupted.progress = 0.5;
    scale = 0.5;
    origin = 400;
    act(() => resize.forEach((callback) => callback([], {} as ResizeObserver)));
    clickThird();
    expect(reads).toEqual([]);
    expect(interrupted.cancelled).toBe(true);
    expect(moves.at(-1)!.delta).toBeCloseTo(21, 6);
    act(() => root.render(null));
    expect(moves.every((move) => move.cancelled)).toBe(true);
    reduced = true;
    act(() => root.render(<Fixture />));
    const count = moves.length;
    clickThird();
    expect(moves).toHaveLength(count);
    reduced = false;
    act(() => root.render(<Fixture many />));
    key('End');
    expect(reads).toEqual([]);
    expect(moves).toHaveLength(count);
    expect(host.querySelector('#motion-extra5-tab')?.getAttribute('aria-selected')).toBe('true');
  } finally {
    act(() => root.unmount());
    host.remove();
    context.mockRestore();
    rect.mockRestore();
    if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    vi.unstubAllGlobals();
  }
});

it('focuses keyboard tabs after accepted value commit and keeps same-value and refused requests bounded', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  let handling = false;
  const focused: {
    id: string;
    handling: boolean;
    selected: string | null;
    options: FocusOptions | undefined;
  }[] = [];
  const nativeFocus = HTMLElement.prototype.focus;
  const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions
  ) {
    if (this.getAttribute('role') === 'tab')
      focused.push({
        id: this.id,
        handling,
        selected: this.getAttribute('aria-selected'),
        options,
      });
    nativeFocus.call(this, options);
  });
  function Fixture({
    allowed = true,
    synchronous = false,
    many = false,
  }: {
    allowed?: boolean;
    synchronous?: boolean;
    many?: boolean;
  }) {
    const [value, setValue] = useState('first');
    return (
      <>
        <ReviewInspectorSectionNavigation
          id="focus"
          value={value}
          onChange={(next) => {
            if (!allowed) return;
            if (synchronous) flushSync(() => setValue(next));
            else setValue(next);
          }}
          items={[
            { id: 'first', label: 'First', icon: Info },
            { id: 'second', label: 'Second', icon: Info },
            { id: 'third', label: 'Third', icon: Info },
            ...(many
              ? Array.from({ length: 6 }, (_, index) => ({
                  id: `extra${index}`,
                  label: `Extra ${index}`,
                  icon: Info,
                }))
              : []),
          ]}
        />
        <button data-outside>Outside</button>
      </>
    );
  }
  const key = (value: string) =>
    act(() => {
      handling = true;
      host
        .querySelector('[role="tablist"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
      handling = false;
    });
  const current = () =>
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
  try {
    act(() => root.render(<Fixture />));
    key('ArrowRight');
    expect(focused).toEqual([
      {
        id: 'focus-second-tab',
        handling: false,
        selected: 'true',
        options: { preventScroll: true },
      },
    ]);
    expect(document.activeElement).toBe(current());
    key('Home');
    const first = current();
    const count = focused.length;
    key('Home');
    expect(focused).toHaveLength(count);
    act(() => host.querySelector<HTMLButtonElement>('[data-outside]')!.focus());
    key('Home');
    expect(document.activeElement).toBe(first);
    expect(focused.at(-1)).toEqual({
      id: 'focus-first-tab',
      handling: false,
      selected: 'true',
      options: { preventScroll: true },
    });
    act(() => root.render(<Fixture allowed={false} />));
    const accepted = focused.length;
    key('End');
    expect(document.activeElement).toBe(first);
    expect(focused).toHaveLength(accepted);
    act(() => root.render(<Fixture />));
    expect(focused).toHaveLength(accepted);
    key('ArrowLeft');
    expect(current().id).toBe('focus-third-tab');
    expect(document.activeElement).toBe(current());
    act(() => root.render(<Fixture synchronous />));
    key('Home');
    expect(document.activeElement).toBe(current());
    expect(focused.at(-1)?.selected).toBe('true');
    expect(focused.at(-1)?.options).toEqual({ preventScroll: true });
    act(() => root.render(<Fixture many />));
    key('End');
    expect(document.activeElement?.id).toBe('focus-extra5-tab');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    key('Home');
    expect(document.activeElement?.id).toBe('focus-first-tab');
  } finally {
    act(() => root.unmount());
    host.remove();
    context.mockRestore();
    focus.mockRestore();
    vi.unstubAllGlobals();
  }
});
