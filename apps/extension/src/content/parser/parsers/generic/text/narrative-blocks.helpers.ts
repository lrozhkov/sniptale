import type { DocumentBlock, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { buildElementEvidence, buildElementTargetRef } from '../../../ir/document-evidence';
import { deriveLegacySectionsFromBlocks } from '../../../ir/document-blocks';
import { generateId, generateStableId } from '../../../dom-utils/id-generator';
import { extractNarrativeText, setSniptaleId } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import type { GenericContentExtraction } from '../types';

const GENERIC_NARRATIVE_NODE_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'p',
  'ul',
  'ol',
  'blockquote',
  'pre',
  '[data-sc-normalized-kind="callout"]',
  '[data-sc-normalized-kind="code"]',
].join(', ');

type NarrativeBlockKind = Extract<
  DocumentBlock['kind'],
  'paragraph' | 'quote' | 'callout' | 'code'
>;

type ExtractGenericNarrativeContentOptions = {
  ctx: TraversalContext;
  root: HTMLElement;
  fallbackTitle: string;
  isContentElement: (element: HTMLElement) => boolean;
  minParagraphLength?: number;
};

function createNarrativeSection(title: string): SectionNode {
  return {
    type: 'section',
    id: generateId('section'),
    title,
    children: [],
    selected: true,
    kind: 'narrative',
  };
}

function createNarrativeHeadingBlock(
  section: SectionNode,
  title: string,
  element?: HTMLElement
): DocumentBlock {
  return {
    id: generateId('block'),
    sectionId: section.id,
    kind: 'heading',
    text: title,
    ...(element ? { evidence: buildElementEvidence(element) } : {}),
  };
}

function createNarrativeBlockId(element: HTMLElement, ctx: TraversalContext): string {
  const blockId = generateStableId('block', element, ctx.globalFieldIndex);
  ctx.globalFieldIndex += 1;
  setSniptaleId(element, blockId);
  return blockId;
}

function createNarrativeTextBlock(
  ctx: TraversalContext,
  sectionId: string,
  element: HTMLElement,
  kind: NarrativeBlockKind
): DocumentBlock | null {
  const text = extractNarrativeText(element);
  if (!text || text.length < 3) {
    return null;
  }

  const blockId = createNarrativeBlockId(element, ctx);

  return {
    id: blockId,
    sectionId,
    kind,
    text,
    evidence: buildElementEvidence(element, {
      excerpt: text,
    }),
    ...(() => {
      const targetRef = buildElementTargetRef(element, true, blockId);
      return targetRef === undefined ? {} : { targetRef };
    })(),
  };
}

function createNarrativeListBlock(
  ctx: TraversalContext,
  sectionId: string,
  element: HTMLElement
): DocumentBlock | null {
  const items = Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI')
    .map((item) => extractNarrativeText(item))
    .filter((text) => text.length >= 3);

  if (items.length === 0) {
    return null;
  }

  const blockId = createNarrativeBlockId(element, ctx);

  return {
    id: blockId,
    sectionId,
    kind: 'list',
    items,
    evidence: buildElementEvidence(element),
    ...(() => {
      const targetRef = buildElementTargetRef(element, false, blockId);
      return targetRef === undefined ? {} : { targetRef };
    })(),
  };
}

function collectNarrativeNodes(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(GENERIC_NARRATIVE_NODE_SELECTOR));
}

function createFallbackSection(
  root: HTMLElement,
  fallbackTitle: string,
  sections: SectionNode[],
  blocks: DocumentBlock[]
): SectionNode {
  const heading = root.querySelector('h1');
  const title =
    (heading instanceof HTMLElement ? extractNarrativeText(heading) : '') || fallbackTitle;
  const section = createNarrativeSection(title);
  sections.push(section);
  blocks.push(
    createNarrativeHeadingBlock(
      section,
      title,
      heading instanceof HTMLElement ? heading : undefined
    )
  );
  return section;
}

function ensureNarrativeSection(
  root: HTMLElement,
  currentSection: SectionNode | null,
  fallbackTitle: string,
  sections: SectionNode[],
  blocks: DocumentBlock[]
): SectionNode {
  return currentSection ?? createFallbackSection(root, fallbackTitle, sections, blocks);
}

function createNarrativeContentBlock(
  ctx: TraversalContext,
  sectionId: string,
  node: HTMLElement,
  minParagraphLength: number
): DocumentBlock | null {
  if (node.matches('ul, ol')) {
    return createNarrativeListBlock(ctx, sectionId, node);
  }

  if (node.matches('blockquote, [data-sc-normalized-kind="callout"]')) {
    const kind = node.matches('blockquote') ? 'quote' : 'callout';
    return createNarrativeTextBlock(ctx, sectionId, node, kind);
  }

  if (node.matches('pre, [data-sc-normalized-kind="code"]')) {
    return createNarrativeTextBlock(ctx, sectionId, node, 'code');
  }

  const paragraphBlock = createNarrativeTextBlock(ctx, sectionId, node, 'paragraph');
  if (!paragraphBlock?.text || paragraphBlock.text.length < minParagraphLength) {
    return null;
  }

  return paragraphBlock;
}

function startNarrativeSection(
  node: HTMLElement,
  sections: SectionNode[],
  blocks: DocumentBlock[]
): SectionNode | null {
  const title = extractNarrativeText(node);
  if (!title) {
    return null;
  }

  const section = createNarrativeSection(title);
  sections.push(section);
  blocks.push(createNarrativeHeadingBlock(section, title, node));
  return section;
}

export function extractGenericNarrativeContent({
  ctx,
  root,
  fallbackTitle,
  isContentElement,
  minParagraphLength = 20,
}: ExtractGenericNarrativeContentOptions): GenericContentExtraction {
  const sections: SectionNode[] = [];
  const blocks: DocumentBlock[] = [];
  let currentSection: SectionNode | null = null;

  collectNarrativeNodes(root).forEach((node) => {
    if (!isContentElement(node)) {
      return;
    }

    if (node.matches('h1, h2, h3')) {
      currentSection = startNarrativeSection(node, sections, blocks);
      return;
    }

    const resolvedSection = ensureNarrativeSection(
      root,
      currentSection,
      fallbackTitle,
      sections,
      blocks
    );
    currentSection = resolvedSection;

    const block = createNarrativeContentBlock(ctx, resolvedSection.id, node, minParagraphLength);
    if (block) {
      blocks.push(block);
    }
  });

  return {
    sections: deriveLegacySectionsFromBlocks(sections, blocks),
    blocks,
  };
}
