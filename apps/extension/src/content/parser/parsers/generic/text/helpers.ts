import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import type { GenericContentExtraction } from '../types';

type GenericExtractionKind = 'search' | 'docs' | 'article';

function summarizeSectionChild(child: SectionNode['children'][number]): string {
  if (child.type === 'field') {
    return JSON.stringify({
      contentRole: child.contentRole ?? '',
      label: child.label,
      type: 'field',
      value: child.value,
      valueType: child.valueType,
    });
  }

  return JSON.stringify({
    headers: child.headers,
    rows: child.rows.map((row) => row.data),
    type: 'table',
  });
}

function buildSectionMergeKey(section: SectionNode): string {
  return [section.title, section.kind ?? '', ...section.children.map(summarizeSectionChild)].join(
    '::'
  );
}

function countTableRows(sections: SectionNode[]): number {
  return sections.reduce((sectionSum, section) => {
    return (
      sectionSum +
      section.children.reduce((childSum, child) => {
        return child.type === 'table' ? childSum + child.rows.length : childSum;
      }, 0)
    );
  }, 0);
}

function countTables(sections: SectionNode[]): number {
  return sections.reduce((sectionSum, section) => {
    return sectionSum + section.children.filter((child) => child.type === 'table').length;
  }, 0);
}

function countNarrativeFields(sections: SectionNode[]): number {
  return sections.reduce((sectionSum, section) => {
    return (
      sectionSum +
      section.children.filter((child) => child.type === 'field' && child.contentRole !== 'property')
        .length
    );
  }, 0);
}

function resolveContextPageMetadata(ctx: TraversalContext): { pageTitle: string; pageUrl: string } {
  return {
    pageTitle: ctx.result.meta?.title ?? ctx.result.title,
    pageUrl: ctx.result.meta?.url ?? '',
  };
}

export function resolveGenericFallbackTitle(ctx: TraversalContext, fallbackTitle: string): string {
  return resolveContextPageMetadata(ctx).pageTitle || fallbackTitle;
}

export function hasExplicitSearchSignal(ctx: TraversalContext): boolean {
  const { pageTitle, pageUrl } = resolveContextPageMetadata(ctx);
  const title = pageTitle.toLowerCase();
  const href = pageUrl.toLowerCase();
  const searchTerms = ['search', 'results', 'query', 'find', 'lookup', 'поиск', 'результаты'];

  if (searchTerms.some((term) => title.includes(term) || href.includes(term))) {
    return true;
  }

  try {
    const url = new URL(pageUrl || 'https://example.test');
    return ['q', 'query', 'search', 'text', 'wd'].some((param) => {
      return Boolean(url.searchParams.get(param)?.trim());
    });
  } catch {
    return false;
  }
}

export function mergeGenericExtractions(
  primary: GenericContentExtraction,
  secondary: GenericContentExtraction
): GenericContentExtraction {
  if (primary.sections.length === 0) {
    return secondary;
  }

  const sectionKeys = new Set(primary.sections.map(buildSectionMergeKey));
  const uniqueSecondarySections = secondary.sections.filter((section) => {
    return !sectionKeys.has(buildSectionMergeKey(section));
  });
  const sectionIds = new Set(uniqueSecondarySections.map((section) => section.id));
  const uniqueSecondaryBlocks = secondary.blocks.filter((block) => sectionIds.has(block.sectionId));

  return {
    sections: [...primary.sections, ...uniqueSecondarySections],
    blocks: [...primary.blocks, ...uniqueSecondaryBlocks],
    ...(primary.replaceStructure || secondary.replaceStructure ? { replaceStructure: true } : {}),
  };
}

function scoreGenericExtraction(
  kind: GenericExtractionKind,
  extraction: GenericContentExtraction,
  ctx: TraversalContext,
  root: HTMLElement
): number {
  const sectionCount = extraction.sections.length;
  const blockCount = extraction.blocks.length;
  const tableCount = countTables(extraction.sections);
  const rowCount = countTableRows(extraction.sections);
  const narrativeFieldCount = countNarrativeFields(extraction.sections);
  const longFormParagraphs = Array.from(root.querySelectorAll<HTMLElement>('p')).filter(
    (paragraph) => {
      return (paragraph.textContent?.trim().length ?? 0) >= 280;
    }
  ).length;

  if (kind === 'search') {
    return (
      sectionCount * 25 +
      rowCount * 18 +
      tableCount * 20 +
      (hasExplicitSearchSignal(ctx) ? 90 : 0) -
      longFormParagraphs * 70
    );
  }

  if (kind === 'docs') {
    return sectionCount * 28 + blockCount * 12 + tableCount * 35 + narrativeFieldCount * 6;
  }

  return sectionCount * 24 + blockCount * 10 + narrativeFieldCount * 8 + tableCount * 10;
}

export function shouldPreferSearchExtraction(
  searchExtraction: GenericContentExtraction,
  docsExtraction: GenericContentExtraction,
  articleExtraction: GenericContentExtraction,
  ctx: TraversalContext,
  root: HTMLElement
): boolean {
  if (searchExtraction.sections.length === 0) {
    return false;
  }

  if (hasExplicitSearchSignal(ctx)) {
    return true;
  }

  if (docsExtraction.sections.length === 0 && articleExtraction.sections.length === 0) {
    return true;
  }

  const searchScore = scoreGenericExtraction('search', searchExtraction, ctx, root);
  const docsScore = scoreGenericExtraction('docs', docsExtraction, ctx, root);
  const articleScore = scoreGenericExtraction('article', articleExtraction, ctx, root);

  return searchScore >= Math.max(docsScore, articleScore) + 25;
}
