import { browserTabs } from '@sniptale/platform/browser/tabs';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

import { captureAndStitchFullPageTiles } from '../../../apps/extension/src/background/capture/full-page/capture-parts';
import { createNativeFullPageRasterBackend } from '../../../apps/extension/src/background/capture/full-page/native-backend';
import { createFullPageTilePlan } from '../../../apps/extension/src/background/capture/full-page/planner';
import type { FullPagePageAgentTransport } from '../../../apps/extension/src/background/capture/full-page/page-agent-transport';
import { runNativeVisibleCaptureExclusive } from '../../../apps/extension/src/background/capture/visible/coordinator';
import { createFullPageCaptureAgent } from '../../../apps/extension/src/content/application/full-page-capture';
import type {
  FullPageCaptureMetadata,
  FullPageCapturePreferences,
  FullPageCapturePrepareResult,
  FullPageCaptureSessionIdentity,
  FullPageCaptureTileState,
} from '../../../apps/extension/src/contracts/full-page-capture';

type HarnessState = {
  animationPlayState: string;
  lazyLoaded: boolean;
  motionStylePresent: boolean;
  rootStyle: string | null;
  scrollX: number;
  scrollY: number;
  scrollbarClassPresent: boolean;
  scrollerStyle: string | null;
};

type CaptureSummary = {
  dataUrlLength: number;
  metadata: FullPageCaptureMetadata;
};

type FullPageCaptureHarness = {
  capture(): Promise<CaptureSummary>;
  sample(points: Array<{ x: number; y: number }>): Promise<number[][]>;
  setScroll(x: number, y: number): void;
  state(): HarnessState;
};

declare global {
  interface Window {
    __sniptaleFullPageCaptureHarness?: FullPageCaptureHarness;
  }
}

const MARKER_SIZE = 50;
const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: sans-serif; }
  .fixture-marker { position: absolute; width: ${MARKER_SIZE}px; height: ${MARKER_SIZE}px; }
  .fixture-animated { animation: fixture-drift 0.4s linear infinite alternate; }
  @keyframes fixture-drift { from { transform: translateX(0); } to { transform: translateX(8px); } }
`;
document.head.append(style);

function marker(parent: HTMLElement, id: string, x: number, y: number, color: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'fixture-marker';
  element.dataset.marker = id;
  Object.assign(element.style, { background: color, left: `${x}px`, top: `${y}px` });
  parent.append(element);
  return element;
}

function installLazyMarker(element: HTMLElement): void {
  element.style.background = '#94a3b8';
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    element.style.background = '#00ffff';
    element.dataset.loaded = 'true';
    observer.disconnect();
  });
  observer.observe(element);
}

function buildDocumentFixture(): void {
  document.documentElement.style.cssText =
    'scroll-behavior: smooth; scroll-snap-type: y mandatory; overflow-anchor: auto;';
  const surface = document.createElement('main');
  surface.style.cssText =
    'display:flow-root;position:relative;width:1400px;height:1800px;background:#f3f4f6;';
  document.body.append(surface);
  marker(surface, 'top', 100, 100, '#ff0000');
  marker(surface, 'middle', 100, 850, '#00ff00');
  marker(surface, 'bottom', 100, 1600, '#0000ff');
  marker(surface, 'right', 1200, 900, '#ff00ff');
  const lazy = marker(surface, 'lazy', 1000, 1450, '#94a3b8');
  installLazyMarker(lazy);

  const animated = marker(surface, 'animated', 500, 820, '#f97316');
  animated.classList.add('fixture-animated');

  const sticky = document.createElement('div');
  sticky.dataset.marker = 'sticky';
  sticky.style.cssText =
    'position:sticky;top:110px;margin-top:650px;margin-left:260px;width:180px;height:42px;background:#a855f7;';
  surface.append(sticky);

  const header = document.createElement('header');
  header.dataset.floating = 'header';
  header.style.cssText =
    'position:fixed;z-index:20;left:0;right:0;top:0;height:96px;background:#111827;';
  document.body.append(header);
  const footer = document.createElement('footer');
  footer.dataset.floating = 'footer';
  footer.style.cssText =
    'position:fixed;z-index:20;left:0;right:0;bottom:0;height:80px;background:#0f766e;';
  document.body.append(footer);
  const sidebar = document.createElement('aside');
  sidebar.dataset.floating = 'sidebar';
  sidebar.style.cssText =
    'position:fixed;z-index:19;left:0;top:96px;bottom:80px;width:92px;background:#334155;';
  document.body.append(sidebar);
}

function buildInternalScrollerFixture(): void {
  document.documentElement.style.cssText =
    'height:100%;overflow:hidden;scroll-behavior:smooth;scroll-snap-type:y mandatory;overflow-anchor:auto;';
  document.body.style.cssText = 'height:100%;overflow:hidden;background:#dbeafe;';
  const shellHeader = document.createElement('header');
  shellHeader.style.cssText =
    'position:fixed;z-index:5;left:0;right:0;top:0;height:60px;background:#111827;';
  document.body.append(shellHeader);
  const shellSidebar = document.createElement('aside');
  shellSidebar.style.cssText =
    'position:fixed;z-index:5;left:0;top:60px;bottom:0;width:70px;background:#334155;';
  document.body.append(shellSidebar);
  const scroller = document.createElement('section');
  scroller.id = 'fixture-scroller';
  scroller.style.cssText = [
    'position:fixed;left:70px;right:20px;top:60px;bottom:20px;overflow:auto;',
    'scroll-behavior:smooth;scroll-snap-type:both mandatory;overflow-anchor:auto;',
  ].join('');
  const inner = document.createElement('div');
  inner.style.cssText = 'position:relative;width:1200px;height:1500px;background:#fefce8;';
  marker(inner, 'internal-top', 100, 100, '#ff0000');
  marker(inner, 'internal-middle', 100, 700, '#00ff00');
  marker(inner, 'internal-bottom-right', 1050, 1300, '#0000ff');
  const lazy = marker(inner, 'internal-lazy', 900, 1150, '#94a3b8');
  installLazyMarker(lazy);
  scroller.append(inner);
  document.body.append(scroller);
}

const internalMode = new URLSearchParams(location.search).get('root') === 'internal';
if (internalMode) buildInternalScrollerFixture();
else buildDocumentFixture();

function requireResult<T>(response: {
  error?: string | undefined;
  result?: T | undefined;
  success?: boolean | undefined;
}): T {
  if (response.success !== true || response.result === undefined) {
    throw new Error(response.error ?? 'Direct full-page agent request failed');
  }
  return response.result;
}

function createDirectAgentTransport(): {
  dispose(): void;
  transport: FullPagePageAgentTransport;
} {
  const agent = createFullPageCaptureAgent();
  const transport = {
    async heartbeat(identity: FullPageCaptureSessionIdentity) {
      const response = await agent.handle({
        type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE,
        ...identity,
      });
      if (!response.success) throw new Error('Direct full-page agent heartbeat failed');
    },
    async prepare(
      identity: FullPageCaptureSessionIdentity,
      preferences: FullPageCapturePreferences
    ): Promise<FullPageCapturePrepareResult> {
      const response = await agent.handle({
        type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
        ...identity,
        preferences,
      });
      return requireResult(
        response as { result?: FullPageCapturePrepareResult; success?: boolean }
      );
    },
    async prepareTile(tile: Parameters<FullPagePageAgentTransport['prepareTile']>[0]) {
      const response = await agent.handle({ type: MessageType.PREPARE_FULL_PAGE_TILE, ...tile });
      return requireResult(response as { result?: FullPageCaptureTileState; success?: boolean });
    },
    async verifyTile(
      tile: Parameters<FullPagePageAgentTransport['verifyTile']>[0],
      layoutGeneration: string
    ) {
      const response = await agent.handle({
        type: MessageType.VERIFY_FULL_PAGE_TILE,
        ...tile,
        layoutGeneration,
      });
      return requireResult(response as { result?: FullPageCaptureTileState; success?: boolean });
    },
    async restore(identity: FullPageCaptureSessionIdentity) {
      const response = await agent.handle({
        type: MessageType.RESTORE_FULL_PAGE_CAPTURE,
        ...identity,
      });
      if (!response.success) throw new Error('Direct full-page agent restore failed');
    },
  } satisfies FullPagePageAgentTransport;
  return { dispose: () => agent.dispose(), transport };
}

let lastDataUrl: string | null = null;

async function capture(): Promise<CaptureSummary> {
  const [tab] = await browserTabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number') throw new Error('Full-page harness active tab is unavailable');
  const identity = {
    jobId: crypto.randomUUID(),
    ownerToken: crypto.randomUUID(),
    runtimeGeneration: 'full-page-e2e',
  };
  const directAgent = createDirectAgentTransport();
  let prepared = false;
  try {
    const result = await runNativeVisibleCaptureExclusive(async (lease) => {
      const raster = await createNativeFullPageRasterBackend({ lease, tabId: tab.id as number });
      try {
        const page = await directAgent.transport.prepare(identity, {
          floatingElements: 'once',
          freezeMotion: true,
          preloadLazyContent: true,
        });
        prepared = true;
        return await captureAndStitchFullPageTiles({
          agent: directAgent.transport,
          identity,
          layoutGeneration: page.layoutGeneration,
          options: { format: 'png' },
          plans: createFullPageTilePlan(page.geometry),
          raster,
          renewLease: async () => undefined,
          warnings: page.warnings,
          async beforeFinish() {
            await directAgent.transport.restore(identity);
            prepared = false;
          },
        });
      } finally {
        await raster.release();
      }
    });
    lastDataUrl = result.dataUrl;
    return { dataUrlLength: result.dataUrl.length, metadata: result.metadata };
  } finally {
    if (prepared) await directAgent.transport.restore(identity);
    directAgent.dispose();
  }
}

function getScrollRoot(): HTMLElement | null {
  return document.getElementById('fixture-scroller');
}

async function sample(points: Array<{ x: number; y: number }>): Promise<number[][]> {
  if (!lastDataUrl) throw new Error('Full-page harness has no captured image');
  const bitmap = await createImageBitmap(await (await fetch(lastDataUrl)).blob());
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Full-page harness could not create sampling context');
    context.drawImage(bitmap, 0, 0);
    return points.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data));
  } finally {
    bitmap.close();
  }
}

window.__sniptaleFullPageCaptureHarness = {
  capture,
  sample,
  setScroll(x, y) {
    const root = getScrollRoot();
    const target = root ?? document.documentElement;
    const priorValue = target.style.getPropertyValue('scroll-behavior');
    const priorPriority = target.style.getPropertyPriority('scroll-behavior');
    target.style.setProperty('scroll-behavior', 'auto', 'important');
    if (root) root.scrollTo(x, y);
    else window.scrollTo(x, y);
    target.style.setProperty('scroll-behavior', priorValue, priorPriority);
  },
  state() {
    const root = getScrollRoot();
    const animated = document.querySelector<HTMLElement>('.fixture-animated');
    return {
      animationPlayState: animated ? getComputedStyle(animated).animationPlayState : 'none',
      lazyLoaded:
        document
          .querySelector('[data-marker="lazy"], [data-marker="internal-lazy"]')
          ?.getAttribute('data-loaded') === 'true',
      motionStylePresent: document.getElementById('sniptale-full-page-motion-freeze') !== null,
      rootStyle: document.documentElement.getAttribute('style'),
      scrollX: root?.scrollLeft ?? window.scrollX,
      scrollY: root?.scrollTop ?? window.scrollY,
      scrollbarClassPresent: document.documentElement.classList.contains(
        'sniptale-full-page-scrollbar-hidden'
      ),
      scrollerStyle: root?.getAttribute('style') ?? null,
    };
  },
};
