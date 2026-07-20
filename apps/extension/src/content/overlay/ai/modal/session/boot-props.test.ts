import { describe, expect, it, vi } from 'vitest';

import { createAIModalBootEffectArgs } from './boot-props';

function createControllerProps() {
  return {
    core: {
      editor: {
        editingTemplate: undefined,
        isEditorOpen: false,
        setEditingTemplate: vi.fn(),
        setIsEditorOpen: vi.fn(),
      },
      lastPrompt: 'stored prompt',
      prompt: 'Prompt',
      resize: {
        isResizing: false,
        resizerRef: { current: null },
        setIsResizing: vi.fn(),
        textareaRef: { current: null },
      },
      selectedData: 'Selected',
      setLastPrompt: vi.fn(),
      setPrompt: vi.fn(),
      setSelectedData: vi.fn(),
      settings: {
        availableModels: [],
        globalSystemPrompt: '',
        providers: [],
        selectedModelId: null,
        setAvailableModels: vi.fn(),
        setGlobalSystemPrompt: vi.fn(),
        setProviders: vi.fn(),
        setSelectedModelId: vi.fn(),
      },
      templatesState: {
        addTemplate: vi.fn(async () => undefined),
        error: null,
        isLoading: false,
        isMutating: false,
        refreshTemplates: vi.fn(async () => undefined),
        removeTemplate: vi.fn(async () => undefined),
        selectTemplate: vi.fn(async () => 'Template content'),
        templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
        updateTemplate: vi.fn(async () => undefined),
      },
      totalTokens: 13,
    },
    isOpen: true,
  };
}

describe('createAIModalBootEffectArgs', () => {
  it('maps controller state to the canonical boot seam contract', () => {
    const props = createControllerProps();

    expect(createAIModalBootEffectArgs(props)).toEqual({
      isOpen: true,
      lastPrompt: 'stored prompt',
      prompt: 'Prompt',
      setAvailableModels: props.core.settings.setAvailableModels,
      setGlobalSystemPrompt: props.core.settings.setGlobalSystemPrompt,
      setLastPrompt: props.core.setLastPrompt,
      setPrompt: props.core.setPrompt,
      setProviders: props.core.settings.setProviders,
      setSelectedModelId: props.core.settings.setSelectedModelId,
      textareaRef: props.core.resize.textareaRef,
    });
  });
});
