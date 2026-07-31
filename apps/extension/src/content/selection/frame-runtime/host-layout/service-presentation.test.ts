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

describe('frame host-layout presentation lifecycle', () => {
  it('hides a moving connected anchor before scroll, rejects negative geometry, and restores it', () => {
    vi.useFakeTimers();
    const viewport = document.createElement('div');
    viewport.style.overflow = 'hidden';
    const slide = document.createElement('div');
    const target = document.createElement('button');
    target.id = 'target';
    slide.appendChild(target);
    viewport.appendChild(slide);
    document.body.appendChild(viewport);
    installDynamicRect(viewport, () => ({ x: 0, y: 0, width: 500, height: 180 }));
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
    const onAnchorUnavailable = vi.fn();
    const scenario = createRuntime([frame], onAnchorUnavailable);
    const service = createFrameHostLayoutService();
    service.link('frame-1', target, '#target', {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    const stop = service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    const lastVisibleFrame = scenario.framesRef.current[0]!;

    slide.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    expect(service.getSnapshot().presentations.get('frame-1')).toBe('suspended');
    expect(onAnchorUnavailable).toHaveBeenCalledTimes(1);

    targetRect = { x: -700, y: 60, width: 140, height: 44 };
    slide.setAttribute('aria-hidden', 'true');
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);
    expect(scenario.framesRef.current).toEqual([lastVisibleFrame]);
    expect(scenario.framesRef.current[0]?.x).toBeGreaterThan(0);

    targetRect = { x: 122, y: 62, width: 140, height: 44 };
    slide.removeAttribute('aria-hidden');
    slide.dispatchEvent(new Event('transitionend', { bubbles: true }));
    vi.advanceTimersByTime(96);

    expect(service.getSnapshot().presentations.get('frame-1')).toBe('visible');
    expect(scenario.framesRef.current).toHaveLength(1);
    expect(scenario.framesRef.current[0]).toMatchObject({ id: 'frame-1' });
    expect(scenario.framesRef.current[0]!.x).toBeGreaterThan(0);
    stop();
  });

  it('reports ordinary viewport loss as offscreen without changing frame geometry', () => {
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
    const onAnchorUnavailable = vi.fn();
    const scenario = createRuntime([frame], onAnchorUnavailable);
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    onAnchorUnavailable.mockClear();
    const lastVisibleFrame = scenario.framesRef.current[0]!;

    targetRect = { x: -1_200, y: 60, width: 140, height: 44 };
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(64);

    expect(onAnchorUnavailable).toHaveBeenCalledWith('frame-1', 'offscreen');
    expect(scenario.framesRef.current).toEqual([lastVisibleFrame]);
    service.dispose();
  });

  it('keeps a linked frame visible while AI parsing adds and removes its transient locator', async () => {
    vi.useFakeTimers();
    const stableAncestor = document.createElement('section');
    stableAncestor.id = 'stable-ancestor';
    const transientWrapper = document.createElement('div');
    const target = document.createElement('button');
    target.id = 'target';
    transientWrapper.appendChild(target);
    stableAncestor.appendChild(transientWrapper);
    document.body.appendChild(stableAncestor);
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
    const scenario = createRuntime([frame]);
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);

    target.dataset['sniptaleId'] = 'ai-field-1';
    transientWrapper.dataset['sniptaleId'] = 'ai-section-1';
    await Promise.resolve();
    vi.advanceTimersByTime(600);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(service.getSnapshot().recoveries).toEqual([]);

    delete target.dataset['sniptaleId'];
    delete transientWrapper.dataset['sniptaleId'];
    await Promise.resolve();
    vi.advanceTimersByTime(64);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    service.dispose();
  });

  it('publishes restored motion geometry only after the second stable animation frame', () => {
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
    const scenario = createRuntime([frame]);
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    const lastVisibleFrame = scenario.framesRef.current[0]!;

    target.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    targetRect = { x: 180, y: 90, width: 140, height: 44 };
    target.dispatchEvent(new Event('transitionend', { bubbles: true }));
    vi.advanceTimersByTime(17);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(lastVisibleFrame);

    vi.advanceTimersByTime(32);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(scenario.framesRef.current[0]!.x).toBeGreaterThan(lastVisibleFrame.x);
    expect(scenario.framesRef.current[0]!.y).toBeGreaterThan(lastVisibleFrame.y);
    service.dispose();
  });
});
