import { defineMessageSource } from '../../source';
import { videoEditorSidebarSelectionCoreMessages } from './selection.core.ts';
import { videoEditorSidebarSelectionCursorMessages } from './selection.cursor.ts';
import { videoEditorSidebarSelectionEffectMessages } from './selection.effects.ts';
import { videoEditorSidebarSelectionGroupMessages } from './selection.groups.ts';
import { videoEditorSidebarSelectionMotionPathMessages } from './selection.motion-path.ts';
import { videoEditorSidebarSelectionSceneMessages } from './selection.scene.ts';
import { videoEditorSidebarSelectionTransitionMessages } from './selection.transition.ts';

export const videoEditorSidebarSelectionMessages = defineMessageSource({
  ...videoEditorSidebarSelectionCoreMessages,
  ...videoEditorSidebarSelectionCursorMessages,
  ...videoEditorSidebarSelectionEffectMessages,
  ...videoEditorSidebarSelectionGroupMessages,
  ...videoEditorSidebarSelectionMotionPathMessages,
  ...videoEditorSidebarSelectionSceneMessages,
  ...videoEditorSidebarSelectionTransitionMessages,
});
