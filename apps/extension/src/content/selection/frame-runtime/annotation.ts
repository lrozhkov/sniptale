import type { FrameData } from '../../../features/highlighter/contracts';
import type {
  BrowserAnnotationViewport,
  BrowserFrameAnnotationInput,
} from '../../parser/page-preparation/annotations';
import { areBrowserFrameAnnotationsEqual } from '../../parser/page-preparation/annotations';
import { getFrameCallouts } from '../../../features/highlighter/frame-annotation/callout/collection';

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
  const text = getFrameCallouts(frame)
    .filter((callout) => callout.enabled)
    .map((callout) => {
      const parsed = new DOMParser().parseFromString(callout.content.bodyHtml, 'text/html');
      const body = Array.from(parsed.body.childNodes, readCalloutNode)
        .join('')
        .replace(/\n$/, '')
        .trim();
      const title = callout.style.title.enabled ? callout.content.titleText.trim() : '';
      return [title, body].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
  return text === '' ? undefined : text;
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
  const borderPresetName = readOptionalName(frame.borderSettings?.sourcePresetName);
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
        return !before || !areBrowserFrameAnnotationsEqual(before, input);
      })
      .map((input) => input.frameId),
  };
}
