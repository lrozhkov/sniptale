import { defineMessageSource } from '../../source';
import { designSystemPageOverviewMessages } from './overview';
import { designSystemPagePreviewMessages } from './preview';
import { designSystemPageRegistryMessages } from './registry';

export const designSystemPageMessages = defineMessageSource({
  ...designSystemPageOverviewMessages,
  ...designSystemPagePreviewMessages,
  ...designSystemPageRegistryMessages,
});
