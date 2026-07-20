import { createLogger } from '@sniptale/platform/observability/logger';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import { updateSectionContext } from '../../parsers';
import type { ParserRegistry } from '../../parsers';
import {
  determinePageContext,
  initContext,
  postProcessResult,
  treeWalkerFilter,
} from '../../dom-tree-parser/traversal';
import type { DomTreeParserBackend, DomTreeParserBackendInput } from '../contracts';

const logger = createLogger({ namespace: 'ContentDomTreeParser' });

function parseWithLegacyTreeWalker(input: DomTreeParserBackendInput) {
  const { pageMetadata, pageProfile, parseRoot, pipeline, resolveOriginalElement } = input;
  logger.debug('Starting TreeWalker parsing', {
    rootMode: parseRoot === document.body ? 'full-page' : 'custom-root',
  });

  const startTime = performance.now();
  const ctx = initContext(pageProfile, pipeline.trace, pageMetadata);
  const { context, title } = determinePageContext(parseRoot, pageProfile, pageMetadata);
  ctx.result.context = context;
  ctx.result.title = title;
  ctx.result.meta = {
    ...ctx.result.meta,
    pipelineTrace: pipeline.trace,
    profile: pageProfile,
    title,
    url: pageMetadata.pageUrl,
    warnings: ctx.result.meta?.warnings ?? [],
  };

  setGetOriginalElementFn(resolveOriginalElement ?? null);
  if (resolveOriginalElement !== undefined) {
    ctx.getOriginalElementFn = resolveOriginalElement;
  }

  try {
    const nodeCount = traverseParsedDom(parseRoot, pipeline.registry, ctx);
    return finalizeParsedDom(ctx, nodeCount, startTime);
  } finally {
    setGetOriginalElementFn(null);
  }
}

function traverseParsedDom(
  parseRoot: HTMLElement,
  registry: ParserRegistry,
  ctx: ReturnType<typeof initContext>
) {
  const treeWalker = document.createTreeWalker(
    parseRoot,
    NodeFilter.SHOW_ELEMENT,
    treeWalkerFilter
  );
  let nodeCount = 0;
  let hasNextNode = treeWalker.nextNode() !== null;

  while (hasNextNode) {
    const node = treeWalker.currentNode as HTMLElement;
    updateSectionContext(node, ctx);

    const parser = registry.findParser(node, ctx);
    const parseResult = parser?.parse(node, ctx);
    if (parseResult?.skipChildren) {
      nodeCount += 1;
      hasNextNode = moveTreeWalkerPastCurrentSubtree(treeWalker);
      continue;
    }

    nodeCount += 1;
    hasNextNode = treeWalker.nextNode() !== null;
  }

  return nodeCount;
}

function moveTreeWalkerPastCurrentSubtree(treeWalker: TreeWalker): boolean {
  if (treeWalker.nextSibling()) {
    return true;
  }

  while (treeWalker.parentNode()) {
    if (treeWalker.nextSibling()) {
      return true;
    }
  }

  return false;
}

function finalizeParsedDom(
  ctx: ReturnType<typeof initContext>,
  nodeCount: number,
  startTime: number
) {
  ctx.result = postProcessResult(ctx.result);

  const endTime = performance.now();
  logger.debug('TreeWalker parsing completed', {
    durationMs: Number((endTime - startTime).toFixed(2)),
    nodeCount,
    sectionCount: ctx.result.structure.length,
  });

  return ctx.result;
}

export const legacyTreeWalkerBackend: DomTreeParserBackend = {
  id: 'legacy-tree-walker',
  parse: parseWithLegacyTreeWalker,
};
