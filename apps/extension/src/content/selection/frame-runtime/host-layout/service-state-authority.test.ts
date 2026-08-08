// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameHostLayoutService } from './service';
import { installDynamicRect, resetServiceTestEnvironment } from './service.test-support';

afterEach(resetServiceTestEnvironment);

describe('frame host-layout state authority', () => {
  it('commits the frame ref before publishing an immutable React snapshot', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    let targetRect: DOMRectInit = { x: 120, y: 60, width: 140, height: 44 };
    installDynamicRect(target, () => targetRect);
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const framesRef = { current: [frame] };
    const publishedSnapshots: FrameData[][] = [];
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start({
      frameStatesRef: { current: new Map() },
      framesRef,
      onAnchorUnavailable: vi.fn(),
      setFrames: (nextFrames) => {
        expect(framesRef.current).toBe(nextFrames);
        publishedSnapshots.push(nextFrames);
      },
    });
    vi.advanceTimersByTime(64);
    publishedSnapshots.length = 0;

    targetRect = { x: 220, y: 80, width: 140, height: 44 };
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);

    expect(publishedSnapshots).toHaveLength(1);
    expect(publishedSnapshots[0]?.[0]).toMatchObject({ x: 217, y: 77 });
    expect(framesRef.current).toBe(publishedSnapshots[0]);
    service.dispose();
  });

  it('does not publish stale geometry after a frame is removed before reconcile', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    let targetRect: DOMRectInit = { x: 120, y: 60, width: 140, height: 44 };
    installDynamicRect(target, () => targetRect);
    const frame: FrameData = {
      id: 'frame-1',
      x: 120,
      y: 60,
      width: 140,
      height: 44,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
    };
    const framesRef = { current: [frame] };
    const setFrames = vi.fn<(frames: FrameData[]) => void>();
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start({
      frameStatesRef: { current: new Map() },
      framesRef,
      onAnchorUnavailable: vi.fn(),
      setFrames,
    });
    vi.advanceTimersByTime(64);
    setFrames.mockClear();

    framesRef.current = [];
    service.unlink(frame.id);
    targetRect = { x: 220, y: 80, width: 140, height: 44 };
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);

    expect(framesRef.current).toEqual([]);
    expect(setFrames).not.toHaveBeenCalled();
    service.dispose();
  });
});
