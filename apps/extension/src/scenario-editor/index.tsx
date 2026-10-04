import { GuideLayoutAssistance } from './page-shell/layout-assistance';
import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { ScenarioEditorPage } from './page-shell/ScenarioEditorPage';
import { ScenarioViewerPage } from './page-shell/viewer';
import { readScenarioViewRoute } from './page-shell/runtime/viewer';

const viewRoute = readScenarioViewRoute(location.search);

function ScenarioEditorApp() {
  if (viewRoute) return <ScenarioViewerPage route={viewRoute} />;
  return (
    <GuideLayoutAssistance>
      <ScenarioEditorPage />
    </GuideLayoutAssistance>
  );
}

renderPageShell({
  element: <ScenarioEditorApp />,
  namespace: 'ScenarioEditorEntrypoint',
  strictMode: true,
});
