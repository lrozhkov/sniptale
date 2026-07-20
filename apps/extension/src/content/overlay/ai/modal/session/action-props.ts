import {
  createModelSelectHandler,
  createResizeStartHandler,
  createTemplateAddHandler,
  createTemplateDeleteHandler,
  createTemplateEditHandler,
  createTemplateSaveHandler,
  createTemplateSelectHandler,
} from './actions';
import type { createAIModalActionHandlers } from './build';
import type { AIModalCoreState } from './core-state';

export function createAIModalActionHandlerArgs(
  core: AIModalCoreState
): Parameters<typeof createAIModalActionHandlers>[0] {
  return {
    addTemplate: core.templatesState.addTemplate,
    createModelSelectHandler,
    createResizeStartHandler,
    createTemplateAddHandler,
    createTemplateDeleteHandler,
    createTemplateEditHandler,
    createTemplateSaveHandler,
    createTemplateSelectHandler,
    editor: core.editor,
    prompt: core.prompt,
    removeTemplate: core.templatesState.removeTemplate,
    resize: core.resize,
    selectTemplate: core.templatesState.selectTemplate,
    setPrompt: core.setPrompt,
    settings: core.settings,
    updateTemplate: core.templatesState.updateTemplate,
  };
}
