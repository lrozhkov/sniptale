import type { PopupRuntimeState } from './state';

export type PopupTabsRuntime = Pick<PopupRuntimeState, 'navigation' | 'environment'>;
