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

describe('frame host-layout iframe lifecycle', () => {
  it('attributes motion on an iframe ancestor to its inner linked anchor', () => {
    vi.useFakeTimers();
    const carousel = document.createElement('div');
    const iframe = document.createElement('iframe');
    iframe.id = 'preview';
    carousel.appendChild(iframe);
    document.body.appendChild(carousel);
    installDynamicRect(iframe, () => ({ x: 80, y: 50, width: 400, height: 300 }));
    const target = iframe.contentDocument!.createElement('button');
    target.id = 'target';
    iframe.contentDocument!.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 20, y: 30, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 100,
      y: 80,
      width: 140,
      height: 44,
      linkedElementSelector: 'iframe#preview => #target',
      pagePlacement: { iframePath: ['iframe#preview'], pageX: 20, pageY: 30 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(createRuntime([frame]).runtime);
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');

    carousel.dispatchEvent(new Event('transitionrun', { bubbles: true }));

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('suspended');
    service.dispose();
  });

  it('hides an iframe-owned anchor as soon as its document starts unloading', () => {
    vi.useFakeTimers();
    const iframe = document.createElement('iframe');
    iframe.id = 'preview';
    document.body.appendChild(iframe);
    installDynamicRect(iframe, () => ({ x: 80, y: 50, width: 400, height: 300 }));
    const target = iframe.contentDocument!.createElement('button');
    target.id = 'target';
    iframe.contentDocument!.body.appendChild(target);
    installDynamicRect(target, () => ({ x: 20, y: 30, width: 140, height: 44 }));
    const frame: FrameData = {
      id: 'frame-1',
      x: 100,
      y: 80,
      width: 140,
      height: 44,
      linkedElementSelector: 'iframe#preview => #target',
      pagePlacement: { iframePath: ['iframe#preview'], pageX: 20, pageY: 30 },
    };
    const service = createFrameHostLayoutService();
    service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    });
    service.start(createRuntime([frame]).runtime);
    vi.advanceTimersByTime(64);
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('visible');

    iframe.contentWindow!.dispatchEvent(new Event('pagehide'));

    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');
    expect(service.getNode(frame.id)).toBeNull();
    service.dispose();
  });
});
