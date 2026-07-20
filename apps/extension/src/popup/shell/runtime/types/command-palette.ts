import type { PopupRuntimeState } from './state';

export type PopupCommandPaletteRuntime = Pick<
  PopupRuntimeState,
  'navigation' | 'home' | 'environment' | 'recording'
>;
