import { defineMessageSource } from '../source';
import { designSystemPageMessages } from './page/index';

export const designSystemMessages = defineMessageSource({
  page: designSystemPageMessages,
});
