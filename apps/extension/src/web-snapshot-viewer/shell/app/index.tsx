import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { translate, useAppLocale, type AppLocale } from '../../../platform/i18n';
import { readSnapshotIdFromLocation } from './route';
import { SnapshotPreparationHost } from '../../preparation/host';
import { blockSnapshotFrameNavigation } from '../../viewer/frame-navigation';
import { hydrateSnapshotDeclarativeShadowDom } from '../../viewer/declarative-shadow';
import { loadWebSnapshotPackage, revokeWebSnapshotObjectUrls } from '../../viewer/assets';
import { WebSnapshotFrame } from '../../viewer/iframe';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import { WebSnapshotVisualSurface, type WebSnapshotViewerMode } from './view-mode';
import { WebSnapshotAssetCatalog } from './asset-catalog';
import { useViewerZoom } from './viewport-zoom';
import { loadSettings } from '../../../composition/persistence/settings';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { printWebSnapshotProjection } from '../../viewer/print-projection';
import { CollapsedToolbarButton, SnapshotViewerToolbar } from './toolbar';

type ViewerViewport = { width: number; height: number } | null;
type ViewerError = { kind: 'missing-snapshot-id' } | { kind: 'load-error'; message: string };
type ReadySnapshotIframe = { iframe: HTMLIFrameElement; loadedKey: string };
let loadedPackageRevisionSeed = 0;
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

  return error.message;
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
  currentViewport: ViewerViewport;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  externalLinksEnabled: boolean;
  onIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  onIframeLoaded: (iframe: HTMLIFrameElement) => void;
  onOpenExternalLink: (href: string) => void;
  zoom: number;
}) {
  const { iframeRef, onIframeElementChange, onIframeLoaded } = props;
  const handleIframeRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      onIframeElementChange(node);
    },
    [iframeRef, onIframeElementChange]
  );
  const handleIframeLoad = useCallback(() => {
    hydrateSnapshotDeclarativeShadowDom(iframeRef.current?.contentDocument ?? null);
    blockSnapshotFrameNavigation(iframeRef.current, {
      externalLinksEnabled: props.externalLinksEnabled,
      onOpenExternalLink: props.onOpenExternalLink,
    });
    if (iframeRef.current) {
      onIframeLoaded(iframeRef.current);
    }
  }, [iframeRef, onIframeLoaded, props.externalLinksEnabled, props.onOpenExternalLink]);
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

  return (
    <div
      data-testid="snapshot-frame-scaled-viewport"
      className="mx-auto max-w-none shrink-0"
      style={{
        height: `${resolvedViewport.height * props.zoom}px`,
        width: `${resolvedViewport.width * props.zoom}px`,
      }}
    >
      <div
        data-testid="snapshot-frame-viewport"
        style={{
          height: `${resolvedViewport.height}px`,
          transform: `scale(${props.zoom})`,
          transformOrigin: 'top left',
          width: `${resolvedViewport.width}px`,
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
  currentViewport: ViewerViewport;
  externalLinksEnabled: boolean;
  handleIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  handleIframeLoaded: (iframe: HTMLIFrameElement) => void;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onViewportChange: (viewport: ViewerViewport) => void;
  onOpenExternalLink: (href: string) => void;
  preparationIframe: HTMLIFrameElement | null;
  zoom: number;
}) {
  if (props.mode === 'assets') {
    return <WebSnapshotAssetCatalog assets={props.loaded.assets} locale={props.locale} />;
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
        currentViewport={props.currentViewport}
        externalLinksEnabled={props.externalLinksEnabled}
        iframeRef={props.iframeRef}
        loaded={props.loaded}
        locale={props.locale}
        onIframeElementChange={props.handleIframeElementChange}
        onIframeLoaded={props.handleIframeLoaded}
        onOpenExternalLink={props.onOpenExternalLink}
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

function WebSnapshotViewerSurface(props: {
  externalLinksEnabled: boolean;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
}) {
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [currentViewport, setCurrentViewport] = useState<ViewerViewport>(null);
  const [mode, setMode] = useState<WebSnapshotViewerMode>('static-document');
  const [printState, setPrintState] = useState<'error' | 'idle' | 'preparing'>('idle');
  const printPendingRef = useRef(false);
  const { handleIframeElementChange, handleIframeLoaded, iframeRef, preparationIframe } =
    useSnapshotPreparationFrame(props.loaded);
  const resolvedViewport = currentViewport ?? props.loaded.manifest.viewport ?? null;
  const zoomContentWidth =
    mode === 'static-document'
      ? (resolvedViewport?.width ?? null)
      : mode === 'visual'
        ? (props.loaded.manifest.viewport?.width ?? null)
        : null;
  const zoom = useViewerZoom(zoomContentWidth);
  const openExternalLink = useCallback((href: string) => {
    void browserTabs.create({ active: true, url: href }).catch(() => {
      logger.warn('Failed to open an external snapshot link');
    });
  }, []);
  const printSnapshot = useCallback(() => {
    if (printPendingRef.current) return;
    printPendingRef.current = true;
    setPrintState('preparing');
    void printWebSnapshotProjection({
      documentUrl: props.loaded.documentUrl,
      html: props.loaded.html,
      viewport: props.loaded.manifest.viewport,
    })
      .then(() => {
        printPendingRef.current = false;
        setPrintState('idle');
      })
      .catch(() => {
        printPendingRef.current = false;
        logger.warn('Failed to prepare snapshot PDF projection');
        setPrintState('error');
      });
  }, [props.loaded]);

  return (
    <main
      className="flex h-screen w-full min-w-0 max-w-full flex-col overflow-hidden
        bg-[var(--sniptale-color-surface-canvas)]"
    >
      {toolbarVisible ? (
        <SnapshotViewerToolbar
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onCollapse={() => setToolbarVisible(false)}
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
        className={`relative min-h-0 w-full min-w-0 max-w-full flex-1 overflow-auto ${zoom.grabClassName}`}
        onPointerDown={zoom.onPointerDown}
        onPointerMove={zoom.onPointerMove}
        onPointerUp={zoom.onPointerUp}
        onPointerCancel={zoom.onPointerUp}
      >
        {toolbarVisible ? null : (
          <CollapsedToolbarButton locale={props.locale} onExpand={() => setToolbarVisible(true)} />
        )}
        <SnapshotModeContent
          currentViewport={currentViewport}
          externalLinksEnabled={props.externalLinksEnabled}
          handleIframeElementChange={handleIframeElementChange}
          handleIframeLoaded={handleIframeLoaded}
          iframeRef={iframeRef}
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onViewportChange={setCurrentViewport}
          onOpenExternalLink={openExternalLink}
          preparationIframe={preparationIframe}
          zoom={zoom.zoom}
        />
      </section>
    </main>
  );
}

function useExternalSnapshotLinksEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadSettings()
      .then((settings) => {
        if (!disposed) setEnabled(settings.externalSnapshotLinksEnabled);
      })
      .catch(() => {
        if (!disposed) setEnabled(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  return enabled;
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
          setError({
            kind: 'load-error',
            message: loadError instanceof Error ? loadError.message : String(loadError),
          });
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
  const externalLinksEnabled = useExternalSnapshotLinksEnabled();
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

  return (
    <WebSnapshotViewerSurface
      externalLinksEnabled={externalLinksEnabled}
      loaded={loaded}
      locale={locale}
    />
  );
}
