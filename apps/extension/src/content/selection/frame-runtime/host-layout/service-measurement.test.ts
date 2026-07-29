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

describe('frame host-layout measurement acceptance', () => {
  it('keeps an initially hidden anchor suspended until the shared measurement gate accepts it', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    target.setAttribute('aria-hidden', 'true');
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(service.getLastGoodPagePlacement(frame.id)).toBeNull();

    const scenario = createRuntime([frame]);
    service.start(scenario.runtime);
    target.removeAttribute('aria-hidden');
    service.invalidate();
    vi.advanceTimersByTime(64);

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual({
      iframePath: [],
      pageX: 34,
      pageY: 44,
    });
    service.dispose();
  });

  it.each([
    ['zero width', { x: 40, y: 50, width: 0, height: 40 }],
    ['non-finite x', { x: Number.NaN, y: 50, width: 120, height: 40 }],
  ])('does not seed last-good state from %s initial geometry', (_label, initialRect) => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const service = createFrameHostLayoutService();

    service.link('frame-1', target, '#target', {
      pagePlacement: { iframePath: [], pageX: initialRect.x, pageY: initialRect.y },
      rect: initialRect,
    });

    expect(service.getSnapshot().presentations.get('frame-1')).toBe('suspended');
    expect(service.getLastGoodPagePlacement('frame-1')).toBeNull();
  });

  it('fresh-classifies manual placement and preserves last-good geometry when the node hides', () => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    const previousPlacement = service.getLastGoodPagePlacement(frame.id);
    target.hidden = true;

    expect(
      service.recordManualPlacement(frame.id, target, {
        pagePlacement: { iframePath: [], pageX: 200, pageY: 220 },
        rect: { x: 200, y: 220, width: 80, height: 30 },
      })
    ).toBeNull();
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(previousPlacement);
  });

  it.each([
    ['zero width', { x: 200, y: 220, width: 0, height: 30 }],
    ['non-finite x', { x: Number.NaN, y: 220, width: 80, height: 30 }],
  ])('rejects %s manual geometry without changing a visible binding', (_label, rect) => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const service = createFrameHostLayoutService();
    service.link(
      'frame-1',
      target,
      '#target',
      {
        pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
        rect: { x: 40, y: 50, width: 120, height: 40 },
      },
      { requireAcceptedInitial: true }
    );
    const previousPlacement = service.getLastGoodPagePlacement('frame-1');

    expect(
      service.recordManualPlacement('frame-1', target, {
        pagePlacement: { iframePath: [], pageX: rect.x, pageY: rect.y },
        rect,
      })
    ).toBeNull();
    expect(service.getSnapshot().presentations.get('frame-1')).toBe('visible');
    expect(service.getLastGoodPagePlacement('frame-1')).toEqual(previousPlacement);
  });

  it.each([
    ['zero width', { x: 200, y: 220, width: 0, height: 30 }],
    ['non-finite x', { x: Number.NaN, y: 220, width: 80, height: 30 }],
  ])('classifies a hidden anchor before rejecting %s proposed geometry', (_label, rect) => {
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const service = createFrameHostLayoutService();
    service.link(
      'frame-1',
      target,
      '#target',
      {
        pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
        rect: { x: 40, y: 50, width: 120, height: 40 },
      },
      { requireAcceptedInitial: true }
    );
    const previousPlacement = service.getLastGoodPagePlacement('frame-1');
    target.hidden = true;

    expect(
      service.recordManualPlacement('frame-1', target, {
        pagePlacement: { iframePath: [], pageX: rect.x, pageY: rect.y },
        rect,
      })
    ).toBeNull();
    expect(service.getSnapshot().presentations.get('frame-1')).toBe('suspended');
    expect(service.getLastGoodPagePlacement('frame-1')).toEqual(previousPlacement);
  });

  it('notifies runtime immediately when a manual update discovers a hidden anchor', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
    };
    const onAnchorUnavailable = vi.fn();
    const service = createFrameHostLayoutService();
    service.link(
      frame.id,
      target,
      frame.linkedElementSelector!,
      { pagePlacement: frame.pagePlacement!, rect: frame },
      { requireAcceptedInitial: true }
    );
    const scenario = createRuntime([frame], onAnchorUnavailable);
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    onAnchorUnavailable.mockClear();
    target.hidden = true;

    expect(
      service.recordManualPlacement(frame.id, target, {
        pagePlacement: { iframePath: [], pageX: 200, pageY: 220 },
        rect: { x: 200, y: 220, width: 80, height: 30 },
      })
    ).toBeNull();
    expect(onAnchorUnavailable).toHaveBeenCalledWith(frame.id, 'suspended');
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    service.dispose();
  });

  it('retires the generation and notifies runtime when a manual update sees a detached anchor', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.id = 'target';
    document.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 40, y: 50, width: 120, height: 40 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      linkedElementSelector: '#target',
      pagePlacement: { iframePath: [], pageX: 40, pageY: 50 },
    };
    const onAnchorUnavailable = vi.fn();
    const service = createFrameHostLayoutService();
    service.link(
      frame.id,
      target,
      frame.linkedElementSelector!,
      { pagePlacement: frame.pagePlacement!, rect: frame },
      { requireAcceptedInitial: true }
    );
    const scenario = createRuntime([frame], onAnchorUnavailable);
    service.start(scenario.runtime);
    vi.advanceTimersByTime(64);
    onAnchorUnavailable.mockClear();
    const previousPlacement = service.getLastGoodPagePlacement(frame.id);
    target.remove();

    expect(
      service.recordManualPlacement(frame.id, target, {
        pagePlacement: { iframePath: [], pageX: 200, pageY: 220 },
        rect: { x: 200, y: 220, width: 80, height: 30 },
      })
    ).toBeNull();
    expect(service.getNode(frame.id)).toBeNull();
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');
    expect(service.getLastGoodPagePlacement(frame.id)).toEqual(previousPlacement);
    expect(onAnchorUnavailable).toHaveBeenCalledWith(frame.id, 'missing');
    service.dispose();
  });
});
