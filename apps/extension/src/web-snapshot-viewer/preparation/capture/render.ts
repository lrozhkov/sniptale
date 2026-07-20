import type {
  ViewerCaptureDocumentMetrics,
  ViewerCaptureMode,
  ViewerCaptureViewport,
} from './types';

type ViewerCaptureCanvas = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

type ViewerCaptureDrawArgs = {
  context: CanvasRenderingContext2D;
  metrics: ViewerCaptureDocumentMetrics;
  win: Window;
};

type PositionedRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const SKIPPED_ELEMENT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'TITLE']);

function resolveViewport(iframe: HTMLIFrameElement): ViewerCaptureViewport {
  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  const element = frameDocument?.documentElement;

  return {
    height: iframe.clientHeight || frameWindow?.innerHeight || element?.clientHeight || 1,
    width: iframe.clientWidth || frameWindow?.innerWidth || element?.clientWidth || 1,
  };
}

function resolveFullDocumentSize(documentElement: HTMLElement, body: HTMLElement | null) {
  return {
    height: Math.max(
      documentElement.scrollHeight,
      documentElement.offsetHeight,
      documentElement.clientHeight,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0
    ),
    width: Math.max(
      documentElement.scrollWidth,
      documentElement.offsetWidth,
      documentElement.clientWidth,
      body?.scrollWidth ?? 0,
      body?.offsetWidth ?? 0
    ),
  };
}

export function resolveViewerCaptureMetrics(
  iframe: HTMLIFrameElement,
  mode: ViewerCaptureMode
): ViewerCaptureDocumentMetrics {
  const frameDocument = iframe.contentDocument;
  const documentElement = frameDocument?.documentElement;
  if (!frameDocument || !documentElement) {
    throw new Error('Web snapshot viewer frame is not ready for capture.');
  }

  const viewport = resolveViewport(iframe);
  const fullSize = resolveFullDocumentSize(documentElement, frameDocument.body);
  if (mode === 'full') {
    return {
      captureHeight: fullSize.height,
      captureWidth: fullSize.width,
      offsetX: 0,
      offsetY: 0,
    };
  }

  return {
    captureHeight: viewport.height,
    captureWidth: viewport.width,
    offsetX: frameDocument.defaultView?.scrollX ?? 0,
    offsetY: frameDocument.defaultView?.scrollY ?? 0,
  };
}

function createViewerCaptureCanvas(metrics: ViewerCaptureDocumentMetrics): ViewerCaptureCanvas {
  const scale = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Web snapshot viewer capture canvas is unavailable.');
  }

  canvas.width = Math.max(1, Math.round(metrics.captureWidth * scale));
  canvas.height = Math.max(1, Math.round(metrics.captureHeight * scale));
  context.scale(scale, scale);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, metrics.captureWidth, metrics.captureHeight);
  return { canvas, context };
}

function resolveDocumentRect(
  rect: DOMRect,
  win: Window,
  metrics: ViewerCaptureDocumentMetrics
): PositionedRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.left + win.scrollX - metrics.offsetX,
    y: rect.top + win.scrollY - metrics.offsetY,
  };
}

function isRectVisible(rect: PositionedRect, metrics: ViewerCaptureDocumentMetrics): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < metrics.captureWidth &&
    rect.y < metrics.captureHeight &&
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0
  );
}

function isTransparentColor(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color === '';
}

function drawElementBox(element: Element, rect: PositionedRect, args: ViewerCaptureDrawArgs): void {
  if (!isRectVisible(rect, args.metrics)) {
    return;
  }

  const style = args.win.getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
    return;
  }

  if (!isTransparentColor(style.backgroundColor)) {
    args.context.fillStyle = style.backgroundColor;
    args.context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  drawElementBorder({ context: args.context, rect, style });
}

function drawElementBorder(args: {
  context: CanvasRenderingContext2D;
  rect: PositionedRect;
  style: CSSStyleDeclaration;
}): void {
  const borderWidth = Number.parseFloat(args.style.borderTopWidth || '0');
  if (borderWidth <= 0 || args.style.borderStyle === 'none') {
    return;
  }

  args.context.save();
  args.context.lineWidth = borderWidth;
  args.context.strokeStyle = args.style.borderTopColor || '#000000';
  args.context.strokeRect(args.rect.x, args.rect.y, args.rect.width, args.rect.height);
  args.context.restore();
}

function drawImageElement(
  element: HTMLImageElement,
  rect: PositionedRect,
  args: ViewerCaptureDrawArgs
): void {
  if (!element.complete || element.naturalWidth <= 0 || !isRectVisible(rect, args.metrics)) {
    return;
  }

  try {
    args.context.drawImage(element, rect.x, rect.y, rect.width, rect.height);
  } catch {
    // Snapshot capture should remain available even when one embedded asset cannot be rasterized.
  }
}

function drawTextNode(node: Text, args: ViewerCaptureDrawArgs): void {
  const text = node.textContent?.replace(/\s+/g, ' ').trim();
  const parent = node.parentElement;
  if (!text || !parent || SKIPPED_ELEMENT_TAGS.has(parent.tagName)) {
    return;
  }

  const style = args.win.getComputedStyle(parent);
  const range = parent.ownerDocument.createRange();
  range.selectNodeContents(node);
  drawTextRange({ range, style, text, ...args });
  range.detach();
}

function drawTextRange(
  args: ViewerCaptureDrawArgs & {
    range: Range;
    style: CSSStyleDeclaration;
    text: string;
  }
): void {
  const rect = Array.from(args.range.getClientRects()).find((item) => item.width > 0);
  if (!rect) {
    return;
  }

  const area = resolveDocumentRect(rect, args.win, args.metrics);
  if (!isRectVisible(area, args.metrics)) {
    return;
  }

  args.context.save();
  args.context.fillStyle = args.style.color || '#111827';
  args.context.font = args.style.font || `${args.style.fontSize} ${args.style.fontFamily}`;
  args.context.textBaseline = 'top';
  args.context.fillText(args.text, area.x, area.y, Math.max(1, args.metrics.captureWidth - area.x));
  args.context.restore();
}

function drawSnapshotNode(node: Node, args: ViewerCaptureDrawArgs): void {
  if (node.nodeType === Node.TEXT_NODE) {
    drawTextNode(node as Text, args);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  if (SKIPPED_ELEMENT_TAGS.has(element.tagName)) {
    return;
  }

  const rect = resolveDocumentRect(element.getBoundingClientRect(), args.win, args.metrics);
  drawElementBox(element, rect, args);
  if (element.tagName === 'IMG') {
    drawImageElement(element as HTMLImageElement, rect, args);
  }
}

function drawSnapshotDocument(
  frameDocument: Document,
  metrics: ViewerCaptureDocumentMetrics,
  capture: ViewerCaptureCanvas
): void {
  const win = frameDocument.defaultView;
  if (!win) {
    throw new Error('Web snapshot viewer frame window is not ready for capture.');
  }

  const rootRect = frameDocument.documentElement.getBoundingClientRect();
  drawElementBox(frameDocument.documentElement, resolveDocumentRect(rootRect, win, metrics), {
    context: capture.context,
    metrics,
    win,
  });

  const walker = frameDocument.createTreeWalker(
    frameDocument.body ?? frameDocument,
    win.NodeFilter.SHOW_ELEMENT | win.NodeFilter.SHOW_TEXT
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    drawSnapshotNode(node, { context: capture.context, metrics, win });
  }
}

export async function renderViewerFrameToDataUrl(
  iframe: HTMLIFrameElement,
  mode: ViewerCaptureMode
): Promise<string> {
  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    throw new Error('Web snapshot viewer frame is not ready for capture.');
  }

  const metrics = resolveViewerCaptureMetrics(iframe, mode);
  const capture = createViewerCaptureCanvas(metrics);
  drawSnapshotDocument(frameDocument, metrics, capture);
  return capture.canvas.toDataURL('image/png');
}
