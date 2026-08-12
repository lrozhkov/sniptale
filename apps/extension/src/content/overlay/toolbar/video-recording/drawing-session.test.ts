import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecordingDrawingOwner } from './drawing-session';

function commitBox(owner: ReturnType<typeof createRecordingDrawingOwner>, id: string, x = 0) {
  owner.controller.session.commitObject({
    id,
    kind: 'blur',
    bounds: { x, y: 0, width: 10, height: 10 },
  });
}

afterEach(() => vi.useRealTimers());

describe('recording drawing owner', () => {
  it('counts auto-hide in recording time and freezes the remaining duration while paused', () => {
    vi.useFakeTimers();
    const owner = createRecordingDrawingOwner({ initialAutoHideDelay: 3 });
    commitBox(owner, 'box');

    vi.advanceTimersByTime(10_000);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(1);
    owner.setClockRunning(true);
    vi.advanceTimersByTime(2_000);
    owner.setClockRunning(false);
    vi.advanceTimersByTime(10_000);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(1);
    owner.setClockRunning(true);
    vi.advanceTimersByTime(999);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(0);
    owner.dispose();
  });

  it('captures the delay per completed or modified object without rescheduling older objects', () => {
    vi.useFakeTimers();
    const owner = createRecordingDrawingOwner({ initialAutoHideDelay: 3 });
    owner.setClockRunning(true);
    commitBox(owner, 'old');
    owner.setAutoHideDelay(5);
    commitBox(owner, 'new', 20);

    vi.advanceTimersByTime(3_000);
    expect(owner.controller.session.getSnapshot().document.objects.map(({ id }) => id)).toEqual([
      'new',
    ]);
    vi.advanceTimersByTime(1_000);
    owner.controller.session.replaceObject({
      id: 'new',
      kind: 'blur',
      bounds: { x: 30, y: 0, width: 10, height: 10 },
    });
    vi.advanceTimersByTime(1_000);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(1);
    vi.advanceTimersByTime(4_000);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(0);
    owner.dispose();
  });

  it('animates opacity over the final 300ms and freezes the fade while paused', () => {
    vi.useFakeTimers();
    const owner = createRecordingDrawingOwner({ initialAutoHideDelay: 3 });
    const visualChange = vi.fn();
    owner.subscribeVisualChanges(visualChange);
    owner.setClockRunning(true);
    commitBox(owner, 'box');

    vi.advanceTimersByTime(2_850);
    expect(owner.getVisualOpacity('box')).toBeCloseTo(0.5, 1);
    expect(visualChange).toHaveBeenCalled();
    owner.setClockRunning(false);
    const pausedOpacity = owner.getVisualOpacity('box');
    vi.advanceTimersByTime(1_000);
    expect(owner.getVisualOpacity('box')).toBe(pausedOpacity);
    owner.setClockRunning(true);
    vi.advanceTimersByTime(150);
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(0);
    owner.dispose();
  });

  it('erases every object touched by one sparse path in a single document commit', () => {
    const owner = createRecordingDrawingOwner();
    commitBox(owner, 'one', 10);
    commitBox(owner, 'two', 40);
    commitBox(owner, 'miss', 100);
    const listener = vi.fn();
    owner.controller.session.subscribe(listener);

    owner.erasePath([
      { x: 0, y: 5 },
      { x: 60, y: 5 },
    ]);

    expect(listener).toHaveBeenCalledOnce();
    expect(owner.controller.session.getSnapshot().document.objects.map(({ id }) => id)).toEqual([
      'miss',
    ]);
    owner.dispose();
  });
});
