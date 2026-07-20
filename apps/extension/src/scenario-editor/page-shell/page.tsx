import { translate } from '../../platform/i18n';
import {
  readScenarioEditorPresentationSessionId,
  readScenarioEditorPresentationView,
  readScenarioEditorStepId,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ScenarioAudiencePresentationPage } from './presentation/audience';
import { ScenarioV3EditorShell } from './view';
import { useScenarioV3PageProjectState } from './runtime/use-state';

export function ScenarioV3EditorPage() {
  const projectState = useScenarioV3PageProjectState();
  const presentationView = readScenarioEditorPresentationView(window.location.search);
  const presentationSessionId = readScenarioEditorPresentationSessionId(window.location.search);
  const initialSlideId = readScenarioEditorStepId(window.location.search);

  if (projectState.loading) {
    return <ScenarioV3LoadingState />;
  }
  if (!projectState.project) {
    return <ScenarioV3FatalState error={projectState.error} onRetry={projectState.retryLoad} />;
  }

  if (presentationView === 'audience') {
    return (
      <ScenarioAudiencePresentationPage
        project={projectState.project}
        reloadProject={projectState.retryLoad}
        sessionId={presentationSessionId}
      />
    );
  }

  return (
    <div
      data-ui="scenario.editor.v3-page.root"
      className="sniptale-extension-surface relative h-screen overflow-hidden
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-primary)]"
    >
      <ScenarioV3EditorShell
        project={projectState.project}
        initialSlideId={initialSlideId}
        onProjectChange={projectState.updateProject}
        saveStatus={{
          error: projectState.error,
          retrySave: projectState.retrySave,
          state: projectState.saveState,
        }}
        saveProject={projectState.saveProject}
      />
    </div>
  );
}

function ScenarioV3LoadingState() {
  return (
    <div
      data-ui="scenario.editor.v3-page.loading"
      className="grid h-screen place-items-center bg-[var(--sniptale-color-surface-canvas)] px-6
        text-[var(--sniptale-color-text-primary)]"
    >
      <div
        className="rounded-[16px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-5 py-3 text-sm"
      >
        {translate('scenario.editor.loading')}
      </div>
    </div>
  );
}

function ScenarioV3FatalState(props: { error: string | null; onRetry: () => Promise<void> }) {
  return (
    <div
      data-ui="scenario.editor.v3-page.error"
      className="grid h-screen place-items-center bg-[var(--sniptale-color-surface-canvas)] px-6"
      role="alert"
    >
      <div
        className="grid max-w-[420px] gap-4 rounded-[18px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] p-5 text-sm text-[var(--sniptale-color-text-primary)]"
      >
        <div>
          <h1 className="text-base font-semibold">{translate('scenario.editor.v3LoadFailed')}</h1>
          <p className="mt-1 text-[var(--sniptale-color-text-secondary)]">
            {props.error ?? translate('scenario.editor.v3LoadFailedHint')}
          </p>
        </div>
        <ProductActionButton tone="primary" onClick={() => void props.onRetry()}>
          {translate('scenario.editor.v3Retry')}
        </ProductActionButton>
      </div>
    </div>
  );
}
