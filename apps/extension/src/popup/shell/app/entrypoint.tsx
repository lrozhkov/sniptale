import { renderPageShell } from '../../../ui/page-bootstrap';
import { finishPopupPerfSpanOnNextFrame, startPopupPerfSpan } from '../../diagnostics/performance';
import { PopupApp } from './index';

const popupStartupSpan = startPopupPerfSpan('popup.startup');
const navigationToShellSpan = startPopupPerfSpan('popup.navigation-to-first-react-shell', 0);

renderPageShell({
  element: <PopupApp />,
  namespace: 'PopupEntrypoint',
  onRendered: () => {
    finishPopupPerfSpanOnNextFrame(popupStartupSpan);
    finishPopupPerfSpanOnNextFrame(navigationToShellSpan, {
      entryEvaluatedAt: performance.getEntriesByName('sniptale-popup-entry-evaluated').at(-1)
        ?.startTime,
    });
  },
});
