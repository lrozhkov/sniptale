// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { GpuPreviewRenderer } from './gpu-preview';
import { createPreviewPresentationSession } from './preview-presentation';

const sessions: ReturnType<typeof createPreviewPresentationSession>[] = [];
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(role?: 'stage' | 'inspector', background?: 'black' | 'transparent') {
  const host = document.createElement('div'),
    fallback = document.createElement('canvas');
  fallback.width = 64;
  fallback.height = 36;
  host.appendChild(fallback);
  document.body.appendChild(host);
  const disposed: HTMLCanvasElement[] = [];
  const releasedImages: { canvas: HTMLCanvasElement; visible: boolean }[] = [];
  const renderer = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present: vi.fn(async () => {}),
      releaseImage: vi.fn(() => {
        releasedImages.push({ canvas, visible: canvas.style.opacity === '1' });
      }),
      dispose: vi.fn(() => {
        disposed.push(canvas);
      }),
    })),
  } satisfies GpuPreviewRenderer;
  const session = createPreviewPresentationSession({
    fallback: () => fallback,
    host: () => host,
    ...(role ? { role } : {}),
    ...(background ? { background } : {}),
  });
  sessions.push(session);
  return { host, fallback, renderer, session, disposed, releasedImages };
}
const size = { width: 64, height: 36 };
it('has no factory DOM effects and marks only the borrowed fallback on mount without frame events', () => {
  const f = fixture(),
    event = vi.fn();
  f.host.addEventListener('sniptale-preview-frame', event);
  expect(f.fallback.hasAttribute('data-preview-stage-canvas')).toBe(false);
  f.session.mount();
  f.session.mount();
  expect(f.host.querySelectorAll('[data-preview-stage-canvas]')).toHaveLength(1);
  expect(f.fallback.hasAttribute('data-preview-stage-canvas')).toBe(true);
  expect(event).not.toHaveBeenCalled();
});
it('attaches hidden black destinations before GPU binding and refuses a third exclusive target', () => {
  const f = fixture();
  f.session.mount();
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  f.renderer.createSurface.mockImplementation((canvas) => {
    expect(canvas.parentElement).toBe(f.host);
    expect(canvas.style.opacity).toBe('0');
    expect(canvas.style.backgroundColor).toBe('rgb(0, 0, 0)');
    return { canvas, present: vi.fn(async () => {}), dispose: vi.fn() };
  });
  const a = f.session.acquire(size, f.renderer),
    b = f.session.acquire(size, f.renderer);
  expect(a.canvas).not.toBe(b.canvas);
  expect(f.renderer.createSurface).toHaveBeenCalledTimes(2);
  expect(getContext).not.toHaveBeenCalled();
  expect(() => f.session.acquire(size, f.renderer)).toThrow();
  a.release();
  b.release();
});
it('reuses warmed attached canvases without reparenting or resetting their backing', () => {
  const f = fixture();
  f.session.mount();
  const append = vi.spyOn(f.host, 'appendChild');
  const a = f.session.acquire(size, f.renderer);
  f.session.publish(a, () => {});
  const b = f.session.acquire(size, f.renderer);
  f.session.publish(b, () => {});
  const width = vi.spyOn(a.canvas, 'width', 'set'),
    height = vi.spyOn(a.canvas, 'height', 'set');
  const again = f.session.acquire(size, f.renderer);
  expect(again.canvas).toBe(a.canvas);
  expect(again.surface).toBe(a.surface);
  expect(append).toHaveBeenCalledTimes(2);
  expect(f.renderer.createSurface).toHaveBeenCalledTimes(2);
  expect(width).not.toHaveBeenCalled();
  expect(height).not.toHaveBeenCalled();
  again.release();
});
it('commits marker and geometry before releasing the previous front and dispatching one event', () => {
  const f = fixture(),
    order: string[] = [];
  f.session.mount();
  f.host.addEventListener('sniptale-preview-frame', () => order.push('event'));
  const a = f.session.acquire(size, f.renderer),
    releaseA = vi.fn(() => {
      order.push('releaseA');
      a.release();
    });
  const first = { canvas: a.canvas, release: releaseA };
  f.session.publish(first, () => order.push('geometryA'));
  order.length = 0;
  const b = f.session.acquire(size, f.renderer),
    releaseB = vi.fn(() => {
      order.push('releaseB');
      b.release();
    });
  f.session.publish({ canvas: b.canvas, release: releaseB }, () => {
    expect(b.canvas.hasAttribute('data-preview-stage-canvas')).toBe(true);
    expect(a.canvas.hasAttribute('data-preview-stage-canvas')).toBe(false);
    expect(releaseA).not.toHaveBeenCalled();
    order.push('geometryB');
  });
  expect(order).toEqual(['geometryB', 'releaseA', 'event']);
  order.length = 0;
  f.session.publish(null, () => order.push('geometryCPU'));
  expect(order).toEqual(['geometryCPU', 'releaseB', 'event']);
  expect(f.fallback.hasAttribute('data-preview-stage-canvas')).toBe(true);
  expect(f.host.querySelectorAll('[data-preview-stage-canvas]')).toHaveLength(1);
  expect(f.fallback.width).toBe(64);
});
it('does not release an identical republished front', () => {
  const f = fixture();
  f.session.mount();
  const a = f.session.acquire(size, f.renderer),
    release = vi.fn(() => a.release());
  const output = { canvas: a.canvas, release };
  f.session.publish(output, () => {});
  f.session.publish(output, () => {});
  expect(release).not.toHaveBeenCalled();
  f.session.publish(null, () => {});
  expect(release).toHaveBeenCalledTimes(1);
});
it('rolls failed geometry back to the valid front and leaves incoming ownership with its caller', () => {
  const f = fixture(),
    event = vi.fn();
  f.session.mount();
  f.host.addEventListener('sniptale-preview-frame', event);
  const a = f.session.acquire(size, f.renderer),
    releaseA = vi.fn(() => a.release());
  f.session.publish({ canvas: a.canvas, release: releaseA }, () => {});
  event.mockClear();
  const b = f.session.acquire(size, f.renderer),
    releaseB = vi.fn(() => b.release());
  expect(() =>
    f.session.publish({ canvas: b.canvas, release: releaseB }, () => {
      throw new Error('geometry');
    })
  ).toThrow('geometry');
  expect(a.canvas.hasAttribute('data-preview-stage-canvas')).toBe(true);
  expect(a.canvas.style.opacity).toBe('1');
  expect(b.canvas.style.opacity).toBe('0');
  expect(releaseA).not.toHaveBeenCalled();
  expect(releaseB).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
  releaseB();
});
it('retires idle resized or old-backend slots and retains the active front', () => {
  const f = fixture();
  f.session.mount();
  const front = f.session.acquire(size, f.renderer);
  f.session.publish(front, () => {});
  const idle = f.session.acquire(size, f.renderer);
  idle.release();
  const resized = f.session.acquire({ width: 32, height: 18 }, f.renderer);
  expect(f.disposed).toEqual([idle.canvas]);
  expect(idle.canvas.isConnected).toBe(false);
  expect(front.canvas.width).toBe(64);
  resized.release();
  const next = { ...f.renderer, createSurface: vi.fn(f.renderer.createSurface) };
  const other = f.session.acquire(size, next);
  expect(resized.canvas.isConnected).toBe(false);
  expect(front.canvas.width).toBe(64);
  other.release();
});
it.each(['stage', 'inspector'] as const)(
  'defers pending exclusive retirement until producer fence release for role %s',
  async (role) => {
    const f = fixture(role);
    f.session.mount();
    const front = f.session.acquire(size, f.renderer);
    f.session.publish(front, () => {});
    const pending = f.session.acquire(size, f.renderer);
    let settle!: () => void;
    const fence = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const work = fence.then(() => pending.release());
    f.session.dispose();
    f.session.dispose();
    expect(front.canvas.isConnected).toBe(false);
    expect(pending.canvas.width).toBe(64);
    expect(pending.canvas.isConnected).toBe(true);
    expect(pending.canvas.style.opacity).toBe('0');
    expect(f.fallback.width).toBe(64);
    expect(() => f.session.acquire(size, f.renderer)).toThrow();
    settle();
    await work;
    pending.release();
    expect(pending.canvas.width).toBe(64);
    expect(pending.canvas.isConnected).toBe(false);
    expect(f.disposed.filter((canvas) => canvas === pending.canvas)).toHaveLength(1);
  }
);
it('rejects unowned or released outputs and rolls binding failure back completely', () => {
  const f = fixture();
  f.session.mount();
  expect(() =>
    f.session.publish({ canvas: document.createElement('canvas'), release() {} }, () => {})
  ).toThrow();
  const released = f.session.acquire(size, f.renderer);
  released.release();
  expect(() => f.session.publish(released, () => {})).toThrow();
  f.renderer.createSurface.mockImplementationOnce(() => {
    throw new Error('binding');
  });
  expect(() => f.session.acquire({ width: 32, height: 18 }, f.renderer)).toThrow('binding');
  expect(f.host.querySelectorAll('canvas')).toHaveLength(1);
});
it('disposes destination context before detaching its transferred placeholder', () => {
  const f = fixture();
  f.session.mount();
  f.renderer.createSurface.mockImplementation((canvas) => ({
    canvas,
    present: vi.fn(async () => {}),
    dispose: vi.fn(() => {
      expect(canvas.width).toBe(64);
      expect(canvas.height).toBe(36);
      expect(canvas.parentElement).toBe(f.host);
    }),
  }));
  const lease = f.session.acquire(size, f.renderer);
  lease.release();
  f.session.dispose();
  expect(lease.canvas.width).toBe(64);
  expect(lease.canvas.isConnected).toBe(false);
  expect(f.fallback.width).toBe(64);
});
it('allows a fresh mounted owner after cleanup without reviving the disposed session', () => {
  const f = fixture();
  f.session.mount();
  const lease = f.session.acquire(size, f.renderer);
  f.session.publish(lease, () => {});
  f.session.dispose();
  const next = createPreviewPresentationSession({
    fallback: () => f.fallback,
    host: () => f.host,
  });
  sessions.push(next);
  next.mount();
  expect(f.fallback.hasAttribute('data-preview-stage-canvas')).toBe(true);
  expect(() => f.session.mount()).toThrow();
  const replacement = next.acquire(size, f.renderer);
  expect(replacement.canvas).not.toBe(lease.canvas);
  replacement.release();
});
it('commits the active pointer target with its marker and restores pointer policy on rollback and fallback', () => {
  const f = fixture();
  f.fallback.style.pointerEvents = 'auto';
  f.session.mount();
  const a = f.session.acquire(size, f.renderer),
    b = f.session.acquire(size, f.renderer);
  expect(getComputedStyle(a.canvas).pointerEvents).toBe('none');
  f.session.publish(a, () => {
    const target = f.host.querySelector('[data-preview-stage-canvas]');
    expect(target).toBe(a.canvas);
    expect(getComputedStyle(a.canvas).pointerEvents).toBe('auto');
    expect(getComputedStyle(f.fallback).pointerEvents).toBe('none');
  });
  expect(getComputedStyle(b.canvas).pointerEvents).toBe('none');
  expect(() =>
    f.session.publish(b, () => {
      throw new Error('geometry');
    })
  ).toThrow();
  expect(a.canvas.hasAttribute('data-preview-stage-canvas')).toBe(true);
  expect(getComputedStyle(a.canvas).pointerEvents).toBe('auto');
  expect(getComputedStyle(b.canvas).pointerEvents).toBe('none');
  expect(getComputedStyle(f.fallback).pointerEvents).toBe('none');
  b.release();
  f.session.publish(null, () => {});
  expect(getComputedStyle(a.canvas).pointerEvents).toBe('none');
  expect(getComputedStyle(f.fallback).pointerEvents).toBe('auto');
  f.session.dispose();
  expect(f.fallback.style.pointerEvents).toBe('auto');
});

it('opts into offscreen backing and never resizes a transferred placeholder during publication or retirement', () => {
  const f = fixture();
  f.session.mount();
  const setters: ReturnType<typeof vi.fn>[] = [];
  f.renderer.createSurface.mockImplementation((canvas) => {
    const width = vi.spyOn(canvas, 'width', 'set').mockImplementation(() => {
      throw new Error('transferred width');
    });
    const height = vi.spyOn(canvas, 'height', 'set').mockImplementation(() => {
      throw new Error('transferred height');
    });
    setters.push(width, height);
    return { canvas, present: vi.fn(async () => {}), dispose: vi.fn() };
  });
  const front = f.session.acquire(size, f.renderer);
  f.session.publish(front, () => {});
  const pending = f.session.acquire(size, f.renderer);
  expect(f.renderer.createSurface).toHaveBeenCalledWith(front.canvas, { offscreen: true });
  expect(() => f.session.dispose()).not.toThrow();
  expect(front.canvas.isConnected).toBe(false);
  expect(pending.canvas.isConnected).toBe(true);
  expect(() => pending.release()).not.toThrow();
  expect(pending.canvas.isConnected).toBe(false);
  for (const setter of setters) expect(setter).not.toHaveBeenCalled();
  expect(f.fallback.width).toBe(64);
});
it('preserves a binding error after transfer without mutating the failed HTML placeholder', () => {
  const f = fixture();
  f.session.mount();
  const failure = new Error('binding after transfer');
  let placeholder: HTMLCanvasElement | undefined;
  f.renderer.createSurface.mockImplementation((canvas) => {
    placeholder = canvas;
    vi.spyOn(canvas, 'width', 'set').mockImplementation(() => {
      throw new Error('secondary width');
    });
    vi.spyOn(canvas, 'height', 'set').mockImplementation(() => {
      throw new Error('secondary height');
    });
    throw failure;
  });
  expect(() => f.session.acquire(size, f.renderer)).toThrow(failure);
  expect(placeholder?.isConnected).toBe(false);
  expect(f.host.querySelectorAll('canvas')).toHaveLength(1);
});

it('isolates inspector markers and frame events from the main stage and keeps pointer ownership outside pixels', () => {
  const f = fixture('inspector');
  const main = document.createElement('canvas');
  main.setAttribute('data-preview-stage-canvas', '');
  document.body.appendChild(main);
  const event = vi.fn();
  f.host.addEventListener('sniptale-preview-frame', event);
  f.session.mount();
  expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(f.host.querySelector('[data-preview-stage-canvas]')).toBeNull();
  const target = f.session.acquire(size, f.renderer);
  expect(target.canvas.getAttribute('aria-hidden')).toBe('true');
  f.session.publish(target, () => {
    expect(target.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
    expect(target.canvas.style.pointerEvents).toBe('none');
    expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(false);
  });
  expect(document.querySelectorAll('[data-preview-stage-canvas]')).toHaveLength(1);
  expect(document.querySelector('[data-preview-stage-canvas]')).toBe(main);
  f.session.publish(null, () => {});
  expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(target.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(false);
  expect(event).not.toHaveBeenCalled();
  f.session.dispose();
  expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(false);
  expect(main.hasAttribute('data-preview-stage-canvas')).toBe(true);
});

it('restores inspector front and caller ownership after rejected geometry without stage notifications', () => {
  const f = fixture('inspector'),
    event = vi.fn();
  f.host.addEventListener('sniptale-preview-frame', event);
  f.session.mount();
  const a = f.session.acquire(size, f.renderer),
    b = f.session.acquire(size, f.renderer);
  const releaseA = vi.fn(() => a.release()),
    releaseB = vi.fn(() => b.release());
  f.session.publish({ canvas: a.canvas, release: releaseA }, () => {});
  expect(() =>
    f.session.publish({ canvas: b.canvas, release: releaseB }, () => {
      throw new Error('inspector geometry');
    })
  ).toThrow('inspector geometry');
  expect(a.canvas.style.opacity).toBe('1');
  expect(a.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(a.canvas.style.pointerEvents).toBe('none');
  expect(b.canvas.style.opacity).toBe('0');
  expect(b.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(false);
  expect(releaseA).not.toHaveBeenCalled();
  expect(releaseB).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
  releaseB();
  f.session.dispose();
  expect(releaseA).toHaveBeenCalledOnce();
  expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(false);
  expect(f.host.querySelectorAll('[data-preview-stage-canvas]')).toHaveLength(0);
});

it('restores a borrowed inspector fallback marker and pointer policy on disposal', () => {
  const f = fixture('inspector');
  f.fallback.setAttribute('data-preview-inspector-canvas', '');
  f.fallback.style.opacity = '.4';
  f.fallback.style.pointerEvents = 'none';
  f.session.mount();
  const target = f.session.acquire(size, f.renderer);
  f.session.publish(target, () => {});
  f.session.dispose();
  expect(f.fallback.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(f.fallback.hasAttribute('data-preview-stage-canvas')).toBe(false);
  expect(f.fallback.style.opacity).toBe('0.4');
  expect(f.fallback.style.pointerEvents).toBe('none');
  expect(target.canvas.isConnected).toBe(false);
});

it('preserves transparent crop corners without changing the borrowed fallback or inspector pointer policy', () => {
  const f = fixture('inspector', 'transparent');
  f.fallback.style.backgroundColor = 'transparent';
  f.session.mount();
  const a = f.session.acquire(size, f.renderer);
  expect(a.canvas.style.backgroundColor).toBe('transparent');
  f.session.publish(a, () => {});
  expect(a.canvas.style.backgroundColor).toBe('transparent');
  expect(a.canvas.style.pointerEvents).toBe('none');
  const b = f.session.acquire(size, f.renderer);
  expect(b.canvas.style.backgroundColor).toBe('transparent');
  f.session.publish(b, () => {});
  const reused = f.session.acquire(size, f.renderer);
  expect(reused.canvas).toBe(a.canvas);
  expect(reused.canvas.style.backgroundColor).toBe('transparent');
  reused.release();
  f.session.dispose();
  expect(f.fallback.style.backgroundColor).toBe('transparent');
});

it('releases transferred image ownership only after the previous front is hidden', () => {
  const f = fixture();
  f.session.mount();
  const a = f.session.acquire(size, f.renderer);
  f.session.publish(a, () => {});
  const b = f.session.acquire(size, f.renderer);
  expect(f.releasedImages).toHaveLength(0);
  f.session.publish(b, () => {});
  expect(f.releasedImages).toEqual([{ canvas: a.canvas, visible: false }]);
  a.release();
  expect(f.releasedImages).toHaveLength(1);
  f.session.dispose();
  expect(f.releasedImages).toEqual([
    { canvas: a.canvas, visible: false },
    { canvas: b.canvas, visible: false },
  ]);
});

it('retains the stage front while two exclusive outputs are pending and reuses all three canvases', () => {
  const f = fixture();
  f.session.mount();
  const append = vi.spyOn(f.host, 'appendChild');
  const front = f.session.acquire(size, f.renderer);
  f.session.publish(front, () => {});
  const first = f.session.acquire(size, f.renderer);
  const second = f.session.acquire(size, f.renderer);
  expect(new Set([front.canvas, first.canvas, second.canvas]).size).toBe(3);
  expect(front.canvas.style.opacity).toBe('1');
  expect(first.canvas.style.opacity).toBe('0');
  expect(second.canvas.style.opacity).toBe('0');
  expect(() => f.session.acquire(size, f.renderer)).toThrow('busy');
  f.session.publish(first, () => {});
  const next = f.session.acquire(size, f.renderer);
  expect(next.canvas).toBe(front.canvas);
  expect(append).toHaveBeenCalledTimes(3);
  f.session.publish(second, () => {});
  next.release();
});

it('retains the inspector surface bound while the stage permits two pending frames', () => {
  const f = fixture('inspector');
  f.session.mount();
  const front = f.session.acquire(size, f.renderer);
  f.session.publish(front, () => {});
  const pending = f.session.acquire(size, f.renderer);
  expect(() => f.session.acquire(size, f.renderer)).toThrow('busy');
  pending.release();
});
