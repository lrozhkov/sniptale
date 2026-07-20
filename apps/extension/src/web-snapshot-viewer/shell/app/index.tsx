import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { X } from 'lucide-react';
import { translate, useAppLocale, type AppLocale } from '../../../platform/i18n';
import { readSnapshotIdFromLocation } from './route';
import { SnapshotPreparationHost } from '../../preparation/host';
import { blockSnapshotFrameNavigation } from '../../viewer/frame-navigation';
import { loadWebSnapshotPackage, revokeWebSnapshotObjectUrls } from '../../viewer/assets';
import { WebSnapshotFrame } from '../../viewer/iframe';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';

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
  onHide: () => void;
}) {
  const hideHeaderLabel = translate('webSnapshotViewer.app.hideHeader', props.locale);

  return (
    <header className={viewerHeaderClassName}>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {getHeaderTitle(props.loaded, props.locale)}
        </div>
        <div className="truncate text-xs text-[var(--sniptale-color-text-muted)]">
          {props.loaded.manifest.source.url}
        </div>
      </div>
      <button
        type="button"
        aria-label={hideHeaderLabel}
        title={hideHeaderLabel}
        className={[
          'ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          'text-[var(--sniptale-color-text-muted)] transition hover:bg-[var(--sniptale-color-surface-hover)]',
          'hover:text-[var(--sniptale-color-text-primary)] focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        ].join(' ')}
        onClick={props.onHide}
      >
        <X aria-hidden="true" size={16} strokeWidth={2} />
      </button>
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
    blockSnapshotFrameNavigation(iframeRef.current);
    if (iframeRef.current) {
      onIframeLoaded(iframeRef.current);
    }
  }, [iframeRef, onIframeLoaded]);
  const resolvedViewport = props.currentViewport ?? props.loaded.manifest.viewport ?? null;
  const viewportStyle =
    resolvedViewport === null
      ? undefined
      : {
          height: `${resolvedViewport.height}px`,
          width: `${resolvedViewport.width}px`,
        };
  const viewportClassName =
    resolvedViewport === null ? 'h-full w-full' : 'mx-auto max-w-none shrink-0';

  return (
    <div data-testid="snapshot-frame-viewport" className={viewportClassName} style={viewportStyle}>
      <WebSnapshotFrame
        iframeRef={handleIframeRef}
        onLoad={handleIframeLoad}
        srcDoc={props.loaded.html}
        title={translate('webSnapshotViewer.app.frameTitle', props.locale)}
      />
    </div>
  );
}

function useLoadedSnapshotKey(loaded: LoadedWebSnapshotPackage): string {
  const loadedKeyRef = useRef<{ key: string; loaded: LoadedWebSnapshotPackage } | null>(null);
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

  return { handleIframeElementChange, handleIframeLoaded, iframeRef, preparationIframe };
}

function WebSnapshotViewerSurface(props: { loaded: LoadedWebSnapshotPackage; locale: AppLocale }) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const [currentViewport, setCurrentViewport] = useState<ViewerViewport>(null);
  const { handleIframeElementChange, handleIframeLoaded, iframeRef, preparationIframe } =
    useSnapshotPreparationFrame(props.loaded);

  return (
    <main className="flex h-screen flex-col bg-[var(--sniptale-color-surface-canvas)]">
      {headerVisible ? (
        <SnapshotViewerHeader
          loaded={props.loaded}
          locale={props.locale}
          onHide={() => setHeaderVisible(false)}
        />
      ) : null}
      <section className="relative min-h-0 flex-1 overflow-auto">
        <SnapshotFrameSurface
          currentViewport={currentViewport}
          iframeRef={iframeRef}
          loaded={props.loaded}
          locale={props.locale}
          onIframeElementChange={handleIframeElementChange}
          onIframeLoaded={handleIframeLoaded}
        />
        {preparationIframe ? (
          <SnapshotPreparationHost
            iframe={preparationIframe}
            manifest={props.loaded.manifest}
            onViewportChange={setCurrentViewport}
          />
        ) : null}
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
