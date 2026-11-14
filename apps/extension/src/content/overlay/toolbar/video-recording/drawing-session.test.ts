import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrawingCleanup } from '../../../../features/drawing/public';
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
  it.each(['rectangle', 'ellipse'] as const)(
    'keeps a new %s unselected until the cursor selects it',
    (kind) => {
      const owner = createRecordingDrawingOwner();
      const session = owner.controller.session;
      session.setActiveTool('shape');
      const object = {
        id: 'shape',
        kind,
        bounds: { x: 10, y: 20, width: 100, height: 80 },
        color: '#ff0000',
        width: 4,
      };
      session.commitObject(object, { select: true });
      expect(session.getSnapshot()).toMatchObject({
        activeTool: 'shape',
        selectedObjectIds: [],
        document: { objects: [object] },
      });
      session.setActiveTool('select');
      session.select(object.id);
      session.replaceObject({ ...object, bounds: { ...object.bounds, x: 40, width: 120 } });
      expect(session.getSnapshot().selectedObjectIds).toEqual([object.id]);
      session.setActiveTool('shape');
      expect(session.getSnapshot().selectedObjectIds).toEqual([]);
      owner.dispose();
    }
  );

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

it.each([false, true])(
  'retains accepted Blur without acquiring exposed pixels in recording mode; clock=%s',
  async (running) => {
    const acquire = vi.fn(async () => {
      throw new Error('native capture must not start');
    });
    const owner = createRecordingDrawingOwner({
      simplifyDependencies: {
        acquire,
        decode: vi.fn(async () => undefined),
        send: vi.fn(async () => undefined),
      },
    });
    owner.setClockRunning(running);
    const blur = {
      id: 'private',
      kind: 'blur' as const,
      amount: 6,
      bounds: { x: 10, y: 20, width: 80, height: 60 },
    };
    owner.controller.session.commitObject(blur);
    owner.controller.session.setActiveTool('select');
    owner.controller.session.select(blur.id);
    await owner.controller.simplify!.submit(createDrawingCleanup(blur), new Event('pointerup'));
    expect(acquire).not.toHaveBeenCalled();
    expect(owner.controller.session.getSnapshot().document.objects).toEqual([blur]);
    expect(owner.controller.simplify!.getFeedback()).toBe('no-source');
    expect(owner.controller.simplify!.getPending()).toEqual([]);
    owner.dispose();
  }
);

it('does not restart recording expiry when a pending font updates text geometry', async () => {
  vi.useFakeTimers();
  let ready = false;
  let finish!: (faces: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal('document', {
    fonts: { check: () => ready, load: () => pending },
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (value: string) => ({ width: value.length * 10 }),
      }),
    }),
  });
  const owner = createRecordingDrawingOwner({ initialAutoHideDelay: 3 });
  try {
    owner.setClockRunning(true);
    owner.controller.session.commitObject({
      id: 'late-text',
      kind: 'text',
      text: 'Text',
      fontSize: 24,
      color: '#111111',
      backgroundColor: null,
      autoWidth: true,
      wrapWidth: 300,
      bounds: { x: 10, y: 20, width: 200, height: 90 },
    });
    vi.advanceTimersByTime(1000);
    ready = true;
    finish([{}]);
    await pending;
    await Promise.resolve();
    expect(owner.controller.session.getSnapshot().document.objects).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(owner.controller.session.getSnapshot().document.objects).toEqual([]);
  } finally {
    owner.dispose();
    vi.unstubAllGlobals();
  }
});
