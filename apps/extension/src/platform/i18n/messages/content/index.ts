import { contentAutoBlurMessages } from './auto-blur';
import { contentCalloutMessages } from './callout';
import { contentInteractiveFrameMessages } from './interactive-frame';
import { contentOverlayControlsMessages } from './overlay-controls';
import { contentDesignReviewMessages } from './design-review';
import { contentRuntimeMessages } from './runtime';
import { contentSaveDialogMessages } from './save-dialog';
import { contentStepBadgeMessages } from './step-badge';
import { contentTemplateForkMessages } from './template-fork';
import { contentToolbarMessages } from './toolbar/index';
import { defineMessageSource } from '../source';

export const contentMessages = defineMessageSource({
  runtime: contentRuntimeMessages,
  autoBlur: contentAutoBlurMessages,
  toolbar: contentToolbarMessages,
  saveDialog: contentSaveDialogMessages,
  callout: contentCalloutMessages,
  stepBadge: contentStepBadgeMessages,
  templateFork: contentTemplateForkMessages,
  interactiveFrame: contentInteractiveFrameMessages,
  overlayControls: contentOverlayControlsMessages,
  designReview: contentDesignReviewMessages,
});
