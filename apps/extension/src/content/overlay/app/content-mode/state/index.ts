export type {
  ContentAppModeControls,
  ContentAppModeFlags,
  ContentAppQuickActionState,
  ContentAppRuntimeModeControls,
  ContentAppViewportState,
  ContentAppVisibilityState,
  QueueAutoStartCapture,
} from './types';

import type { useContentSurfaceState } from './surface';
import type { ContentAppModeControls, ContentAppModeFlags } from './types';

export type ContentAppModeState = ContentAppModeFlags &
  ContentAppModeControls &
  ReturnType<typeof useContentSurfaceState>;
