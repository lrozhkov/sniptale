// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createModelSelectHandler,
  createResizeStartHandler,
  createTemplateSelectHandler,
} from './selection';

beforeEach(vi.clearAllMocks);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createModelSelectHandler', () => {
  it('updates the selected model locally', () => {
    const setSelectedModelId = vi.fn();

    createModelSelectHandler(setSelectedModelId)('model-1');

    expect(setSelectedModelId).toHaveBeenCalledWith('model-1');
  });
});

describe('createTemplateSelectHandler', () => {
  it('inserts content into the active textarea selection and blurs after update', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Before After';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(7, 12);
    const blurSpy = vi.spyOn(textarea, 'blur');
    const setPrompt = vi.fn();
    const stopVoiceInput = vi.fn();

    await createTemplateSelectHandler({
      selectTemplate: vi.fn().mockResolvedValue('Added'),
      setPrompt,
      stopVoiceInput,
      textareaRef: { current: textarea },
    })({ content: 'Template', id: 'template-1', name: 'Template 1' });

    expect(setPrompt).toHaveBeenCalledWith(expect.any(Function));
    expect(setPrompt.mock.calls[0]?.[0]('Before After')).toBe('Before Added');
    expect(textarea.selectionStart).toBe(12);
    expect(textarea.selectionEnd).toBe(12);
    expect(blurSpy).toHaveBeenCalledTimes(1);
    expect(stopVoiceInput).toHaveBeenCalledTimes(2);
  });

  it('prepends selected content when the textarea is not the active target', async () => {
    const setPrompt = vi.fn();
    const stopVoiceInput = vi.fn();

    await createTemplateSelectHandler({
      selectTemplate: vi.fn().mockResolvedValue('Inserted'),
      setPrompt,
      stopVoiceInput,
      textareaRef: { current: null },
    })({ content: 'Template', id: 'template-1', name: 'Template 1' });

    expect(setPrompt).toHaveBeenCalledWith(expect.any(Function));
    expect(setPrompt.mock.calls[0]?.[0]('Existing prompt')).toBe('Inserted\n\nExisting prompt');
    expect(stopVoiceInput).toHaveBeenCalledTimes(2);
  });

  it('invalidates voice before loading and again before committing a delayed template', async () => {
    let resolveTemplate!: (value: string) => void;
    const selectTemplate = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTemplate = resolve;
        })
    );
    const setPrompt = vi.fn();
    const stopVoiceInput = vi.fn();
    const selection = createTemplateSelectHandler({
      selectTemplate,
      setPrompt,
      stopVoiceInput,
      textareaRef: { current: null },
    });

    const pendingSelection = selection({
      content: 'Template',
      id: 'template-1',
      name: 'Template 1',
    });

    expect(stopVoiceInput).toHaveBeenCalledTimes(1);
    expect(stopVoiceInput.mock.invocationCallOrder[0]).toBeLessThan(
      selectTemplate.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );

    resolveTemplate('Resolved template');
    await pendingSelection;

    expect(stopVoiceInput).toHaveBeenCalledTimes(2);
    expect(stopVoiceInput.mock.invocationCallOrder[1]).toBeLessThan(
      setPrompt.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
  });
});

describe('createResizeStartHandler', () => {
  it('updates textarea height during drag and restores resize state on mouseup', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    Object.defineProperty(textarea, 'clientHeight', { configurable: true, value: 80 });
    const setIsResizing = vi.fn();
    const preventDefault = vi.fn();

    createResizeStartHandler({
      setIsResizing,
      textareaRef: { current: textarea },
    })({
      clientY: 100,
      preventDefault,
    });

    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 140 }));
    expect(textarea.style.height).toBe('120px');

    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setIsResizing).toHaveBeenNthCalledWith(1, true);
    expect(setIsResizing).toHaveBeenNthCalledWith(2, false);
  });

  it('does not enter resize mode when the textarea ref is missing', () => {
    const setIsResizing = vi.fn();

    createResizeStartHandler({
      setIsResizing,
      textareaRef: { current: null },
    })({
      clientY: 100,
      preventDefault: vi.fn(),
    });

    expect(setIsResizing).not.toHaveBeenCalled();
  });
});
