import { describe, expect, it, vi } from 'vitest';

import { createTemplateAddHandler, createTemplateEditHandler } from './template-editor';

describe('createTemplateAddHandler', () => {
  it('clears the editing template and opens the editor', () => {
    const setEditingTemplate = vi.fn();
    const setIsEditorOpen = vi.fn();

    createTemplateAddHandler({ setEditingTemplate, setIsEditorOpen })();

    expect(setEditingTemplate).toHaveBeenCalledWith(undefined);
    expect(setIsEditorOpen).toHaveBeenCalledWith(true);
  });
});

describe('createTemplateEditHandler', () => {
  it('copies the selected template into editor state and opens the editor', () => {
    const setEditingTemplate = vi.fn();
    const setIsEditorOpen = vi.fn();

    createTemplateEditHandler({ setEditingTemplate, setIsEditorOpen })({
      content: 'Template content',
      id: 'template-1',
      name: 'Template 1',
    });

    expect(setEditingTemplate).toHaveBeenCalledWith({
      content: 'Template content',
      id: 'template-1',
      name: 'Template 1',
    });
    expect(setIsEditorOpen).toHaveBeenCalledWith(true);
  });
});
