import { defineMessageSource } from '../../source';
import { contentToolbarCaptureMessages } from './capture';
import { contentToolbarDesignReviewMessages } from './design-review';
import { contentToolbarFeedbackMessages } from './feedback';
import { contentToolbarModesMessages } from './modes';

export const contentToolbarMessages = defineMessageSource({
  ...contentToolbarModesMessages,
  ...contentToolbarCaptureMessages,
  ...contentToolbarDesignReviewMessages,
  ...contentToolbarFeedbackMessages,
});
