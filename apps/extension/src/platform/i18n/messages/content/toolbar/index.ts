import { defineMessageSource } from '../../source';
import { contentToolbarCaptureMessages } from './capture';
import { contentToolbarFeedbackMessages } from './feedback';
import { contentToolbarModesMessages } from './modes';

export const contentToolbarMessages = defineMessageSource({
  ...contentToolbarModesMessages,
  ...contentToolbarCaptureMessages,
  ...contentToolbarFeedbackMessages,
});
