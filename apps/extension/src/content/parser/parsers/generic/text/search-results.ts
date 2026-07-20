import type {
  DocumentBlock,
  SectionNode,
  TableNode,
  TableRow,
} from '@sniptale/runtime-contracts/dom-tree';
import { buildElementEvidence } from '../../../ir/document-evidence';
import { generateId, generateStableId } from '../../../dom-utils/id-generator';
import { extractCleanText, getSelector, setSniptaleId } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import { hasExplicitSearchSignal } from './helpers';
import type { GenericContentExtraction } from '../types';

type SearchResultCandidate = {
  container: HTMLElement;
  href: string;
  source: string;
  snippet: string;
  title: string;
};

function resolveSearchResultSourceHostname(ctx: TraversalContext, href: string): string {
  try {
    return new URL(href, ctx.result.meta?.url || 'https://example.test').hostname;
  } catch {
    return '';
  }
}

function resolveSearchResultHref(ctx: TraversalContext, link: HTMLAnchorElement): string {
  const rawHref = link.getAttribute('href') || link.href;

  try {
    return new URL(rawHref, ctx.result.meta?.url || link.href).href;
  } catch {
    return link.href;
  }
}

function resolveSearchResultCandidate(
  element: HTMLElement,
  ctx: TraversalContext
): SearchResultCandidate | null {
  const link =
    (element.querySelector('h2 a[href], h3 a[href], h4 a[href]') as HTMLAnchorElement | null) ||
    (element.querySelector('a[href]') as HTMLAnchorElement | null);
  if (!link) {
    return null;
  }

  const titleElement = element.querySelector('h2, h3, h4') ?? link;
  const title = extractCleanText(titleElement as HTMLElement);
  const snippetElement = Array.from(element.querySelectorAll<HTMLElement>('p, span, div')).find(
    (candidate) => {
      const text = extractCleanText(candidate);
      return text.length >= 40 && text !== title;
    }
  );
  const snippet = snippetElement ? extractCleanText(snippetElement) : '';
  if (!title || !snippet) {
    return null;
  }

  const href = resolveSearchResultHref(ctx, link);

  return {
    container: element,
    href,
    source: resolveSearchResultSourceHostname(ctx, href),
    snippet,
    title,
  };
}

function collectSearchResultCandidates(
  root: HTMLElement,
  ctx: TraversalContext
): SearchResultCandidate[] {
  const containers = Array.from(root.querySelectorAll<HTMLElement>('li, article, section, div'));
  const seen = new Set<string>();

  return containers.flatMap((container) => {
    const candidate = resolveSearchResultCandidate(container, ctx);
    if (!candidate) {
      return [];
    }

    const dedupeKey = `${candidate.title}::${candidate.href}`;
    if (seen.has(dedupeKey)) {
      return [];
    }

    seen.add(dedupeKey);
    return [candidate];
  });
}

function countLongFormParagraphs(root: HTMLElement): number {
  return Array.from(root.querySelectorAll<HTMLElement>('p')).filter((paragraph) => {
    return extractCleanText(paragraph).length >= 280;
  }).length;
}

function isLikelySearchResultsSurface(
  root: HTMLElement,
  candidates: SearchResultCandidate[],
  ctx: TraversalContext
): boolean {
  if (candidates.length < 3) {
    return false;
  }

  if (hasExplicitSearchSignal(ctx)) {
    return true;
  }

  const averageSnippetLength =
    candidates.reduce((total, candidate) => total + candidate.snippet.length, 0) /
    candidates.length;

  return (
    candidates.length >= 4 && averageSnippetLength <= 220 && countLongFormParagraphs(root) === 0
  );
}

function buildSearchResultsTable(candidates: SearchResultCandidate[]): TableNode | null {
  const rows = candidates.slice(0, 15).map((candidate, index): TableRow => {
    const stableId = generateStableId('row', candidate.container, index);
    setSniptaleId(candidate.container, stableId);

    return {
      id: stableId,
      selected: true,
      data: {
        Заголовок: candidate.title,
        Ссылка: candidate.href,
        Описание: candidate.snippet,
        Источник: candidate.source,
      },
      cellTypes: {
        Заголовок: 'string',
        Ссылка: 'link',
        Описание: 'string',
        Источник: 'string',
      },
      selector: getSelector(candidate.container),
      editable: false,
      evidence: buildElementEvidence(candidate.container),
    };
  });

  if (rows.length < 3) {
    return null;
  }

  return {
    type: 'table',
    id: generateId('table'),
    headers: ['Заголовок', 'Ссылка', 'Описание', 'Источник'],
    rows,
    selected: true,
    editable: false,
    ...(rows[0]?.evidence === undefined ? {} : { evidence: rows[0].evidence }),
  };
}

export function extractGenericSearchResultsContent(
  root: HTMLElement,
  ctx: TraversalContext
): GenericContentExtraction {
  const candidates = collectSearchResultCandidates(root, ctx);

  if (!isLikelySearchResultsSurface(root, candidates, ctx)) {
    return { sections: [], blocks: [] };
  }

  const table = buildSearchResultsTable(candidates);
  if (!table) {
    return { sections: [], blocks: [] };
  }

  const section: SectionNode = {
    type: 'section',
    id: generateId('section'),
    title: 'Результаты поиска',
    children: [table],
    selected: true,
    kind: 'results',
  };
  const blocks: DocumentBlock[] = [
    {
      id: `${table.id}-block`,
      sectionId: section.id,
      kind: 'data-table',
      tableRef: table.id,
      ...(table.evidence === undefined ? {} : { evidence: table.evidence }),
    },
  ];

  return {
    sections: [section],
    blocks,
    replaceStructure: true,
  };
}
