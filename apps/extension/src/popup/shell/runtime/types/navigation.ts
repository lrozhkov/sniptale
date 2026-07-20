import type { Dispatch, SetStateAction } from 'react';
import type { PopupPage } from '../../navigation/actions';

export interface PopupRuntimeNavigationControls {
  isReady: boolean;
  page: PopupPage;
  showFooter: boolean;
  setPage: Dispatch<SetStateAction<PopupPage>>;
}
