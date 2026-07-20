import { defineMessageSource } from '../source';
import { editorCanvasMessages } from './canvas';
import { editorCompactMessages } from './compact/index';
import { editorDocumentActionsMessages } from './document-actions';
import { editorGradientMessages } from './gradient';
import { editorLayerEffectsMessages } from './layer-effects';
import { editorPageMessages } from './page';
import { editorRuntimeMessages } from './runtime';
import { editorSceneMessages } from './scene';
import { editorShapeCatalogMessages } from './shape-catalog';
import { editorSidebarMessages } from './sidebar';
import { editorToolbarMessages } from './toolbar';
import { editorToolsMessages } from './tools';

export const editorMessages = defineMessageSource({
  page: editorPageMessages,
  runtime: editorRuntimeMessages,
  tools: editorToolsMessages,
  sidebar: editorSidebarMessages,
  documentActions: editorDocumentActionsMessages,
  gradient: editorGradientMessages,
  layerEffects: editorLayerEffectsMessages,
  toolbar: editorToolbarMessages,
  scene: editorSceneMessages,
  canvas: editorCanvasMessages,
  shapeCatalog: editorShapeCatalogMessages,
  compact: editorCompactMessages,
});
