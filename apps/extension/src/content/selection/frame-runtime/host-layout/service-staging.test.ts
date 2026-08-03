// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameHostLayoutService } from './service';
import {
  createRuntime,
  dispatchAnimationSignal,
  installDynamicRect,
  resetServiceTestEnvironment,
} from './service.test-support';

afterEach(resetServiceTestEnvironment);

describe('frame host-layout unattributed geometry staging', () => {
  it('does not publish the first offscreen sample from a non-scroll layout mutation', async () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    const layoutText = document.createTextNode('compact');
    document.body.append(target, layoutText);
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
    const committedBeforeMutation = scenario.framesRef.current[0]!;

    targetRect = { x: 120, y: -500, width: 140, height: 44 };
    layoutText.data = 'expanded sibling content';
    await Promise.resolve();
    vi.advanceTimersByTime(17);

    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMutation);

    vi.advanceTimersByTime(32);
    expect(scenario.framesRef.current[0]?.y).toBeLessThan(-400);
    service.dispose();
  });

  it.each([
    [
      'sibling text-node data',
      (_layoutDriver: HTMLElement, layoutText: Text) => {
        layoutText.data = 'expanded sibling content';
      },
    ],
    [
      'a non-whitelisted sibling layout attribute',
      (layoutDriver: HTMLElement, _layoutText: Text) => {
        layoutDriver.setAttribute('data-layout-column', 'wide');
      },
    ],
  ])('stages position-only geometry driven by %s', async (_label, mutateLayoutDriver) => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    const layoutDriver = document.createElement('div');
    const layoutText = document.createTextNode('compact');
    layoutDriver.appendChild(layoutText);
    document.body.append(target, layoutDriver);
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
    const committedBeforeMutation = scenario.framesRef.current[0]!;

    targetRect = { x: 180, y: 90, width: 140, height: 44 };
    mutateLayoutDriver(layoutDriver, layoutText);
    await Promise.resolve();
    vi.advanceTimersByTime(17);

    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMutation);

    targetRect = { x: 220, y: 110, width: 140, height: 44 };
    vi.advanceTimersByTime(16);
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMutation);

    vi.advanceTimersByTime(16);
    expect(scenario.framesRef.current[0]).toMatchObject({
      id: frame.id,
      width: committedBeforeMutation.width,
      height: committedBeforeMutation.height,
    });
    expect(scenario.framesRef.current[0]!.x).toBeGreaterThan(committedBeforeMutation.x);
    expect(scenario.framesRef.current[0]!.y).toBeGreaterThan(committedBeforeMutation.y);
    service.dispose();
  });

  it('keeps moving sibling-driven geometry out of state until two final samples are stable', async () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    const layoutDriver = document.createElement('div');
    document.body.append(target, layoutDriver);
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
    const committedBeforeMotion = scenario.framesRef.current[0]!;
    const lastGoodBeforeMotion = service.getLastGoodPagePlacement(frame.id);

    targetRect = { x: 180, y: 90, width: 140, height: 44 };
    layoutDriver.classList.add('wide-grid');
    await Promise.resolve();
    vi.advanceTimersByTime(17);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMotion);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(lastGoodBeforeMotion);

    targetRect = { x: 210, y: 100, width: 150, height: 48 };
    vi.advanceTimersByTime(16);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMotion);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(lastGoodBeforeMotion);

    targetRect = { x: 240, y: 110, width: 160, height: 54 };
    vi.advanceTimersByTime(16);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMotion);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(lastGoodBeforeMotion);

    vi.advanceTimersByTime(16);
    const committedAfterSettle = scenario.framesRef.current[0]!;
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(committedAfterSettle).toMatchObject({ id: frame.id, width: 172, height: 66 });
    expect(committedAfterSettle.x).toBeGreaterThan(committedBeforeMotion.x);
    expect(service.getLastGoodPagePlacement(frame.id)).toMatchObject({
      pageX: committedAfterSettle.x,
      pageY: committedAfterSettle.y,
    });
    service.dispose();
  });

  it('abandons continuously drifting non-motion geometry after two seconds while suspended', async () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    const layoutDriver = document.createElement('div');
    document.body.append(target, layoutDriver);
    let drifting = false;
    let geometryRevision = 0;
    installDynamicRect(target, () => ({
      x: drifting ? 180 + geometryRevision++ : 120,
      y: 60,
      width: 140,
      height: 44,
    }));
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
    const committedBeforeMotion = scenario.framesRef.current[0]!;
    const lastGoodBeforeMotion = service.getLastGoodPagePlacement(frame.id);

    drifting = true;
    layoutDriver.classList.add('wide-grid');
    await Promise.resolve();
    vi.advanceTimersByTime(2_100);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(scenario.framesRef.current[0]).toEqual(committedBeforeMotion);
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(lastGoodBeforeMotion);
    const revisionAtCap = geometryRevision;
    vi.advanceTimersByTime(500);
    expect(geometryRevision).toBe(revisionAtCap);
    service.dispose();
  });
});

describe('frame host-layout motion budget isolation', () => {
  it('gives staggered bindings independent caps and skips capped geometry during unrelated motion', () => {
    vi.useFakeTimers();
    const first = document.createElement('button');
    first.id = 'first';
    const second = document.createElement('button');
    second.id = 'second';
    document.body.append(first, second);
    let firstRevision = 0;
    installDynamicRect(first, () => ({
      x: 120 + (firstRevision++ % 2) * 2,
      y: 60,
      width: 140,
      height: 44,
    }));
    let secondReads = 0;
    installDynamicRect(second, () => {
      secondReads += 1;
      return {
        x: 360,
        y: 60,
        width: 140,
        height: 44,
      };
    });
    const frames: FrameData[] = [
      {
        id: 'frame-1',
        x: 120,
        y: 60,
        width: 140,
        height: 44,
        linkedElementSelector: '#first',
        pagePlacement: { iframePath: [], pageX: 120, pageY: 60 },
      },
      {
        id: 'frame-2',
        x: 360,
        y: 60,
        width: 140,
        height: 44,
        linkedElementSelector: '#second',
        pagePlacement: { iframePath: [], pageX: 360, pageY: 60 },
      },
    ];
    const service = createFrameHostLayoutService();
    frames.forEach((frame, index) => {
      service.link(frame.id, index === 0 ? first : second, frame.linkedElementSelector!, {
        pagePlacement: frame.pagePlacement!,
        rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      });
    });
    service.start(createRuntime(frames).runtime);
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frames[0]!.id)).toBe('visible');
    expect(service.getSnapshot().presentations.get(frames[1]!.id)).toBe('visible');

    dispatchAnimationSignal(first, 'animationstart', 'first-motion');
    vi.advanceTimersByTime(1_900);
    dispatchAnimationSignal(second, 'animationstart', 'second-motion');
    vi.advanceTimersByTime(200);
    expect(service.getSnapshot().presentations.get(frames[0]!.id)).toBe('suspended');
    expect(service.getSnapshot().presentations.get(frames[1]!.id)).toBe('suspended');

    const readsAfterFirstCap = secondReads;
    dispatchAnimationSignal(second, 'animationiteration', 'second-motion');
    vi.advanceTimersByTime(64);
    expect(secondReads).toBeGreaterThan(readsAfterFirstCap);

    vi.advanceTimersByTime(1_837);
    const readsAfterSecondCap = secondReads;
    dispatchAnimationSignal(first, 'animationiteration', 'first-motion');
    vi.advanceTimersByTime(64);
    expect(secondReads).toBe(readsAfterSecondCap);
    service.dispose();
  });
});
