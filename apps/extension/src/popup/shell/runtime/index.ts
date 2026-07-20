import { useAppLocale } from '../../../platform/i18n';
import { usePopupRuntimeState } from './state';
import { assemblePopupRuntimeState } from './assembly';
import { usePopupRuntimeHandlers } from './handlers';
import { usePopupLifecycleSync } from './lifecycle';
import { usePopupPageAccessRuntime } from './page-access';
import type { PopupRuntimeState } from './types/state';

export function usePopupRuntime(): PopupRuntimeState {
  useAppLocale();
  const runtimeState = usePopupRuntimeState();
  const pageAccess = usePopupPageAccessRuntime(runtimeState.environment.activeTabCapabilities);

  usePopupLifecycleSync(runtimeState);
  const handlers = usePopupRuntimeHandlers(runtimeState);

  return assemblePopupRuntimeState(runtimeState, handlers, pageAccess);
}
