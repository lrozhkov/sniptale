import { renderPageShell } from '../ui/page-bootstrap';
import { usePageLocaleMetadata } from '../platform/i18n';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { ScenarioEditorPage } from './page-shell/ScenarioEditorPage';

function ScenarioEditorApp() {
  usePageLocaleMetadata('scenario.editor.documentTitle');
  return <ScenarioEditorPage />;
}

renderPageShell({
  element: <ScenarioEditorApp />,
  namespace: 'ScenarioEditorEntrypoint',
  strictMode: true,
});
