import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/toolbar';
import { WebSnapshotViewerApp } from './shell/app';

renderPageShell({
  element: <WebSnapshotViewerApp />,
  namespace: 'WebSnapshotViewerEntrypoint',
});
