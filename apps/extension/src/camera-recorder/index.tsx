import { renderPageShell } from '../ui/page-bootstrap';
import { createRuntimeMessagingTransport } from '../platform/runtime-messaging';
import '@sniptale/ui/styles';
import '../ui/compact-inspector-controls/inspector-surface.css';
import { CameraRecorderApp } from './shell/app';

const messaging = createRuntimeMessagingTransport();

renderPageShell({
  element: <CameraRecorderApp messaging={messaging} />,
  namespace: 'CameraRecorderEntrypoint',
  strictMode: true,
});
