import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import './previews/layout.css';
import { DesignSystemPage } from './shell/page';
import { DesignSystemThemeSurface } from './theme';

renderPageShell({
  element: (
    <DesignSystemThemeSurface>
      <DesignSystemPage />
    </DesignSystemThemeSurface>
  ),
  initializeTheme: false,
  namespace: 'DesignSystemEntrypoint',
});
