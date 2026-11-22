import { installRuntimeLogCapture } from '../../composition/persistence/diagnostics/runtime-log';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initializeExtensionPageTheme } from '../theme/index';
import { PageBootstrapErrorBoundary } from './page-bootstrap-error-boundary';
import { prepareTranslations } from '../../platform/i18n';
import type { CatalogProfile } from '../../platform/i18n/catalog-profiles';
import { catalogs } from 'sniptale:i18n/bootstrap';

const PAGE_PROFILES: Readonly<Record<string, CatalogProfile | undefined>> = {
  popup: 'popup',
  EditorEntrypoint: 'editor',
  GalleryEntrypoint: 'gallery',
  SettingsEntrypoint: 'settings',
  VideoEditorEntrypoint: 'video-editor',
  ScenarioEditorEntrypoint: 'scenario-editor',
  WebSnapshotViewerEntrypoint: 'web-snapshot-viewer',
  CameraRecorderEntrypoint: 'camera-recorder',
  DesignSystemEntrypoint: 'design-system',
};

interface RenderPageShellOptions {
  element: React.ReactNode;
  initializeTheme?: boolean;
  namespace: string;
  onRendered?: () => void;
  strictMode?: boolean;
  catalogProfile?: CatalogProfile;
}

function PreparedPage(props: {
  children: React.ReactNode;
  profile: CatalogProfile;
  initialPreparation: Promise<void>;
  onRendered?: (() => void) | undefined;
}) {
  const { onRendered } = props;
  const [attempt, setAttempt] = React.useState(0);
  const [state, setState] = React.useState<'pending' | 'ready' | 'failed'>('pending');
  React.useEffect(() => {
    let active = true;
    setState('pending');
    const preparation =
      attempt === 0 ? props.initialPreparation : prepareTranslations(props.profile);
    void preparation.then(
      () => {
        if (active) setState('ready');
      },
      () => {
        if (active) setState('failed');
      }
    );
    return () => {
      active = false;
    };
  }, [attempt, props.initialPreparation, props.profile]);
  React.useLayoutEffect(() => {
    if (state === 'ready') onRendered?.();
  }, [onRendered, state]);
  if (state === 'pending') return null;
  if (state === 'ready') return props.children;
  return (
    <div role="alert">
      <p>{catalogs.en.common.bootstrap.errorTitle}</p>
      <p>{catalogs.en.common.bootstrap.errorBody}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>
        {catalogs.en.common.actions.retry}
      </button>
    </div>
  );
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
  installRuntimeLogCapture(options.namespace);
  const logger = createLogger({ namespace: options.namespace });

  if (options.initializeTheme ?? true) {
    initializeExtensionPageTheme();
  }

  const container = resolveRootContainer();
  if (!container) {
    logger.error('Page bootstrap root container is missing');
    return null;
  }

  const root = createRoot(container);
  const element = wrapBootstrapElement(options.element, options.strictMode, logger);
  const profile = options.catalogProfile ?? PAGE_PROFILES[options.namespace];
  if (profile) {
    const preparation = prepareTranslations(profile);
    void preparation.catch(() => undefined);
    root.render(
      <PreparedPage
        profile={profile}
        initialPreparation={preparation}
        onRendered={options.onRendered}
      >
        {element}
      </PreparedPage>
    );
  } else {
    root.render(element);
    options.onRendered?.();
  }
  return root;
}
