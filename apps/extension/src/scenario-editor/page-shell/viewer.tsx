import { useEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { createTranslator, useAppLocale, usePageLocaleMetadata } from '../../platform/i18n';
import { buildScenarioEditorUrl } from '../../platform/navigation/extension-pages/scenario-editor';
import { TourExportPreview } from './tour/export-preview';
import { prepareScenarioView, type readScenarioViewRoute } from './runtime/viewer';
import './viewer.css';

type ViewState =
  | Awaited<ReturnType<typeof prepareScenarioView>>
  | { status: 'loading' | 'failed' | 'cancelled' };

type ViewRoute = NonNullable<ReturnType<typeof readScenarioViewRoute>>;

/** One hook owns snapshot preparation, cancellation, refresh and stale-result rejection. */
function useScenarioView(route: ViewRoute) {
  const locale = useAppLocale();
  const artifactLocale = useRef(locale);
  artifactLocale.current = locale;
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const job = useRef<AbortController | null>(null);
  useEffect(() => {
    if (route.mode === 'invalid') return;
    const controller = new AbortController();
    job.current = controller;
    setState({ status: 'loading' });
    const theme = document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light';
    void prepareScenarioView({
      ...route,
      t: createTranslator(artifactLocale.current),
      theme,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'failed' });
      });
    return () => {
      controller.abort();
      job.current = null;
    };
    // Locale and theme are bound to the prepared artifact until explicit refresh.
  }, [route, generation]);
  const cancel = () => {
    job.current?.abort();
    setState({ status: 'cancelled' });
  };
  return { state, generation, cancel, refresh: () => setGeneration((value) => value + 1) };
}

const viewFeedback = {
  loading: 'scenario.editor.viewLoading',
  unavailable: 'scenario.editor.viewUnavailable',
  empty: 'scenario.editor.viewEmpty',
  cancelled: 'scenario.editor.viewCancelled',
  failed: 'scenario.editor.viewFailed',
} as const;

/** Read-only route presents a prepared artifact without mounting editor state. */
export function ScenarioViewerPage({ route }: { route: ViewRoute }) {
  const t = createTranslator(useAppLocale());
  const { state, generation, cancel, refresh } = useScenarioView(route);
  usePageLocaleMetadata(
    'scenario.editor.documentTitle',
    'name' in state ? state.name : undefined,
    'scenario.editor.previewTitle'
  );
  const invalid = route.mode === 'invalid';
  const mode = invalid ? 'guide' : route.mode;
  return (
    <main className="scenario-viewer">
      <header className="scenario-viewer-header">
        <div>
          <h1>{'name' in state ? state.name : t('scenario.editor.previewTitle')}</h1>
          <p>
            {t(
              mode === 'guide' ? 'scenario.editor.viewGuideLabel' : 'scenario.editor.viewTourLabel'
            )}{' '}
            · {t('scenario.editor.viewSavedVersion')}
          </p>
        </div>
        {!invalid && (
          <nav aria-label={t('scenario.editor.previewTitle')}>
            <ContentToolbarButton
              title={t('scenario.editor.viewRefresh')}
              onClick={refresh}
              disabled={state.status === 'loading'}
            >
              {t('scenario.editor.viewRefresh')}
            </ContentToolbarButton>
            {state.status === 'loading' && (
              <ContentToolbarButton title={t('common.actions.cancel')} onClick={cancel}>
                {t('common.actions.cancel')}
              </ContentToolbarButton>
            )}
            <a href={buildScenarioEditorUrl({ projectId: route.projectId })}>
              {t('gallery.preview.openInEditor')}
            </a>
          </nav>
        )}
      </header>
      <section
        className="scenario-viewer-document"
        aria-label={t(mode === 'guide' ? 'scenario.editor.viewGuide' : 'scenario.editor.viewTour')}
      >
        {!invalid && state.status === 'ready' ? (
          <TourExportPreview key={generation} blob={state.blob} mode={mode} title={state.name} />
        ) : (
          <p role={invalid || state.status === 'failed' ? 'alert' : 'status'}>
            {t(
              invalid || state.status === 'ready'
                ? 'scenario.editor.viewUnavailable'
                : viewFeedback[state.status]
            )}
          </p>
        )}
      </section>
    </main>
  );
}
