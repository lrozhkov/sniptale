// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameHostLayoutService } from './service';
import { createRuntime, resetServiceTestEnvironment } from './service.test-support';

afterEach(resetServiceTestEnvironment);

describe('frame host-layout recovery queue', () => {
  it('queues manual missing and ambiguous anchors after the grace period but excludes auto-blur', () => {
    vi.useFakeTimers();
    const accepted = document.createElement('button');
    accepted.id = 'duplicate-anchor';
    document.body.appendChild(accepted);
    const service = createFrameHostLayoutService();
    service.link('ambiguous', accepted, '#duplicate-anchor');
    accepted.remove();
    const first = accepted.cloneNode() as HTMLButtonElement;
    const second = accepted.cloneNode() as HTMLButtonElement;
    document.body.append(first, second);
    const frames: FrameData[] = [
      { id: 'missing', x: 10, y: 10, width: 80, height: 30, linkedElementSelector: '#gone' },
      {
        id: 'ambiguous',
        x: 20,
        y: 20,
        width: 80,
        height: 30,
        linkedElementSelector: '#duplicate-anchor',
      },
      {
        id: 'automatic',
        createdBy: 'auto-blur',
        x: 30,
        y: 30,
        width: 80,
        height: 30,
        linkedElementSelector: '#also-gone',
      },
    ];
    const scenario = createRuntime(frames);
    service.start(scenario.runtime);

    expect(service.getSnapshot().recoveries).toEqual([]);
    vi.advanceTimersByTime(550);

    expect(service.getSnapshot().recoveries).toEqual([
      { frameId: 'missing', status: 'missing' },
      { frameId: 'ambiguous', status: 'ambiguous' },
    ]);
    expect(scenario.framesRef.current).toHaveLength(3);
    service.dispose();
    expect(service.getSnapshot().recoveries).toEqual([]);
  });
});

describe('frame host-layout recovery generations', () => {
  it('restarts the full recovery grace period for a new selector generation', () => {
    vi.useFakeTimers();
    const service = createFrameHostLayoutService();
    const firstFrame: FrameData = {
      id: 'frame-1',
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      linkedElementSelector: '#first-missing',
      pagePlacement: { iframePath: [], pageX: 10, pageY: 20 },
    };
    const scenario = createRuntime([firstFrame]);
    service.start(scenario.runtime);
    vi.advanceTimersByTime(400);

    const nextFrame = { ...firstFrame, linkedElementSelector: '#second-missing' };
    scenario.framesRef.current = [nextFrame];
    service.restoreFrames([nextFrame]);
    vi.advanceTimersByTime(150);
    expect(service.getSnapshot().recoveries).toEqual([]);

    vi.advanceTimersByTime(350);
    expect(service.getSnapshot().recoveries).toEqual([
      { frameId: firstFrame.id, status: 'missing' },
    ]);
    service.dispose();
  });
});
