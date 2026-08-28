import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { PanelTopClose, PanelTopOpen } from 'lucide-react';
import { translate, useAppLocale, type AppLocale } from '../../../platform/i18n';
import { readSnapshotIdFromLocation } from './route';
import { SnapshotPreparationHost } from '../../preparation/host';
import { blockSnapshotFrameNavigation } from '../../viewer/frame-navigation';
import { hydrateSnapshotDeclarativeShadowDom } from '../../viewer/declarative-shadow';
import { loadWebSnapshotPackage, revokeWebSnapshotObjectUrls } from '../../viewer/assets';
import { WebSnapshotFrame } from '../../viewer/iframe';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';
import {
  WebSnapshotViewerModeSwitch,
  WebSnapshotVisualSurface,
  type WebSnapshotViewerMode,
} from './view-mode';
import { WebSnapshotAssetCatalog } from './asset-catalog';
import { useViewerZoom, WebSnapshotZoomControls } from './viewport-zoom';

const viewerHeaderClassName = [
  'flex min-h-[52px] items-center justify-between border-b',
  'border-[var(--sniptale-color-border-soft)] px-4',
].join(' ');

type ViewerViewport = { width: number; height: number } | null;
type ViewerError = { kind: 'missing-snapshot-id' } | { kind: 'load-error'; message: string };
type ReadySnapshotIframe = { iframe: HTMLIFrameElement; loadedKey: string };
let loadedPackageRevisionSeed = 0;

function getSourceTitle(sourceTitle: string | null | undefined): string | null {
  const normalizedTitle = sourceTitle?.trim();
  return normalizedTitle ? normalizedTitle : null;
}

function getHeaderTitle(loaded: LoadedWebSnapshotPackage, locale: AppLocale): string {
  return (
    getSourceTitle(loaded.manifest.source.title) ??
    translate('webSnapshotViewer.app.documentTitleFallback', locale)
  );
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

function SnapshotViewerHeader(props: {
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onCollapse: () => void;
  onModeChange: (mode: WebSnapshotViewerMode) => void;
  zoom: ReturnType<typeof useViewerZoom>;
}) {
  const collapseToolbarLabel = translate('webSnapshotViewer.app.collapseToolbar', props.locale);

  return (
    <header className={viewerHeaderClassName}>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {getHeaderTitle(props.loaded, props.locale)}
        </div>
        <div className="truncate text-xs text-[var(--sniptale-color-text-muted)]">
          {props.loaded.manifest.source.url}
        </div>
        {props.mode === 'visual' ? (
          <div className="truncate text-[10px] text-[var(--sniptale-color-text-muted)]">
            {translate('webSnapshotViewer.app.pngDprHint', props.locale)}
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {props.mode === 'assets' ? null : (
          <WebSnapshotZoomControls locale={props.locale} {...props.zoom} />
        )}
        <WebSnapshotViewerModeSwitch
          locale={props.locale}
          mode={props.mode}
          onModeChange={props.onModeChange}
        />
        <button
          type="button"
          aria-label={collapseToolbarLabel}
          title={collapseToolbarLabel}
          className={[
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'text-[var(--sniptale-color-text-muted)] transition hover:bg-[var(--sniptale-color-surface-hover)]',
            'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
          ].join(' ')}
          onClick={props.onCollapse}
        >
          <PanelTopClose aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function SnapshotFrameSurface(props: {
  currentViewport: ViewerViewport;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  onIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  onIframeLoaded: (iframe: HTMLIFrameElement) => void;
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
    blockSnapshotFrameNavigation(iframeRef.current);
    if (iframeRef.current) {
      onIframeLoaded(iframeRef.current);
    }
  }, [iframeRef, onIframeLoaded]);
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

function CollapsedToolbarButton(props: { locale: AppLocale; onExpand: () => void }) {
  const label = translate('webSnapshotViewer.app.expandToolbar', props.locale);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'fixed right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-lg',
        'border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] shadow-md',
        'text-[var(--sniptale-color-text-muted)] hover:text-[var(--sniptale-color-text-primary)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      onClick={props.onExpand}
    >
      <PanelTopOpen aria-hidden="true" size={17} />
    </button>
  );
}

function SnapshotModeContent(props: {
  currentViewport: ViewerViewport;
  handleIframeElementChange: (iframe: HTMLIFrameElement | null) => void;
  handleIframeLoaded: (iframe: HTMLIFrameElement) => void;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  loaded: LoadedWebSnapshotPackage;
  locale: AppLocale;
  mode: WebSnapshotViewerMode;
  onViewportChange: (viewport: ViewerViewport) => void;
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
        iframeRef={props.iframeRef}
        loaded={props.loaded}
        locale={props.locale}
        onIframeElementChange={props.handleIframeElementChange}
        onIframeLoaded={props.handleIframeLoaded}
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
  const [mode, setMode] = useState<WebSnapshotViewerMode>('static-document');
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

  return (
    <main className="flex h-screen flex-col bg-[var(--sniptale-color-surface-canvas)]">
      {toolbarVisible ? (
        <SnapshotViewerHeader
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onCollapse={() => setToolbarVisible(false)}
          onModeChange={setMode}
          zoom={zoom}
        />
      ) : null}
      <section
        ref={zoom.surfaceRef}
        data-testid="snapshot-viewer-surface"
        className="relative min-h-0 flex-1 overflow-auto"
      >
        {toolbarVisible ? null : (
          <CollapsedToolbarButton locale={props.locale} onExpand={() => setToolbarVisible(true)} />
        )}
        <SnapshotModeContent
          currentViewport={currentViewport}
          handleIframeElementChange={handleIframeElementChange}
          handleIframeLoaded={handleIframeLoaded}
          iframeRef={iframeRef}
          loaded={props.loaded}
          locale={props.locale}
          mode={mode}
          onViewportChange={setCurrentViewport}
          preparationIframe={preparationIframe}
          zoom={zoom.zoom}
        />
      </section>
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
