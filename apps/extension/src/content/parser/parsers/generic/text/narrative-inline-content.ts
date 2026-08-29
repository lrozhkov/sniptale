import type { DocumentInlineNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { resolveOriginalElement } from '../../../dom-utils/dom-helpers';

const IGNORED_INLINE_SELECTOR = [
  'script',
  'style',
  'template',
  'noscript',
  'input',
  'select',
  'textarea',
  'button',
  'svg',
  'canvas',
  'iframe',
].join(', ');
const HIDDEN_CLASS_PATTERN = /(?:^|\s)(?:hidden|invisible)(?:\s|$)/iu;
const HIDDEN_STYLE_PATTERN = /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)/iu;
const SAFE_LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:'];
const SAFE_IMAGE_PROTOCOLS: readonly string[] = ['http:', 'https:'];

function isHiddenElement(element: HTMLElement): boolean {
  return (
    element.hidden === true ||
    element.getAttribute('aria-hidden') === 'true' ||
    HIDDEN_CLASS_PATTERN.test(element.className) ||
    HIDDEN_STYLE_PATTERN.test(element.getAttribute('style') ?? '')
  );
}

function resolveSafeUrl(
  rawValue: string | null | undefined,
  baseUrl: string,
  protocols: readonly string[]
): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  try {
    const resolved = new URL(value, baseUrl || 'https://invalid.sniptale.local/');
    return protocols.includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function resolveImageSource(element: HTMLImageElement, baseUrl: string): string | null {
  const original = resolveOriginalElement(element);
  const originalImage = original instanceof HTMLImageElement ? original : null;
  const candidates = [
    originalImage?.currentSrc,
    originalImage?.getAttribute('src'),
    originalImage?.getAttribute('data-src'),
    originalImage?.getAttribute('data-original'),
    originalImage?.getAttribute('data-lazy-src'),
    element.currentSrc,
    element.getAttribute('src'),
    element.getAttribute('data-src'),
    element.getAttribute('data-original'),
    element.getAttribute('data-lazy-src'),
  ];
  for (const candidate of candidates) {
    const resolved = resolveSafeUrl(candidate, baseUrl, SAFE_IMAGE_PROTOCOLS);
    if (resolved) return resolved;
  }
  return null;
}

function appendText(nodes: DocumentInlineNode[], value: string): void {
  const normalized = value.replace(/\s+/gu, ' ');
  if (!normalized) return;
  const previous = nodes.at(-1);
  if (previous?.kind === 'text') {
    previous.text += normalized;
  } else {
    nodes.push({ kind: 'text', text: normalized });
  }
}

function collectInlineNodes(
  node: Node,
  baseUrl: string,
  inheritedLinkUrl: string | undefined,
  result: DocumentInlineNode[]
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    appendText(result, node.textContent ?? '');
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(IGNORED_INLINE_SELECTOR) || isHiddenElement(node)) return;
  if (node instanceof HTMLBRElement) {
    result.push({ kind: 'line-break' });
    return;
  }

  if (node instanceof HTMLImageElement) {
    const sourceUrl = resolveImageSource(node, baseUrl);
    if (!sourceUrl) return;
    result.push({
      kind: 'image',
      alt: node.alt || node.title || '',
      sourceUrl,
      ...(inheritedLinkUrl ? { linkUrl: inheritedLinkUrl } : {}),
    });
    return;
  }

  if (node instanceof HTMLAnchorElement) {
    const original = resolveOriginalElement(node);
    const originalAnchor = original instanceof HTMLAnchorElement ? original : null;
    const linkUrl =
      resolveSafeUrl(
        originalAnchor?.getAttribute('href') ?? node.getAttribute('href'),
        baseUrl,
        SAFE_LINK_PROTOCOLS
      ) ?? undefined;
    const nested: DocumentInlineNode[] = [];
    node.childNodes.forEach((child) => collectInlineNodes(child, baseUrl, undefined, nested));
    if (!linkUrl) {
      result.push(...nested);
      return;
    }

    nested.forEach((item) => {
      if (item.kind === 'text') {
        result.push({ kind: 'link', text: item.text, url: linkUrl });
      } else if (item.kind === 'image') {
        result.push({ ...item, linkUrl });
      } else {
        result.push(item);
      }
    });
    return;
  }

  node.childNodes.forEach((child) => collectInlineNodes(child, baseUrl, inheritedLinkUrl, result));
}

function trimInlineContent(nodes: DocumentInlineNode[]): DocumentInlineNode[] {
  const normalized = nodes.filter((node, index) => {
    return node.kind !== 'line-break' || (index > 0 && nodes[index - 1]?.kind !== 'line-break');
  });
  const first = normalized[0];
  const last = normalized.at(-1);
  if (first?.kind === 'text') first.text = first.text.trimStart();
  if (last?.kind === 'text') last.text = last.text.trimEnd();
  return normalized.filter((node) => node.kind !== 'text' || node.text.length > 0);
}

export function extractNarrativeInlineContent(
  element: HTMLElement,
  ctx: TraversalContext
): DocumentInlineNode[] {
  const nodes: DocumentInlineNode[] = [];
  const baseUrl = ctx.result.meta?.url ?? '';
  collectInlineNodes(element, baseUrl, undefined, nodes);
  return trimInlineContent(nodes);
}

export function hasInlineMediaOrLinks(nodes: DocumentInlineNode[]): boolean {
  return nodes.some((node) => node.kind === 'link' || node.kind === 'image');
}
