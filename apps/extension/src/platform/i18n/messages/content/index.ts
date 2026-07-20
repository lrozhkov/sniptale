import { contentAutoBlurMessages } from './auto-blur';
import { contentCalloutMessages } from './callout';
import { contentInteractiveFrameMessages } from './interactive-frame';
import { contentOverlayControlsMessages } from './overlay-controls';
import { contentPageStyleInspectorMessages } from './page-style-inspector';
import { contentRuntimeMessages } from './runtime';
import { contentSaveDialogMessages } from './save-dialog';
import { contentStepBadgeMessages } from './step-badge';
import { contentToolbarMessages } from './toolbar/index';
import { defineMessageSource } from '../source';

export const contentMessages = defineMessageSource({
  runtime: contentRuntimeMessages,
  autoBlur: contentAutoBlurMessages,
  toolbar: contentToolbarMessages,
  saveDialog: contentSaveDialogMessages,
  callout: contentCalloutMessages,
  stepBadge: contentStepBadgeMessages,
  interactiveFrame: contentInteractiveFrameMessages,
  overlayControls: contentOverlayControlsMessages,
  pageStyleInspector: contentPageStyleInspectorMessages,
});
