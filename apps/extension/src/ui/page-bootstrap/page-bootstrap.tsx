import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initializeAppTheme } from '../theme/index';
import { PageBootstrapErrorBoundary } from './page-bootstrap-error-boundary';

interface RenderPageShellOptions {
  element: React.ReactNode;
  initializeTheme?: boolean;
  namespace: string;
  onRendered?: () => void;
  strictMode?: boolean;
}

function resolveRootContainer(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById('root');
}

function wrapBootstrapElement(
  element: React.ReactNode,
  strictMode: boolean | undefined,
  logger: ReturnType<typeof createLogger>
): React.ReactNode {
  const content = strictMode ? <React.StrictMode>{element}</React.StrictMode> : element;

  return (
    <PageBootstrapErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Page bootstrap boundary caught an error', {
          componentStack: errorInfo.componentStack,
          message: error.message,
        });
      }}
    >
      {content}
    </PageBootstrapErrorBoundary>
  );
}

/**
 * Renders a page entrypoint through the shared bootstrap shell so theme setup,
 * root lookup, and fatal render fallback stay consistent across extension pages.
 */
export function renderPageShell(options: RenderPageShellOptions): Root | null {
  const logger = createLogger({ namespace: options.namespace });

  if (options.initializeTheme ?? true) {
    initializeAppTheme();
  }

  const container = resolveRootContainer();
  if (!container) {
    logger.error('Page bootstrap root container is missing');
    return null;
  }

  const root = createRoot(container);
  root.render(wrapBootstrapElement(options.element, options.strictMode, logger));
  options.onRendered?.();
  return root;
}
