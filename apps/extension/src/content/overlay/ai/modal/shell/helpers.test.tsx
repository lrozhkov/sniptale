import { describe, expect, it, vi } from 'vitest';

import {
  createAIModalKeyDownHandler,
  createAIModalSubmitHandler,
  getAIModalFooterProps,
} from './helpers';
import type { useAIModalState } from '../session';

function createKeyboardEvent(overrides: Partial<React.KeyboardEvent<HTMLTextAreaElement>> = {}) {
  return {
    ctrlKey: false,
    key: '',
    metaKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
}

function createModalState() {
  return {
    availableModels: [
      {
        displayName: 'Model 1',
        id: 'model-1',
        modelCode: 'model-1',
        providerId: 'provider-1',
      },
    ],
    editingTemplate: undefined,
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(async () => undefined),
    handleEditTemplate: vi.fn(),
    handleModelSelect: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    handleSelectTemplate: vi.fn(async () => undefined),
    isEditorOpen: false,
    isResizing: false,
    prompt: 'Prompt',
    providers: [
      {
        connectionType: 'openai-compatible',
        createdAt: 0,
        destinationKind: 'external',
        hasStoredApiKey: false,
        id: 'provider-1',
        name: 'Provider',
      },
    ],
    resizerRef: { current: null },
    selectedData: 'data',
    selectedModelId: 'model-1',
    setIsEditorOpen: vi.fn(),
    setPrompt: vi.fn(),
    setSelectedData: vi.fn(),
    templateSubmitError: null,
    templates: [],
    templatesLoading: false,
    textareaRef: { current: null },
    totalTokens: 12,
    voice: {
      actions: { start: vi.fn(), stop: vi.fn() },
      state: {
        active: false,
        audioLevel: 0,
        caretPosition: null,
        errorCode: null,
        phase: 'idle',
      },
    },
  } satisfies ReturnType<typeof useAIModalState>;
}

describe('createAIModalSubmitHandler', () => {
  it('submits only non-empty prompts after trimming whitespace', () => {
    const onSubmit = vi.fn();

    createAIModalSubmitHandler(onSubmit, false, '  prompt  ', 'data', 'model-1')();
    createAIModalSubmitHandler(onSubmit, false, '   ', 'data', 'model-1')();
    createAIModalSubmitHandler(onSubmit, false, 'prompt', 'data', null)();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('prompt', 'data', 'model-1');
  });
});

describe('createAIModalKeyDownHandler', () => {
  it('handles the submit shortcut only when submit is allowed', () => {
    const handleSubmit = vi.fn();
    const handler = createAIModalKeyDownHandler({
      canSubmit: true,
      handleSubmit,
    });

    handler(createKeyboardEvent({ ctrlKey: true, key: 'Enter' }));
    handler(createKeyboardEvent({ key: 'Escape' }));
    createAIModalKeyDownHandler({ canSubmit: false, handleSubmit })(
      createKeyboardEvent({ ctrlKey: true, key: 'Enter' })
    );

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('getAIModalFooterProps', () => {
  it('derives footer props from modal state and loading flags', () => {
    const state = createModalState();

    expect(getAIModalFooterProps(vi.fn(), false, vi.fn(), state)).toEqual(
      expect.objectContaining({
        disabledSubmit: false,
        providers: state.providers,
        selectedModelId: 'model-1',
        totalTokens: 12,
      })
    );
  });
});
