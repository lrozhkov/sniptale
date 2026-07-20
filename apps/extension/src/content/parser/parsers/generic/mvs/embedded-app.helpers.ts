import type { FieldNode, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { getIframeDocument } from '../../../../platform/frame';
import { MVS_APPLICATION_CODE, MVS_BLOCK_SELECTOR } from '../../../dom-tree-parser/mvs/constants';
import { generateId } from '../../../dom-utils/id-generator';
import type { TraversalContext } from '../../types';
import { buildFieldNode, type FieldValueType } from '../forms/fields.helpers';
import {
  extractMeaningfulText,
  resolveBlockTitle,
  resolveLinkValue,
  type MvsTitleInfo,
} from './text.helpers';

type MvsFieldCandidate = {
  label: string;
  linkRef?: string;
  sourceElement: HTMLElement;
  value: string;
  valueType: FieldValueType;
};

function resolveOriginalIframe(container: HTMLElement): HTMLIFrameElement | null {
  const originalIframe = document.getElementById(container.id);
  return originalIframe instanceof HTMLIFrameElement ? originalIframe : null;
}

function getOrCreateCurrentSection(
  container: HTMLElement,
  ctx: TraversalContext,
  iframeDoc: Document
): SectionNode {
  if (ctx.currentSection) {
    return ctx.currentSection;
  }

  const section = {
    type: 'section' as const,
    id: generateId('section'),
    title:
      iframeDoc.title || container.getAttribute('data-application-code') || 'Встроенное приложение',
    children: [],
    selected: true,
  };

  ctx.result.structure.push(section);
  ctx.currentSection = section;
  ctx.sectionIndex += 1;
  return section;
}

function resolveMvsBlocks(iframeDoc: Document): HTMLElement[] {
  return Array.from(iframeDoc.querySelectorAll<HTMLElement>(MVS_BLOCK_SELECTOR)).filter((block) => {
    return block.parentElement?.closest(MVS_BLOCK_SELECTOR) === null;
  });
}

function resolveFieldLabel(text: string): string | null {
  if (!text.includes(':')) {
    return null;
  }

  const label = text.replace(/[:\s]+$/, '').trim();
  if (!label || label.length > 120) {
    return null;
  }

  return label;
}

function tryExtractFieldCandidate(candidate: HTMLElement): MvsFieldCandidate | null {
  const children = Array.from(candidate.children).filter((child): child is HTMLElement => {
    return (
      child.nodeType === Node.ELEMENT_NODE && extractMeaningfulText(child as HTMLElement).length > 0
    );
  });
  if (children.length < 2) {
    return null;
  }

  for (let index = 0; index < children.length - 1; index += 1) {
    const candidateChild = children[index];
    if (candidateChild === undefined) {
      continue;
    }
    const label = resolveFieldLabel(extractMeaningfulText(candidateChild));
    if (!label) {
      continue;
    }

    const valueChildren = children.slice(index + 1);
    const valueElement = valueChildren.length === 1 ? (valueChildren[0] ?? candidate) : candidate;
    const valueData = resolveLinkValue(valueElement);
    if (!valueData.value || valueData.value === label) {
      continue;
    }

    return {
      label,
      sourceElement: candidate,
      value: valueData.value,
      valueType: valueData.valueType,
      ...(valueData.linkRef === undefined ? {} : { linkRef: valueData.linkRef }),
    };
  }

  return null;
}

function resolveBlockFieldCandidates(block: HTMLElement): MvsFieldCandidate[] {
  const acceptedCandidates: HTMLElement[] = [];
  const fields: MvsFieldCandidate[] = [];
  const candidates = Array.from(block.querySelectorAll<HTMLElement>('div, li, p')).reverse();

  for (const candidate of candidates) {
    if (acceptedCandidates.some((accepted) => candidate.contains(accepted))) {
      continue;
    }

    const fieldCandidate = tryExtractFieldCandidate(candidate);
    if (!fieldCandidate) {
      continue;
    }

    acceptedCandidates.push(candidate);
    fields.unshift(fieldCandidate);
  }

  return fields;
}

function createFallbackField(
  block: HTMLElement,
  ctx: TraversalContext,
  title: MvsTitleInfo
): FieldNode {
  return buildFieldNode({
    ctx,
    label: title.text,
    linkRef: title.linkRef,
    sourceElement: block,
    value: title.text,
    valueType: title.linkRef ? 'link' : 'string',
  });
}

function createBlockFields(
  block: HTMLElement,
  ctx: TraversalContext,
  title: MvsTitleInfo
): FieldNode[] {
  const fieldCandidates = resolveBlockFieldCandidates(block);
  if (fieldCandidates.length === 0) {
    return [createFallbackField(block, ctx, title)];
  }

  return fieldCandidates.map((fieldCandidate) =>
    buildFieldNode({
      ctx,
      label: `${title.text} / ${fieldCandidate.label}`,
      linkRef: fieldCandidate.linkRef,
      sourceElement: fieldCandidate.sourceElement,
      value: fieldCandidate.value,
      valueType: fieldCandidate.valueType,
    })
  );
}

/**
 * Extracts MVS card and summary-block fields from the live iframe document.
 */
export function extractMvsEmbeddedAppFields(
  container: HTMLElement,
  ctx: TraversalContext
): FieldNode[] {
  if (container.getAttribute('data-application-code') !== MVS_APPLICATION_CODE) {
    return [];
  }

  const originalIframe = resolveOriginalIframe(container);
  const iframeDoc = originalIframe ? getIframeDocument(originalIframe) : null;
  if (!originalIframe || !iframeDoc) {
    return [];
  }

  getOrCreateCurrentSection(container, ctx, iframeDoc);

  return resolveMvsBlocks(iframeDoc).flatMap((block) => {
    const title = resolveBlockTitle(block);
    if (!title) {
      return [];
    }

    return createBlockFields(block, ctx, title);
  });
}
