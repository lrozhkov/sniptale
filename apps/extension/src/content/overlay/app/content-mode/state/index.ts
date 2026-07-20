export type {
  ContentAppModeControls,
  ContentAppModeFlags,
  ContentAppQuickActionState,
  ContentAppRuntimeModeControls,
  ContentAppViewportState,
  ContentAppVisibilityState,
  QueueAutoStartCapture,
} from './types';

import type { useContentModeFlags } from './flags';
import type { useContentSurfaceState } from './surface';

export type ContentAppModeState = ReturnType<typeof useContentModeFlags> &
  ReturnType<typeof useContentSurfaceState>;
