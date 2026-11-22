// @vitest-environment jsdom
import { act, startTransition, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { ReviewSelection } from '../../features/video/review/types';
import {
  useReviewCursorMotions,
  ReviewCursorMotionInspector,
  ReviewCursorMotionTrack,
  ReviewCursorMotionAdd,
} from './cursor-motion-editor';
import { createTrackProjection } from './track-projection';
import { translate } from '../../platform/i18n';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import { createReviewCommandFixture } from './editor-fixture.test-support';
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));
vi.mock('../../features/video/project/cursor-motion/paint', () => ({
  appleCursorDataUrl: () => 'data:image/png;base64,cursor',
}));

it('authors cursor intervals and points; edits, copies and toggles without accepting overlaps', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor!: ReturnType<typeof useReviewCursorMotions>;
  let content!: QuickEditAdvancedState;
  let setTime!: (value: number) => void;
  const select = vi.fn(),
    message = vi.fn(),
    enabled = vi.fn();
  let admitted = true;
  function Editor() {
    const [advanced, change] = useState(createQuickEditAdvancedState);
    const [selection, selectionChange] = useState<ReviewSelection>({ kind: 'none' });
    const [time, seek] = useState(0);
    content = advanced;
    setTime = seek;
    editor = useReviewCursorMotions({
      commands: createReviewCommandFixture(() => ({
        duration: 12,
        time,
        resultTime: time,
        advanced,
        selection,
      })),
      advanced,
      time,
      duration: 12,
      selection,
      onChange: (cursorMotions) => change((old) => ({ ...old, cursorMotions })),
      onEnabledChange: (cursorMotionEnabled) => {
        enabled(cursorMotionEnabled);
        change((old) => ({ ...old, cursorMotionEnabled }));
      },
      select: (value) => {
        select(value);
        selectionChange(value);
      },
      seek,
      canStart: () => admitted,
      setMessage: message,
    });
    return (
      <>
        <ReviewCursorMotionAdd editor={editor} busy={false} />
        <ReviewCursorMotionTrack
          editor={editor}
          busy={false}
          projection={createTrackProjection(12, [
            { id: 'cut', kind: 'cut', start: 5, end: 6, requestedStart: 5, requestedEnd: 6 },
          ])}
        />
        <InspectorLayout>
          <ReviewCursorMotionInspector editor={editor} busy={false} />
        </InspectorLayout>
      </>
    );
  }
  const click = (key: string) =>
    act(() => {
      const button = host.querySelector<HTMLButtonElement>(
        `[aria-label="gallery.videoReview.${key}"]`
      )!;
      expect(button).not.toBeNull();
      button.click();
    });
  try {
    act(() => root.render(<Editor />));
    expect(editor.selected).toBeUndefined();
    admitted = false;
    act(() => editor.add());
    expect(content.cursorMotions).toBeUndefined();
    admitted = true;
    click('cursorMotionAdd');
    expect(editor.selected?.points).toHaveLength(2);
    const id = editor.selected!.id;
    expect(editor.overlay?.path.segments[0]?.start).toBe(0);
    act(() => setTime(1));
    click('cursorMotionPoints');
    expect(host.querySelectorAll('.review-cursor-point-row')).toHaveLength(2);
    expect(host.querySelector('[aria-label="gallery.videoReview.cursorMotionStart"]')).toBeNull();
    click('cursorMotionAddPoint');
    expect(editor.selected?.points).toHaveLength(3);
    const key = editor.pointId!;
    act(() => editor.addPoint());
    expect(editor.selected?.points).toHaveLength(3);
    const path = editor.overlay!.path;
    const moved = {
      ...path,
      segments: path.segments.map((s) => ({
        ...s,
        keys: s.keys.map((k) => ({ ...k, x: 0.8, y: 0.2 })),
      })),
    };
    act(() => editor.overlay!.onChange(moved));
    expect(editor.selected!.points.every((p) => p.x === 0.8)).toBe(true);
    act(() => editor.overlay!.onChange({ ...path, segments: [] }));
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="videoEditor.effectsLibrary.objectAppearance"]'
        )!
        .click()
    );
    click('cursorShapePointer');
    click('cursorMotionPoints');
    expect(editor.selected!.shape).toBe('pointer');
    click('cursorMotionDeletePoint');
    expect(editor.selected!.points).toHaveLength(2);
    expect(host.querySelectorAll('.review-cursor-point-row')).toHaveLength(2);
    act(() => host.querySelectorAll<HTMLButtonElement>('.review-cursor-point-row')[0]!.click());
    expect(editor.time).toBe(0);
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.cursorMotionDeletePoint"]'
      )!.disabled
    ).toBe(true);
    act(() => host.querySelectorAll<HTMLButtonElement>('.review-cursor-point-row')[1]!.click());
    expect(editor.time).toBeLessThan(3);
    act(() => editor.choose(id));
    act(() => editor.choose('missing'));
    act(() => editor.pickPoint(key, 20));
    expect(editor.time).toBeLessThan(3);
    click('cursorMotionEnabled');
    expect(editor.enabled).toBe(false);
    click('cursorMotionEnabled');
    expect(editor.enabled).toBe(true);
    expect(enabled.mock.calls).toEqual([[false], [true]]);
    act(() => editor.copy('missing'));
    act(() => editor.copy(id));
    expect(editor.motions).toHaveLength(2);
    const copyId = editor.selected!.id;
    act(() => editor.move(copyId, 1, 4));
    expect(editor.selected!.start).toBe(3);
    act(() => editor.move(copyId, -1, 2));
    act(() => editor.move(copyId, 10, 13));
    act(() => editor.move(copyId, 4, 4.01));
    act(() => editor.move(copyId, 6, 9));
    expect(editor.selected!.start).toBe(6);
    act(() => setTime(0));
    act(() => editor.add());
    expect(editor.selected!.start).toBe(6);
    expect(message).toHaveBeenCalledWith('gallery.videoReview.cursorMotionNoSpace');
    act(() => setTime(3));
    act(() => editor.add());
    expect(editor.selected!.start).toBe(3);
    act(() => setTime(11.99));
    act(() => editor.add());
    expect(message).toHaveBeenCalledWith('gallery.videoReview.cursorMotionNoSpace');
    act(() => editor.copy(id));
    expect(editor.motions).toHaveLength(4);
    act(() => editor.copy(id));
    expect(message).toHaveBeenCalled();
    const count = editor.motions.length;
    click('deleteSelected');
    expect(editor.motions).toHaveLength(count - 1);
    expect(editor.selected).toBeUndefined();
    act(() => editor.addPoint());
    expect(select).toHaveBeenCalledWith({ kind: 'none' });

    act(() => editor.choose(id));
    act(() => setTime((editor.selected!.start + editor.selected!.end) / 2));
    act(() => editor.addPoint());
    const pill = host.querySelector<HTMLElement>(
      `[data-review-removal-key="cursor-motion:${id}"]`
    )!;
    Object.assign(pill, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    vi.spyOn(pill.parentElement!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 1200, 40)
    );
    const pointer = (node: Element, type: string, x: number, button = 0, altKey = true) =>
      act(() => {
        const event = new MouseEvent(type, { bubbles: true, button, clientX: x, altKey });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        node.dispatchEvent(event);
      });
    pointer(pill, 'pointermove', 20);
    pointer(pill, 'pointerdown', 0, 2);
    for (const edge of ['start', 'end'] as const) {
      pointer(pill.querySelector(`[data-motion-edge="${edge}"]`)!, 'pointerdown', 0);
      pointer(pill, 'pointermove', edge === 'start' ? 10 : -10, 0, false);
      pointer(pill, 'pointerup', 0);
    }
    const middle = pill.querySelector('[data-motion-point]')!;
    pointer(middle, 'pointerdown', 0);
    pointer(pill, 'pointermove', 10);
    pointer(pill, 'pointerup', 0);
    expect(editor.selected!.points[1]!.at).toBeGreaterThan(0.5);
    pointer(pill, 'pointerdown', 0);
    pointer(pill, 'pointermove', 10);
    pointer(pill, 'pointercancel', 10);
    pointer(pill, 'pointerdown', 0);
    pointer(pill, 'pointermove', -100);
    pointer(pill, 'pointerup', -100);
    expect(editor.selected!.start).toBeGreaterThanOrEqual(0);
    act(() => pill.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
    await act(async () => pill.click());
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('uses the accepted temporal projection when a retained add callback outlives a map edit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const advanced = createQuickEditAdvancedState();
  advanced.cursorMotions = [
    {
      id: 'recorded',
      start: 3,
      end: 5,
      enabled: true,
      shape: 'arrow',
      size: 1,
      color: '#ffffff',
      outline: '#000000',
      shadow: false,
      easing: 'linear',
      points: [{ id: 'p', at: 0, x: 0.5, y: 0.5 }],
    },
  ];
  let edits: import('../../features/video/review/types').ReviewEdit[] = [];
  let resultTime = 7;
  const onChange = vi.fn();
  const setMessage = vi.fn();
  let retained!: ReturnType<typeof useReviewCursorMotions>['add'];
  const commands = createReviewCommandFixture(() => ({
    duration: 12,
    time: 4,
    resultTime,
    advanced,
    document: { annotations: [], canvasComments: [], edits, advancedContent: advanced },
  }));
  function Probe() {
    retained = useReviewCursorMotions({
      commands,
      advanced,
      time: 0,
      duration: 12,
      selection: { kind: 'none' },
      onChange,
      onEnabledChange: vi.fn(),
      select: vi.fn(),
      seek: vi.fn(),
      canStart: () => true,
      setMessage,
    }).add;
    return null;
  }
  try {
    act(() => root.render(<Probe />));
    edits = [
      {
        id: 'hold',
        kind: 'freeze',
        start: 1,
        end: 1,
        requestedStart: 1,
        requestedEnd: 1,
        duration: 3,
        frameTime: 0.98,
        frameDuration: 0.04,
      },
    ];
    resultTime = 7;
    act(() => retained());
    expect(onChange).not.toHaveBeenCalled();
    expect(setMessage).toHaveBeenCalledWith('gallery.videoReview.cursorMotionNoSpace');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('skips the cursor lane body for fresh controller callbacks and unrelated live time', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const motion = {
    id: 'motion',
    start: 1,
    end: 3,
    enabled: true,
    shape: 'arrow' as const,
    size: 48,
    color: '#000000',
    outline: '#ffffff',
    shadow: true,
    easing: 'smooth' as const,
    points: [{ id: 'first', at: 0, x: 0.5, y: 0.5 }],
  };
  const visualRead = vi.mocked(translate);
  const motions = [motion];
  const projection = createTrackProjection(12, []);
  const latest = vi.fn();
  const initial = vi.fn();
  const abandoned = vi.fn();
  const never = new Promise<void>(() => {});
  function Suspend(): never {
    throw never;
  }
  function Probe({
    time,
    choose,
    suspended = false,
    busy = false,
    selected = false,
    data = motions,
  }: {
    time: number;
    choose: (selection: ReviewSelection) => void;
    suspended?: boolean;
    busy?: boolean;
    selected?: boolean;
    data?: typeof motions;
  }) {
    const editor = useReviewCursorMotions({
      commands: createReviewCommandFixture(() => ({ duration: 12, time })),
      advanced: { ...createQuickEditAdvancedState(), cursorMotions: data },
      time,
      duration: 12,
      selection: selected ? { kind: 'cursor-motion', id: 'motion' } : { kind: 'none' },
      onChange: vi.fn(),
      onEnabledChange: vi.fn(),
      select: choose,
      seek: vi.fn(),
      canStart: () => true,
      setMessage: vi.fn(),
    });
    return (
      <>
        <ReviewCursorMotionTrack editor={editor} busy={busy} projection={projection} />
        {suspended && <Suspend />}
      </>
    );
  }
  try {
    act(() =>
      root.render(
        <Suspense fallback={null}>
          <Probe time={0} choose={initial} />
        </Suspense>
      )
    );
    visualRead.mockClear();
    act(() =>
      root.render(
        <Suspense fallback={null}>
          <Probe time={5} choose={latest} />
        </Suspense>
      )
    );
    expect(visualRead).not.toHaveBeenCalled();
    act(() =>
      host.querySelector<HTMLElement>('[data-review-removal-key="cursor-motion:motion"]')!.click()
    );
    expect(latest).toHaveBeenCalledWith({ kind: 'cursor-motion', id: 'motion' });
    expect(initial).not.toHaveBeenCalled();
    act(() =>
      startTransition(() =>
        root.render(
          <Suspense fallback={null}>
            <Probe time={8} choose={abandoned} suspended />
          </Suspense>
        )
      )
    );
    act(() =>
      host.querySelector<HTMLElement>('[data-review-removal-key="cursor-motion:motion"]')!.click()
    );
    expect(latest).toHaveBeenCalledTimes(2);
    expect(abandoned).not.toHaveBeenCalled();
    act(() =>
      root.render(
        <Suspense fallback={null}>
          <Probe time={5} choose={latest} busy selected data={[{ ...motion, start: 2 }]} />
        </Suspense>
      )
    );
    expect(
      host
        .querySelector('[data-review-removal-key="cursor-motion:motion"]')!
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="gallery.videoReview.cursorMotionEnabled"]'
      )!.disabled
    ).toBe(true);
    expect(
      host.querySelector<HTMLElement>('[data-review-removal-key="cursor-motion:motion"]')!.style
        .left
    ).toBe(`${(2 / 12) * 100}%`);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
