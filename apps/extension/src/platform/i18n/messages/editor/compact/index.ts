import { defineMessageSource } from '../../source';
import { editorCompactBrushMessages } from './brush';
import { editorCompactCropMessages } from './crop';
import { editorCompactDocumentMessages } from './document';
import { editorCompactRichShapeMessages } from './rich-shape';
import { editorCompactSceneMessages } from './scene';
import { editorCompactShapeMessages } from './shape';
import { editorCompactSharedMessages } from './common';
import { editorCompactStepMessages } from './step';
import { editorCompactTextMessages } from './text';
import { editorCompactWorkspaceMessages } from './workspace';

export const editorCompactMessages = defineMessageSource({
  ...editorCompactSharedMessages,
  ...editorCompactBrushMessages,
  ...editorCompactShapeMessages,
  ...editorCompactRichShapeMessages,
  ...editorCompactTextMessages,
  ...editorCompactStepMessages,
  ...editorCompactCropMessages,
  ...editorCompactDocumentMessages,
  ...editorCompactSceneMessages,
  ...editorCompactWorkspaceMessages,
});
