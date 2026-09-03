import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { translate, useAppLocale, type AppLocale } from '../../../platform/i18n';
import { readSnapshotIdFromLocation } from './route';
import { SnapshotPreparationHost } from '../../preparation/host';
import { blockSnapshotFrameNavigation } from '../../viewer/frame-navigation';
import { installSnapshotFrameStaticInteractions } from '../../viewer/frame-interactions';
import { installSnapshotFrameLayoutPolicy } from '../../viewer/frame-layout';
import { hydrateSnapshotDeclarativeShadowDom } from '../../viewer/declarative-shadow';
import { loadWebSnapshotPackage, revokeWebSnapshotObjectUrls } from '../../viewer/assets';
import { WebSnapshotFrame } from '../../viewer/iframe';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import type { ViewerPackageFile } from '../../viewer/package-files';
import { WebSnapshotVisualSurface, type WebSnapshotViewerMode } from './view-mode';
import { WebSnapshotAssetCatalog } from './asset-catalog';
import { useViewerZoom } from './viewport-zoom';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  printWebSnapshotImageProjection,
  printWebSnapshotProjection,
} from '../../viewer/print-projection';
import { CollapsedToolbarButton, SnapshotViewerToolbar } from './toolbar';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';

type ViewerViewport = { width: number; height: number } | null;
type ViewerError = { kind: 'missing-snapshot-id' } | { kind: 'load-error' };
type ReadySnapshotIframe = { iframe: HTMLIFrameElement; loadedKey: string };
let loadedPackageRevisionSeed = 0;
const PACKAGE_FILE_DOWNLOAD_URL_LIFETIME_MS = 1500;
const logger = createLogger({ namespace: 'WebSnapshotViewer' });

function getSourceTitle(sourceTitle: string | null | undefined): string | null {
  const normalizedTitle = sourceTitle?.trim();
  return normalizedTitle ? normalizedTitle : null;
}

function getDocumentTitle(loaded: LoadedWebSnapshotPackage | null, locale: AppLocale): string {
  const sourceTitle = loaded === null ? null : getSourceTitle(loaded.manifest.source.title);
  if (sourceTitle === null) {
    return translate('webSnapshotViewer.app.documentTitleFallback', locale);
  }

  return `${sourceTitle} - ${translate('webSnapshotViewer.app.documentTitleSuffix', locale)}`;
}

function getViewerErrorMessage(error: ViewerError, locale: AppLocale): string {
  if (error.kind === 'missing-snapshot-id') {
    return translate('webSnapshotViewer.app.missingSnapshotId', locale);
  }

  return createUserFacingErrorMessage({
    detail: 'storage',
    locale,
    summaryKey: 'common.errors.loadFailed',
  });
}

function downloadViewerPackageFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = objectUrl;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), PACKAGE_FILE_DOWNLOAD_URL_LIFETIME_MS);
}

function useViewerDocumentTitle(loaded: LoadedWebSnapshotPackage | null): AppLocale {
  const locale = useAppLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = getDocumentTitle(loaded, locale);
  }, [loaded, locale]);

  return locale;
}

function SnapshotFrameSurface(props: {
  availableHeight: number;
  availableWidth: number;
  currentViewport: ViewerViewport;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  externalLinksEnabled: boolean;
  onIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  onIframeLoaded: (iframe: HTMLIFrameElement) => void;
  onExternalLinkPreviewChange: (href: string | null) => void;
  onOpenExternalLink: (href: string) => void;
  responsiveLayout: boolean;
  zoom: number;
}) {
  const { iframeRef, onIframeElementChange, onIframeLoaded } = props;
  const navigationCleanupRef = useRef<(() => void) | null>(null);
  const interactionCleanupRef = useRef<(() => void) | null>(null);
  const layoutCleanupRef = useRef<(() => void) | null>(null);
  const handleIframeRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      onIframeElementChange(node);
    },
    [iframeRef, onIframeElementChange]
  );
  const installNavigationPolicy = useCallback(() => {
    navigationCleanupRef.current?.();
    navigationCleanupRef.current = blockSnapshotFrameNavigation(iframeRef.current, {
      externalLinksEnabled: props.externalLinksEnabled,
      onExternalLinkPreviewChange: props.onExternalLinkPreviewChange,
      onOpenExternalLink: props.onOpenExternalLink,
    });
  }, [
    iframeRef,
    props.externalLinksEnabled,
    props.onExternalLinkPreviewChange,
    props.onOpenExternalLink,
  ]);
  const installStaticInteractions = useCallback(() => {
    interactionCleanupRef.current?.();
    interactionCleanupRef.current = installSnapshotFrameStaticInteractions(iframeRef.current, {
      dragHint: translate('webSnapshotViewer.app.dragScrollableArea', props.locale),
    });
  }, [iframeRef, props.locale]);
  const installFrameLayoutPolicy = useCallback(() => {
    layoutCleanupRef.current?.();
    layoutCleanupRef.current = props.responsiveLayout
      ? installSnapshotFrameLayoutPolicy(iframeRef.current)
      : null;
  }, [iframeRef, props.responsiveLayout]);
  const handleIframeLoad = useCallback(() => {
    hydrateSnapshotDeclarativeShadowDom(iframeRef.current?.contentDocument ?? null);
    installNavigationPolicy();
    installStaticInteractions();
    installFrameLayoutPolicy();
    if (iframeRef.current) {
      onIframeLoaded(iframeRef.current);
    }
  }, [
    iframeRef,
    installFrameLayoutPolicy,
    installNavigationPolicy,
    installStaticInteractions,
    onIframeLoaded,
  ]);
  useEffect(() => {
    if (iframeRef.current?.contentDocument?.readyState === 'complete') {
      installNavigationPolicy();
    }
    return () => {
      navigationCleanupRef.current?.();
      navigationCleanupRef.current = null;
    };
  }, [iframeRef, installNavigationPolicy]);
  useEffect(() => {
    if (iframeRef.current?.contentDocument?.readyState === 'complete') {
      installStaticInteractions();
    }
    return () => {
      interactionCleanupRef.current?.();
      interactionCleanupRef.current = null;
    };
  }, [iframeRef, installStaticInteractions]);
  useEffect(() => {
    if (iframeRef.current?.contentDocument?.readyState === 'complete') {
      installFrameLayoutPolicy();
    }
    return () => {
      layoutCleanupRef.current?.();
      layoutCleanupRef.current = null;
    };
  }, [iframeRef, installFrameLayoutPolicy]);
  const resolvedViewport = props.currentViewport ?? props.loaded.manifest.viewport ?? null;
  if (resolvedViewport === null) {
    return (
      <div data-testid="snapshot-frame-viewport" className="h-full w-full">
        <WebSnapshotFrame
          iframeRef={handleIframeRef}
          onLoad={handleIframeLoad}
          documentUrl={props.loaded.documentUrl}
          srcDoc={props.loaded.html}
          title={translate('webSnapshotViewer.app.frameTitle', props.locale)}
        />
      </div>
    );
  }

  const logicalWidth = props.responsiveLayout
    ? Math.max(1, Math.ceil(props.availableWidth / props.zoom))
    : resolvedViewport.width;
  const logicalHeight = props.responsiveLayout
    ? Math.max(1, Math.ceil(props.availableHeight / props.zoom))
    : props.currentViewport === null && props.zoom < 1
      ? Math.max(resolvedViewport.height, Math.ceil(props.availableHeight / props.zoom))
      : resolvedViewport.height;

  return (
    <div
      data-testid="snapshot-frame-scaled-viewport"
      className="mx-auto max-w-none shrink-0 overflow-hidden"
      style={{
        height: `${props.responsiveLayout ? props.availableHeight : logicalHeight * props.zoom}px`,
        width: `${props.responsiveLayout ? props.availableWidth : logicalWidth * props.zoom}px`,
      }}
    >
      <div
        data-testid="snapshot-frame-viewport"
        style={{
          height: `${logicalHeight}px`,
          transform: `scale(${props.zoom})`,
          transformOrigin: 'top left',
          width: `${logicalWidth}px`,
        }}
      >
        <WebSnapshotFrame
          iframeRef={handleIframeRef}
          onLoad={handleIframeLoad}
          documentUrl={props.loaded.documentUrl}
          srcDoc={props.loaded.html}
          title={translate('webSnapshotViewer.app.frameTitle', props.locale)}
        />
      </div>
    </div>
  );
}

function useLoadedSnapshotKey(loaded: LoadedWebSnapshotPackage): string {
  const loadedKeyRef = useRef<{
    key: string;
    loaded: LoadedWebSnapshotPackage;
  } | null>(null);
  if (loadedKeyRef.current?.loaded !== loaded) {
    loadedPackageRevisionSeed += 1;
    loadedKeyRef.current = {
      key: `${loaded.manifest.id}:${loadedPackageRevisionSeed}`,
      loaded,
    };
  }

  return loadedKeyRef.current.key;
}

function useSnapshotPreparationFrame(loaded: LoadedWebSnapshotPackage) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null);
  const [readyIframe, setReadyIframe] = useState<ReadySnapshotIframe | null>(null);
  const loadedKey = useLoadedSnapshotKey(loaded);
  const preparationIframe =
    iframeElement &&
    readyIframe !== null &&
    readyIframe.iframe === iframeElement &&
    readyIframe.loadedKey === loadedKey
      ? iframeElement
      : null;

  const handleIframeElementChange = useCallback((iframe: HTMLIFrameElement | null) => {
    setIframeElement(iframe);
    setReadyIframe((current) => (current !== null && current.iframe === iframe ? current : null));
  }, []);
  const handleIframeLoaded = useCallback(
    (iframe: HTMLIFrameElement) => {
      setReadyIframe({ iframe, loadedKey });
    },
    [loadedKey]
  );

  return {
    handleIframeElementChange,
    handleIframeLoaded,
    iframeRef,
    preparationIframe,
  };
}

function SnapshotModeContent(props: {
  availableHeight: number;
  availableWidth: number;
  currentViewport: ViewerViewport;
  externalLinksEnabled: boolean;
  handleIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  handleIframeLoaded: (iframe: HTMLIFrameElement) => void;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onDownloadPackageFile: (file: ViewerPackageFile) => Promise<void>;
  onViewportChange: (viewport: ViewerViewport) => void;
  onExternalLinkPreviewChange: (href: string | null) => void;
  onOpenExternalLink: (href: string) => void;
  preparationIframe: HTMLIFrameElement | null;
  responsiveLayout: boolean;
  zoom: number;
}) {
  if (props.mode === 'assets') {
    return (
      <WebSnapshotAssetCatalog
        assets={props.loaded.assets}
        locale={props.locale}
        onDownloadPackageFile={props.onDownloadPackageFile}
        packageFiles={props.loaded.packageFiles}
      />
    );
  }
  if (props.mode === 'visual') {
    return (
      <WebSnapshotVisualSurface
        locale={props.locale}
        screenshotUrl={props.loaded.screenshotUrl}
        screenshotCoverage={props.loaded.screenshotCoverage}
        sourceTitle={props.loaded.manifest.source.title}
        viewport={props.loaded.manifest.viewport ?? undefined}
        zoom={props.zoom}
      />
    );
  }
  return (
    <>
      <SnapshotFrameSurface
        availableHeight={props.availableHeight}
        availableWidth={props.availableWidth}
        currentViewport={props.currentViewport}
        externalLinksEnabled={props.externalLinksEnabled}
        iframeRef={props.iframeRef}
        loaded={props.loaded}
        locale={props.locale}
        onIframeElementChange={props.handleIframeElementChange}
        onIframeLoaded={props.handleIframeLoaded}
        onExternalLinkPreviewChange={props.onExternalLinkPreviewChange}
        onOpenExternalLink={props.onOpenExternalLink}
        responsiveLayout={props.responsiveLayout}
        zoom={props.zoom}
      />
      {props.preparationIframe ? (
        <SnapshotPreparationHost
          iframe={props.preparationIframe}
          manifest={props.loaded.manifest}
          onViewportChange={props.onViewportChange}
        />
      ) : null}
    </>
  );
}

function WebSnapshotViewerSurface(props: { loaded: LoadedWebSnapshotPackage; locale: AppLocale }) {
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [currentViewport, setCurrentViewport] = useState<ViewerViewport>(null);
  const [externalLinksEnabled, setExternalLinksEnabled] = useState(false);
  const [externalLinkPreview, setExternalLinkPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<WebSnapshotViewerMode>('static-document');
  const [printState, setPrintState] = useState<'error' | 'idle' | 'preparing'>('idle');
  const printPendingRef = useRef(false);
  const packageFileDownloadPendingRef = useRef(false);
  const { handleIframeElementChange, handleIframeLoaded, iframeRef, preparationIframe } =
    useSnapshotPreparationFrame(props.loaded);
  const resolvedViewport = currentViewport ?? props.loaded.manifest.viewport ?? null;
  const zoomContentWidth =
    mode === 'static-document'
      ? (resolvedViewport?.width ?? null)
      : mode === 'visual'
        ? (props.loaded.manifest.viewport?.width ?? null)
        : null;
  const responsiveLayout = mode === 'static-document' && currentViewport === null;
  const zoom = useViewerZoom(zoomContentWidth, responsiveLayout);
  const openExternalLink = useCallback((href: string) => {
    void browserTabs.create({ active: true, url: href }).catch(() => {
      logger.warn('Failed to open an external snapshot link');
    });
  }, []);
  const downloadPackageFile = useCallback(
    async (file: ViewerPackageFile) => {
      if (packageFileDownloadPendingRef.current) {
        throw new Error('Another snapshot package file is already being extracted.');
      }
      packageFileDownloadPendingRef.current = true;
      try {
        const blob = await props.loaded.extractPackageFile(file.path);
        downloadViewerPackageFile(blob, file.name);
      } finally {
        packageFileDownloadPendingRef.current = false;
      }
    },
    [props.loaded]
  );
  const printSnapshot = useCallback(() => {
    if (printPendingRef.current) return;
    printPendingRef.current = true;
    setPrintState('preparing');
    const projection =
      mode === 'visual'
        ? printWebSnapshotImageProjection({
            screenshotUrl: props.loaded.screenshotUrl,
            viewport: props.loaded.manifest.viewport,
          })
        : printWebSnapshotProjection({
            documentUrl: props.loaded.documentUrl,
            html: props.loaded.html,
            viewport: props.loaded.manifest.viewport,
          });
    void projection
      .then(() => {
        printPendingRef.current = false;
        setPrintState('idle');
      })
      .catch(() => {
        printPendingRef.current = false;
        logger.warn('Failed to prepare snapshot PDF projection');
        setPrintState('error');
      });
  }, [mode, props.loaded]);

  return (
    <main
      className="flex h-screen w-full min-w-0 max-w-full flex-col overflow-hidden
        bg-[var(--sniptale-color-surface-canvas)]"
    >
      {toolbarVisible ? (
        <SnapshotViewerToolbar
          externalLinksEnabled={externalLinksEnabled}
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onCollapse={() => setToolbarVisible(false)}
          onExternalLinksEnabledChange={setExternalLinksEnabled}
          onModeChange={setMode}
          onPrint={printSnapshot}
          printPending={printState === 'preparing'}
          zoom={zoom}
        />
      ) : null}
      {printState === 'error' ? (
        <div
          className="fixed right-4 top-16 z-30 rounded-lg border border-[var(--sniptale-color-danger)]
            bg-[var(--sniptale-color-surface-panel)] px-3 py-2 text-xs
            text-[var(--sniptale-color-danger)] shadow-lg"
          role="alert"
        >
          {translate('webSnapshotViewer.app.exportPdfFailed', props.locale)}
        </div>
      ) : null}
      <section
        ref={zoom.surfaceRef}
        data-testid="snapshot-viewer-surface"
        className={`relative min-h-0 w-full min-w-0 max-w-full flex-1
          ${responsiveLayout ? 'overflow-y-hidden' : 'overflow-y-auto'}
          ${zoom.horizontalOverflowClassName} ${zoom.grabClassName}`}
        style={{ scrollbarGutter: responsiveLayout ? 'auto' : 'stable' }}
        onPointerDown={zoom.onPointerDown}
        onPointerMove={zoom.onPointerMove}
        onPointerUp={zoom.onPointerUp}
        onPointerCancel={zoom.onPointerUp}
      >
        {toolbarVisible ? null : (
          <CollapsedToolbarButton locale={props.locale} onExpand={() => setToolbarVisible(true)} />
        )}
        <SnapshotModeContent
          availableHeight={zoom.availableHeight}
          availableWidth={zoom.availableWidth}
          currentViewport={currentViewport}
          externalLinksEnabled={externalLinksEnabled}
          handleIframeElementChange={handleIframeElementChange}
          handleIframeLoaded={handleIframeLoaded}
          iframeRef={iframeRef}
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onDownloadPackageFile={downloadPackageFile}
          onViewportChange={setCurrentViewport}
          onExternalLinkPreviewChange={setExternalLinkPreview}
          onOpenExternalLink={openExternalLink}
          preparationIframe={preparationIframe}
          responsiveLayout={responsiveLayout}
          zoom={zoom.zoom}
        />
      </section>
      {externalLinkPreview === null ? null : (
        <div
          className="pointer-events-none fixed bottom-0 left-0 z-30 max-w-[min(720px,calc(100vw-16px))]
            truncate rounded-tr-md border border-b-0 border-l-0
            border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
            px-2.5 py-1 text-[11px] text-[var(--sniptale-color-text-muted)] shadow-md"
          data-testid="snapshot-external-link-preview"
          title={externalLinkPreview}
        >
          <span className="sr-only">
            {translate('webSnapshotViewer.app.externalLinkDestination', props.locale)}:{' '}
          </span>
          {externalLinkPreview}
        </div>
      )}
    </main>
  );
}

function useLoadedWebSnapshotPackage() {
  const [loaded, setLoaded] = useState<LoadedWebSnapshotPackage | null>(null);
  const [error, setError] = useState<ViewerError | null>(null);

  useEffect(() => {
    let disposed = false;
    let objectUrls: string[] = [];
    const snapshotId = readSnapshotIdFromLocation();
    if (!snapshotId) {
      setError({ kind: 'missing-snapshot-id' });
      return undefined;
    }

    void loadWebSnapshotPackage(snapshotId)
      .then((nextLoaded) => {
        if (disposed) {
          revokeWebSnapshotObjectUrls(nextLoaded.objectUrls);
          return;
        }
        objectUrls = nextLoaded.objectUrls;
        setLoaded(nextLoaded);
      })
      .catch((loadError) => {
        if (!disposed) {
          logger.error('Failed to load Web Snapshot package', loadError);
          setError({ kind: 'load-error' });
        }
      });

    return () => {
      disposed = true;
      revokeWebSnapshotObjectUrls(objectUrls);
    };
  }, []);

  return { error, loaded };
}

export function WebSnapshotViewerApp() {
  const { error, loaded } = useLoadedWebSnapshotPackage();
  const locale = useViewerDocumentTitle(loaded);

  if (error) {
    return (
      <div className="p-6 text-sm text-[var(--sniptale-color-danger)]">
        {getViewerErrorMessage(error, locale)}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="p-6 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('webSnapshotViewer.app.loading', locale)}
      </div>
    );
  }

  return <WebSnapshotViewerSurface loaded={loaded} locale={locale} />;
}
