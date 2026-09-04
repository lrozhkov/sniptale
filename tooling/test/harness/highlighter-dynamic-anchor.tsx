import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createSolidPaint } from '@sniptale/foundation/paint';

import type {
  AppliedBorderSettings,
  FrameData,
} from '../../../apps/extension/src/features/highlighter/contracts';
import {
  createFrameHostLayoutService,
  type FrameHostLayoutService,
} from '../../../apps/extension/src/content/selection/frame-runtime/host-layout/service';
import {
  calculateFrameOffsetFromElement,
  calculateFrameViewportCoords,
} from '../../../apps/extension/src/content/selection/frame-runtime/manager/coords';
import { createDocumentPagePlacement } from '../../../apps/extension/src/content/platform/frame';

declare global {
  interface Window {
    __sniptaleDynamicAnchorHarness?: {
      ambiguous(): void;
      detach(): void;
      moveIn(): void;
      moveOut(): void;
      recycle(): void;
      reinsert(): void;
      reloadIframe(): void;
      replace(): void;
      settleReplacement(): void;
      scrollNestedIn(): void;
      scrollNestedOut(): void;
      status(): {
        connected: boolean;
        context: DynamicAnchorScenario;
        iframeRevision: string | null;
        instance: string | null;
        sameAsOriginal: boolean;
      };
      unloadIframe(): void;
    };
  }
}

export type DynamicAnchorScenario = 'carousel' | 'iframe' | 'nested';

const DYNAMIC_SETTINGS: AppliedBorderSettings = {
  sourcePresetId: 'dynamic-anchor-border',
  sourcePresetName: 'Dynamic anchor border',
  color: '#ff00ff',
  width: 3,
  style: 'solid',
  radius: 8,
  padding: { top: 2, right: 2, bottom: 2, left: 2 },
  shadow: 0,
  fillPaint: createSolidPaint('#00d4ff00'),
  inheritCustomCss: false,
  customCss: '',
};

const DYNAMIC_MANUAL_ADJUSTMENT = { x: 7, y: 5, width: 11, height: 9 } as const;

const DYNAMIC_ANCHOR_STYLE = {
  background: '#155eef',
  borderRadius: '8px',
  color: '#fff',
  display: 'inline-block',
  font: '16px/24px system-ui, sans-serif',
  padding: '12px 22px',
  textDecoration: 'none',
} as const;

type DynamicRefs = {
  iframe: { current: HTMLIFrameElement | null };
  nestedHost: { current: HTMLDivElement | null };
  nestedScroller: { current: HTMLDivElement | null };
  slide: { current: HTMLElement | null };
  target: { current: HTMLAnchorElement | null };
  track: { current: HTMLDivElement | null };
};

type DynamicControllerArgs = {
  framesRef: { current: FrameData[] };
  refs: DynamicRefs;
  scenario: DynamicAnchorScenario;
  service: FrameHostLayoutService;
  setFrames(frames: FrameData[]): void;
};

export function parseDynamicAnchorScenario(value: string | null): DynamicAnchorScenario | null {
  return value === 'carousel' || value === 'iframe' || value === 'nested' ? value : null;
}

function dispatchFixtureEvent(name: string) {
  window.dispatchEvent(new CustomEvent(`sniptale-fixture:${name}`));
}

function createDynamicAnchor(doc: Document, instance: string): HTMLAnchorElement {
  const replacement = doc.createElement('a');
  replacement.id = 'dynamic-anchor';
  replacement.href = '/learn-more';
  replacement.setAttribute('aria-label', 'Learn more about dynamic anchors');
  replacement.dataset['fixtureInstance'] = instance;
  replacement.textContent = 'Learn more';
  replacement.className = 'dynamic-anchor-button';
  Object.assign(replacement.style, DYNAMIC_ANCHOR_STYLE);
  return replacement;
}

function createIframeFixtureMarkup(revision: number, includeAnchor: boolean): string {
  const anchor = includeAnchor
    ? [
        '<a id="dynamic-anchor" class="dynamic-anchor-button"',
        ` data-fixture-instance="iframe-${revision}"`,
        ' href="/learn-more"',
        ' aria-label="Learn more about dynamic anchors">',
        'Learn more</a>',
      ].join('')
    : '';
  return `<!doctype html>
<html lang="en" data-fixture-revision="${revision}">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; min-height: 100%; }
      #dynamic-iframe-host {
        box-sizing: border-box;
        height: 190px;
        padding: 44px 0 0 52px;
      }
      .dynamic-anchor-button {
        background: #155eef;
        border-radius: 8px;
        color: #fff;
        display: inline-block;
        font: 16px/24px system-ui, sans-serif;
        padding: 12px 22px;
        text-decoration: none;
      }
    </style>
  </head>
  <body><main id="dynamic-iframe-host">${anchor}</main></body>
</html>`;
}

function createDynamicFrame(target: HTMLAnchorElement, scenario: DynamicAnchorScenario): FrameData {
  const measured = calculateFrameViewportCoords(target, DYNAMIC_SETTINGS);
  const coords = {
    x: measured.x + DYNAMIC_MANUAL_ADJUSTMENT.x,
    y: measured.y + DYNAMIC_MANUAL_ADJUSTMENT.y,
    width: measured.width + DYNAMIC_MANUAL_ADJUSTMENT.width,
    height: measured.height + DYNAMIC_MANUAL_ADJUSTMENT.height,
  };
  const pagePlacement = createDocumentPagePlacement(target.ownerDocument, coords.x, coords.y);
  if (!pagePlacement) throw new Error('Dynamic anchor harness placement is unavailable.');
  return {
    id: 'dynamic-frame',
    ...coords,
    pagePlacement,
    linkedElementSelector:
      scenario === 'iframe' ? '#dynamic-same-origin-iframe => #dynamic-anchor' : '#dynamic-anchor',
    offset: calculateFrameOffsetFromElement(coords, target),
    effectMode: 'focus',
    borderSettings: DYNAMIC_SETTINGS,
    focusSettings: { opacity: 0.35, showBorder: true },
  };
}

class DynamicAnchorFixtureController {
  private iframeRevision = 0;
  private liveTarget: HTMLAnchorElement | null = null;
  private originalTarget: HTMLAnchorElement | null = null;
  private pendingCarouselEvent: 'carousel-in' | 'carousel-out' | null = null;
  private readonly pendingCleanups = new Set<() => void>();
  private releaseReplacementGeometry: (() => void) | null = null;
  private stopService: (() => void) | null = null;

  constructor(private readonly args: DynamicControllerArgs) {}

  start() {
    if (this.stopService) return;
    const target = this.findInitialTarget();
    if (!target) return;
    this.liveTarget = target;
    this.originalTarget = target;
    const frame = createDynamicFrame(target, this.args.scenario);
    this.args.framesRef.current = [frame];
    this.args.setFrames([frame]);
    this.args.service.link(frame.id, target, frame.linkedElementSelector!, {
      pagePlacement: frame.pagePlacement!,
      rect: frame,
    });
    this.stopService = this.args.service.start({
      frameStatesRef: { current: new Map() },
      framesRef: this.args.framesRef,
      onAnchorUnavailable() {},
      setFrames: (update) => {
        const next = update(this.args.framesRef.current);
        this.args.framesRef.current = next;
        this.args.setFrames(next);
      },
    });
    this.observeCarouselTransition();
    window.__sniptaleDynamicAnchorHarness = this.createActions();
    dispatchFixtureEvent('ready');
  }

  dispose() {
    delete window.__sniptaleDynamicAnchorHarness;
    this.pendingCleanups.forEach((cleanup) => cleanup());
    this.stopService?.();
    this.args.service.dispose();
  }

  private findInitialTarget() {
    return this.args.scenario === 'iframe'
      ? this.args.refs.iframe.current?.contentDocument?.querySelector<HTMLAnchorElement>(
          '#dynamic-anchor'
        )
      : this.args.refs.target.current;
  }

  private createActions(): NonNullable<Window['__sniptaleDynamicAnchorHarness']> {
    return {
      ambiguous: this.ambiguous,
      detach: this.detach,
      moveIn: () => this.moveCarousel(false),
      moveOut: () => this.moveCarousel(true),
      recycle: this.recycle,
      reinsert: this.reinsert,
      reloadIframe: () => this.replaceIframeDocument(true),
      replace: this.replace,
      settleReplacement: this.settleReplacement,
      scrollNestedIn: () => this.scrollNested(0),
      scrollNestedOut: () => this.scrollNested(360),
      status: this.status,
      unloadIframe: () => this.replaceIframeDocument(false),
    };
  }

  private getHost() {
    const host =
      this.args.scenario === 'nested'
        ? this.args.refs.nestedHost.current
        : this.args.refs.slide.current;
    if (!host) throw new Error(`Dynamic ${this.args.scenario} anchor host is unavailable.`);
    return host;
  }

  private getLiveTarget() {
    if (!this.liveTarget) throw new Error('Dynamic anchor is unavailable.');
    return this.liveTarget;
  }

  private clearCandidates(host: HTMLElement) {
    host.querySelectorAll('#dynamic-anchor').forEach((candidate) => candidate.remove());
  }

  private ambiguous = () => {
    this.liveTarget?.remove();
    const host = this.getHost();
    this.clearCandidates(host);
    host.append(
      createDynamicAnchor(host.ownerDocument, 'ambiguous-a'),
      createDynamicAnchor(host.ownerDocument, 'ambiguous-b')
    );
    dispatchFixtureEvent('ambiguous');
  };

  private detach = () => {
    this.liveTarget?.remove();
    dispatchFixtureEvent('detached');
  };

  private recycle = () => {
    const target = this.getLiveTarget();
    target.href = '/different-action';
    target.setAttribute('aria-label', 'Different action');
    dispatchFixtureEvent('recycled');
  };

  private reinsert = () => {
    this.getHost().appendChild(this.getLiveTarget());
    dispatchFixtureEvent('reinserted');
  };

  private replace = () => {
    this.releaseReplacementGeometry?.();
    this.liveTarget?.remove();
    const host = this.getHost();
    this.clearCandidates(host);
    this.liveTarget = createDynamicAnchor(host.ownerDocument, 'replacement');
    const replacement = this.liveTarget;
    const readNativeRect = replacement.getBoundingClientRect.bind(replacement);
    let offset = 0;
    let animationFrameId: number | null = null;
    let active = true;
    replacement.getBoundingClientRect = () => {
      const rect = readNativeRect();
      return DOMRect.fromRect({
        x: rect.x + offset,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };
    const tick = () => {
      if (!active) return;
      offset = offset === 0 ? 32 : 0;
      animationFrameId = requestAnimationFrame(tick);
    };
    const release = () => {
      if (!active) return;
      active = false;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      replacement.getBoundingClientRect = readNativeRect;
      this.pendingCleanups.delete(release);
      if (this.releaseReplacementGeometry === release) this.releaseReplacementGeometry = null;
    };
    this.releaseReplacementGeometry = release;
    this.pendingCleanups.add(release);
    animationFrameId = requestAnimationFrame(tick);
    host.appendChild(this.liveTarget);
    dispatchFixtureEvent('replacement-mounted');
  };

  private settleReplacement = () => {
    this.releaseReplacementGeometry?.();
    this.args.service.invalidate();
    dispatchFixtureEvent('replacement-settled');
  };

  private status = () => ({
    connected: Boolean(this.liveTarget?.isConnected),
    context: this.args.scenario,
    iframeRevision:
      this.liveTarget?.ownerDocument.documentElement.dataset['fixtureRevision'] ?? null,
    instance: this.liveTarget?.dataset['fixtureInstance'] ?? null,
    sameAsOriginal: this.liveTarget === this.originalTarget,
  });

  private moveCarousel(out: boolean) {
    const { slide, track } = this.args.refs;
    if (!slide.current || !track.current) {
      throw new Error('Dynamic carousel fixture is unavailable.');
    }
    this.pendingCarouselEvent = out ? 'carousel-out' : 'carousel-in';
    slide.current.setAttribute('aria-hidden', String(out));
    track.current.style.transform = `translate3d(${out ? -720 : 0}px, 0, 0)`;
  }

  private observeCarouselTransition() {
    const track = this.args.refs.track.current;
    if (!track) return;
    const listener = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform' || !this.pendingCarouselEvent) return;
      dispatchFixtureEvent(this.pendingCarouselEvent);
      this.pendingCarouselEvent = null;
    };
    track.addEventListener('transitionend', listener);
    this.pendingCleanups.add(() => track.removeEventListener('transitionend', listener));
  }

  private addOneShotListener(element: EventTarget, name: string, listener: EventListener) {
    const cleanup = () => {
      element.removeEventListener(name, wrapped);
      this.pendingCleanups.delete(cleanup);
    };
    const wrapped: EventListener = (event) => {
      cleanup();
      listener(event);
    };
    this.pendingCleanups.add(cleanup);
    element.addEventListener(name, wrapped);
  }

  private replaceIframeDocument(includeAnchor: boolean) {
    const iframe = this.args.refs.iframe.current;
    if (!iframe) throw new Error('Dynamic iframe fixture is unavailable.');
    this.iframeRevision += 1;
    this.addOneShotListener(iframe, 'load', () => {
      this.liveTarget = iframe.contentDocument?.querySelector('#dynamic-anchor') ?? null;
      dispatchFixtureEvent(includeAnchor ? 'iframe-reloaded' : 'iframe-empty');
    });
    iframe.srcdoc = createIframeFixtureMarkup(this.iframeRevision, includeAnchor);
  }

  private scrollNested(scrollTop: number) {
    const scroller = this.args.refs.nestedScroller.current;
    if (!scroller) throw new Error('Dynamic nested scroller is unavailable.');
    this.addOneShotListener(scroller, 'scroll', () =>
      dispatchFixtureEvent(scrollTop === 0 ? 'nested-in' : 'nested-out')
    );
    scroller.scrollTop = scrollTop;
  }
}

function installDynamicAnchorFixture(args: DynamicControllerArgs) {
  const controller = new DynamicAnchorFixtureController(args);
  const initialize = () => controller.start();
  const iframe = args.refs.iframe.current;
  if (args.scenario === 'iframe') iframe?.addEventListener('load', initialize);
  initialize();
  return () => {
    iframe?.removeEventListener('load', initialize);
    controller.dispose();
  };
}

function DynamicAnchorLink({ targetRef }: { targetRef: DynamicRefs['target'] }) {
  return (
    <a
      ref={targetRef}
      aria-label="Learn more about dynamic anchors"
      className="dynamic-anchor-button"
      data-fixture-instance="original"
      href="/learn-more"
      id="dynamic-anchor"
      style={DYNAMIC_ANCHOR_STYLE}
    >
      Learn more
    </a>
  );
}

function DynamicScenarioSurface({
  refs,
  scenario,
}: {
  refs: DynamicRefs;
  scenario: DynamicAnchorScenario;
}) {
  if (scenario === 'iframe') {
    return (
      <iframe
        ref={refs.iframe}
        data-ui="same-origin-iframe"
        id="dynamic-same-origin-iframe"
        srcDoc={createIframeFixtureMarkup(0, true)}
        style={{ border: 0, height: 190, width: 500 }}
        title="Dynamic same-origin anchor fixture"
      />
    );
  }
  if (scenario === 'nested') {
    return (
      <div
        ref={refs.nestedScroller}
        data-ui="nested-scroll"
        style={{ height: 180, maxWidth: 620, overflow: 'auto', position: 'relative' }}
      >
        <div
          ref={refs.nestedHost}
          id="dynamic-nested-host"
          style={{ boxSizing: 'border-box', height: 620, padding: '32px 0 0 80px' }}
        >
          <DynamicAnchorLink targetRef={refs.target} />
        </div>
      </div>
    );
  }
  return (
    <div
      data-ui="dynamic-carousel-viewport"
      style={{ height: 180, maxWidth: 620, overflow: 'hidden', position: 'relative' }}
    >
      <div
        ref={refs.track}
        data-ui="dynamic-carousel-track"
        style={{
          display: 'flex',
          height: '100%',
          transform: 'translate3d(0, 0, 0)',
          transition: 'transform 180ms ease',
          width: 1240,
        }}
      >
        <section
          ref={refs.slide}
          aria-hidden="false"
          id="dynamic-carousel-slide"
          style={{ alignItems: 'center', display: 'flex', flex: '0 0 620px', paddingLeft: 80 }}
        >
          <DynamicAnchorLink targetRef={refs.target} />
        </section>
        <section style={{ flex: '0 0 620px' }}>Next slide</section>
      </div>
    </div>
  );
}

function DynamicFrameLayers({ frame }: { frame: FrameData }) {
  const box: CSSProperties = {
    height: frame.height,
    left: frame.x,
    pointerEvents: 'none',
    position: 'fixed',
    top: frame.y,
    width: frame.width,
  };
  return (
    <>
      <div
        data-frame-id={frame.id}
        data-ui="dynamic-frame"
        style={{
          ...box,
          border: '3px solid #ff00ff',
          borderRadius: 8,
          boxSizing: 'border-box',
          zIndex: 20,
        }}
      />
      <div
        data-ui="dynamic-toolbar"
        style={{
          background: '#111827',
          borderRadius: 6,
          color: '#fff',
          left: frame.x,
          padding: '6px 10px',
          position: 'fixed',
          top: frame.y + frame.height + 8,
          zIndex: 21,
        }}
      >
        Frame actions
      </div>
      <div
        data-ui="dynamic-focus"
        style={{ ...box, border: '1px solid rgb(0 0 0 / 35%)', zIndex: 19 }}
      />
    </>
  );
}

function serializeDynamicFrame(frame: FrameData | undefined) {
  if (!frame) return '';
  const {
    borderSettings,
    effectMode,
    height,
    id,
    linkedElementSelector,
    offset,
    pagePlacement,
    width,
    x,
    y,
  } = frame;
  return JSON.stringify({
    borderSettings,
    effectMode,
    height,
    id,
    linkedElementSelector,
    offset,
    pagePlacement,
    width,
    x,
    y,
  });
}

export function DynamicAnchorLifecycleHarness({ scenario }: { scenario: DynamicAnchorScenario }) {
  const [service] = useState(createFrameHostLayoutService);
  const refs = useRef<DynamicRefs>({
    iframe: { current: null },
    nestedHost: { current: null },
    nestedScroller: { current: null },
    slide: { current: null },
    target: { current: null },
    track: { current: null },
  }).current;
  const framesRef = useRef<FrameData[]>([]);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const snapshot = useSyncExternalStore(
    service.subscribe,
    service.getSnapshot,
    service.getSnapshot
  );
  const presentation = snapshot.presentations.get('dynamic-frame') ?? 'suspended';

  useLayoutEffect(
    () => installDynamicAnchorFixture({ framesRef, refs, scenario, service, setFrames }),
    [refs, scenario, service]
  );

  const frame = frames[0];
  return (
    <main
      data-frame-count={frames.length}
      data-frame-id={frame?.id ?? ''}
      data-frame-state={serializeDynamicFrame(frame)}
      data-frame-x={frame?.x ?? ''}
      data-frame-y={frame?.y ?? ''}
      data-presentation={presentation}
      data-scenario={scenario}
      data-ui="dynamic-anchor-lifecycle"
      style={{ fontFamily: 'system-ui, sans-serif', minHeight: 1400, padding: '120px 24px' }}
    >
      <h1 style={{ margin: '0 0 24px' }}>Dynamic anchor lifecycle</h1>
      <DynamicScenarioSurface refs={refs} scenario={scenario} />
      {frame && presentation === 'visible' ? <DynamicFrameLayers frame={frame} /> : null}
      {snapshot.recoveries[0] ? (
        <output data-status={snapshot.recoveries[0].status} data-ui="dynamic-recovery">
          {snapshot.recoveries[0].frameId}
        </output>
      ) : null}
    </main>
  );
}
