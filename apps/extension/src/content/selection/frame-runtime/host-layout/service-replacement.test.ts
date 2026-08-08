// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameHostLayoutService } from './service';
import {
  createRuntime,
  installDynamicRect,
  resetServiceTestEnvironment,
} from './service.test-support';

afterEach(resetServiceTestEnvironment);

describe('frame host-layout replacement stability', () => {
  it('keeps a unique replacement hidden until two generation-scoped geometry samples agree', () => {
    vi.useFakeTimers();
    const original = document.createElement('button');
    original.id = 'target';
    document.body.appendChild(original);
    installDynamicRect(original, () => ({ x: 120, y: 60, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const scenario = createRuntime([frame]);
    const service = createFrameHostLayoutService();
    service.link(frame.id, original, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    const committedBeforeDetach = scenario.framesRef.current[0]!;
    const recoveryBeforeDetach = service.getLastGoodPagePlacement(frame.id);

    original.remove();
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');

    let replacementRect: DOMRectInit = { x: 180, y: 90, width: 140, height: 44 };
    const replacement = original.cloneNode() as HTMLButtonElement;
    installDynamicRect(replacement, () => replacementRect);
    document.body.appendChild(replacement);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(17);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeDetach);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(recoveryBeforeDetach);

    replacementRect = { x: 220, y: 110, width: 160, height: 54 };
    vi.advanceTimersByTime(16);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeDetach);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(recoveryBeforeDetach);

    vi.advanceTimersByTime(16);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(scenario.framesRef.current[0]).toMatchObject({ id: frame.id, width: 166, height: 60 });
    expect(scenario.framesRef.current[0]!.x).toBeGreaterThan(committedBeforeDetach.x);
    expect(service.getNode(frame.id)).toBe(replacement);
    service.dispose();
  });

  it('resets an unfinished replacement sample at the hard cap before a later retry', () => {
    vi.useFakeTimers();
    const original = document.createElement('button');
    original.id = 'target';
    document.body.appendChild(original);
    installDynamicRect(original, () => ({ x: 120, y: 60, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const scenario = createRuntime([frame]);
    const service = createFrameHostLayoutService();
    service.link(frame.id, original, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    const committedBeforeDetach = scenario.framesRef.current[0]!;

    original.remove();
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);

    let moving = true;
    let readCount = 0;
    const replacement = original.cloneNode() as HTMLButtonElement;
    installDynamicRect(replacement, () =>
      moving
        ? { x: 180 + readCount++, y: 90, width: 140, height: 44 }
        : { x: 220, y: 110, width: 140, height: 44 }
    );
    document.body.appendChild(replacement);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(2_100);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeDetach);

    moving = false;
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(17);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeDetach);

    vi.advanceTimersByTime(16);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(scenario.framesRef.current[0]!.x).toBeGreaterThan(committedBeforeDetach.x);
    service.dispose();
  });
});

describe('frame host-layout identity resolution', () => {
  it('restores the retained exact node beside an identical selector and fingerprint clone', () => {
    const original = document.createElement('button');
    original.id = 'target';
    original.setAttribute('aria-label', 'stable target');
    document.body.appendChild(original);
    installDynamicRect(original, () => ({ x: 120, y: 60, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, original, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.unlink(frame.id);
    const clone = original.cloneNode() as HTMLButtonElement;
    document.body.appendChild(clone);

    service.restoreFrames([frame]);

    expect(service.getNode(frame.id)).toBe(original);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    service.dispose();
  });

  it.each([
    ['the same node', false],
    ['a unique replacement', true],
  ])('retires stale motion authority before reacquiring %s', (_label, replaceNode) => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 120, y: 60, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(createRuntime([frame]).runtime);
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');

    target.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    target.remove();
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');

    const restored = replaceNode ? (target.cloneNode() as HTMLButtonElement) : target;
    if (replaceNode) {
      installDynamicRect(restored, () => ({ x: 180, y: 90, width: 140, height: 44 }));
    }
    document.body.appendChild(restored);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(service.getNode(frame.id)).toBe(restored);
    service.dispose();
  });

  it('rejects a recycled connected node after an identity-only attribute mutation', async () => {
    vi.useFakeTimers();
    const target = document.createElement('a');
    target.id = 'target';
    target.href = '/learn-more';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 120, y: 60, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(createRuntime([frame]).runtime);
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');

    target.href = '/different-logical-item';
    await Promise.resolve();
    vi.advanceTimersByTime(64);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');
    expect(service.getNode(frame.id)).toBeNull();
    service.dispose();
  });
});
