import { describe, expect, it } from 'vitest';

import {
  createModelSelectHandler,
  createResizeStartHandler,
  createTemplateAddHandler,
  createTemplateDeleteHandler,
  createTemplateEditHandler,
  createTemplateSaveHandler,
  createTemplateSelectHandler,
} from './actions';
import * as editorActions from './template-editor';
import * as persistenceActions from './template-persistence';
import * as selectionActions from './selection';

describe('use-ai-modal-state.actions facade', () => {
  it('re-exports the canonical owner-local action handlers', () => {
    expect(createTemplateAddHandler).toBe(editorActions.createTemplateAddHandler);
    expect(createTemplateEditHandler).toBe(editorActions.createTemplateEditHandler);
    expect(createTemplateDeleteHandler).toBe(persistenceActions.createTemplateDeleteHandler);
    expect(createTemplateSaveHandler).toBe(persistenceActions.createTemplateSaveHandler);
    expect(createModelSelectHandler).toBe(selectionActions.createModelSelectHandler);
    expect(createResizeStartHandler).toBe(selectionActions.createResizeStartHandler);
    expect(createTemplateSelectHandler).toBe(selectionActions.createTemplateSelectHandler);
  });
});
