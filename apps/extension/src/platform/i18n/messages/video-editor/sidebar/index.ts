import { defineMessageSource } from '../../source';
import { videoEditorSidebarLibraryMessages } from './library';
import { videoEditorSidebarSelectionMessages } from './selection';
import { videoEditorSidebarShellMessages } from './shell';

export const videoEditorSidebarMessages = defineMessageSource({
  ...videoEditorSidebarShellMessages,
  ...videoEditorSidebarSelectionMessages,
  ...videoEditorSidebarLibraryMessages,
});
