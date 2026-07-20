import type { TraversalContext } from '../../types';

function resolveContextPathname(ctx: TraversalContext): string {
  const pageUrl = ctx.result.meta?.url ?? '';
  if (!pageUrl) {
    return '';
  }

  try {
    return new URL(pageUrl, 'https://example.test').pathname;
  } catch {
    return '';
  }
}

function hasPortalMainRoot(scope: ParentNode): boolean {
  if (scope instanceof HTMLElement) {
    return scope.matches('.Main__root') || scope.closest('.Main__root') !== null;
  }

  return scope.querySelector('.Main__root') !== null;
}

export function isPortalHomepage(ctx: TraversalContext, scope: ParentNode): boolean {
  return resolveContextPathname(ctx) === '/portal/' && hasPortalMainRoot(scope);
}
