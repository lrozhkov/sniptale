import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/toolbar';
import '../ui/compact-inspector-controls/inspector-surface.css';
import { WebSnapshotViewerApp } from './shell/app';

renderPageShell({
  element: <WebSnapshotViewerApp />,
  namespace: 'WebSnapshotViewerEntrypoint',
});
