import type { FrameData } from '../../../features/highlighter/contracts';
import type {
  BrowserAnnotationViewport,
  BrowserFrameAnnotationInput,
} from '../../parser/page-preparation/annotations';

function readCalloutNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (!(node instanceof Element)) {
    return '';
  }
  if (node.localName === 'br') {
    return '\n';
  }

  const content = Array.from(node.childNodes, readCalloutNode).join('');
  return node.localName === 'div' || node.localName === 'p' ? `${content}\n` : content;
}

function readCalloutText(frame: FrameData): string | undefined {
  if (frame.callout?.enabled !== true) {
    return undefined;
  }

  const parsed = new DOMParser().parseFromString(frame.callout.htmlContent, 'text/html');
  const text = Array.from(parsed.body.childNodes, readCalloutNode).join('').replace(/\n$/, '');
  return text.trim() === '' ? undefined : text;
}

function readOptionalName(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function createFrameInput(
  frame: FrameData,
  pageUrl: string,
  viewport: BrowserAnnotationViewport
): BrowserFrameAnnotationInput {
  const linkedElementSelector = readOptionalName(frame.linkedElementSelector);
  const borderPresetName = readOptionalName(frame.borderSettings?.name);
  const comment = readCalloutText(frame);

  return {
    frameId: frame.id,
    kind: linkedElementSelector ? 'linked' : 'free',
    pageUrl,
    rect: {
      height: frame.height,
      width: frame.width,
      x: frame.x,
      y: frame.y,
    },
    viewport: { ...viewport },
    ...(borderPresetName ? { borderPresetName } : {}),
    ...(comment ? { comment } : {}),
    ...(linkedElementSelector ? { linkedElementSelector } : {}),
  };
}

function frameInputsEqual(
  left: BrowserFrameAnnotationInput,
  right: BrowserFrameAnnotationInput
): boolean {
  return (
    left.borderPresetName === right.borderPresetName &&
    left.comment === right.comment &&
    left.frameId === right.frameId &&
    left.kind === right.kind &&
    left.linkedElementSelector === right.linkedElementSelector &&
    left.pageUrl === right.pageUrl &&
    left.rect.height === right.rect.height &&
    left.rect.width === right.rect.width &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.viewport.height === right.viewport.height &&
    left.viewport.width === right.viewport.width
  );
}

function resolveFrameAnnotationContext(context?: {
  pageUrl: string;
  viewport: BrowserAnnotationViewport;
}) {
  return (
    context ?? {
      pageUrl: window.location.href,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  );
}

/** Projects committed user-created frames into minimal annotation-session evidence. */
export function createBrowserFrameAnnotationInputs(
  frames: readonly FrameData[],
  context?: { pageUrl: string; viewport: BrowserAnnotationViewport }
): BrowserFrameAnnotationInput[] {
  const resolvedContext = resolveFrameAnnotationContext(context);
  return frames
    .filter((frame) => frame.createdBy !== 'auto-blur')
    .map((frame) => createFrameInput(frame, resolvedContext.pageUrl, resolvedContext.viewport));
}

/** Selects only evidence changed by this command while retaining the complete removal inventory. */
export function createBrowserFrameAnnotationSync(
  beforeFrames: readonly FrameData[],
  afterFrames: readonly FrameData[],
  context?: { pageUrl: string; viewport: BrowserAnnotationViewport }
) {
  const resolvedContext = resolveFrameAnnotationContext(context);
  const beforeInputs = createBrowserFrameAnnotationInputs(beforeFrames, resolvedContext);
  const inputs = createBrowserFrameAnnotationInputs(afterFrames, resolvedContext);

  return {
    inputs,
    updatedFrameIds: inputs
      .filter((input) => {
        const before = beforeInputs.find((entry) => entry.frameId === input.frameId);
        return !before || !frameInputsEqual(before, input);
      })
      .map((input) => input.frameId),
  };
}
