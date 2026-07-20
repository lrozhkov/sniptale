import { renderPageShell } from '../ui/page-bootstrap';
import { PopupApp } from './shell/app';
import {
  finishPopupPerfSpanOnNextFrame,
  startPopupPerfSpan,
} from './diagnostics/performance/index';

const popupStartupSpan = startPopupPerfSpan('popup.startup');

renderPageShell({
  element: <PopupApp />,
  namespace: 'PopupEntrypoint',
  onRendered: () => {
    finishPopupPerfSpanOnNextFrame(popupStartupSpan);
  },
});
