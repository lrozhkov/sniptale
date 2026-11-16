// @vitest-environment jsdom
import { act, useState } from 'react';
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
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
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
        <ReviewCursorMotionInspector editor={editor} busy={false} />
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
    click('cursorShapePointer');
    expect(editor.selected!.shape).toBe('pointer');
    click('cursorMotionDeletePoint');
    expect(editor.selected!.points).toHaveLength(2);
    click('cursorMotionStart');
    click('cursorMotionEnd');
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
