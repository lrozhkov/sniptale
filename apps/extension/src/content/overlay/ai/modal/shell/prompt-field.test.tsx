// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../voice-input/button', () => ({
  ContentVoiceInputButton: (props: { appearance?: string; disabled: boolean; onStart(): void }) => (
    <button
      data-appearance={props.appearance ?? 'default'}
      data-ui="content.ai-modal.prompt-voice-input"
      disabled={props.disabled}
      onClick={props.onStart}
      type="button"
    >
      voice
    </button>
  ),
}));

import { AIModalPromptField } from './prompt-field';

let container: HTMLDivElement;
let root: Root;
const setPrompt = vi.fn();
const start = vi.fn();
const stop = vi.fn();
const submit = vi.fn();
const textareaRef: { current: HTMLTextAreaElement | null } = { current: null };

function createState(
  args: { active?: boolean; caretPosition?: number | null; error?: boolean } = {}
): ComponentProps<typeof AIModalPromptField> {
  return {
    disabled: false,
    handleKeyDown: vi.fn(),
    handleResizeStart: vi.fn(),
    isResizing: false,
    onSelectTemplate: vi.fn(async () => undefined),
    prompt: 'Keep suffix',
    setPrompt,
    textareaRef,
    templates: [],
    templatesLoading: false,
    voice: {
      actions: { start, stop },
      state: {
        active: args.active ?? false,
        audioLevel: 0,
        caretPosition: args.caretPosition ?? null,
        errorCode: args.error ? 'runtime' : null,
        phase: args.active ? 'listening' : 'idle',
      },
    },
  };
}

function renderField(state = createState(), disabled = false) {
  act(() => {
    root.render(<AIModalPromptField {...state} disabled={disabled} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  setPrompt.mockClear();
  start.mockClear();
  stop.mockClear();
  submit.mockClear();
  textareaRef.current = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('AI Modal prompt voice control', () => {
  it('starts at the current caret without moving it on microphone interaction', () => {
    renderField();
    const textarea = container.querySelector<HTMLTextAreaElement>('#ai-prompt');
    textarea?.setSelectionRange(4, 4);

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-ui="content.ai-modal.prompt-voice-input"]')
        ?.click();
    });

    expect(start).toHaveBeenCalledWith('Keep suffix', 4);
    expect(
      container
        .querySelector('[data-ui="content.ai-modal.prompt-voice-input"]')
        ?.getAttribute('data-appearance')
    ).toBe('default');
  });

  it('stops active recognition before applying manual input', () => {
    renderField(createState({ active: true }));
    const textarea = container.querySelector<HTMLTextAreaElement>('#ai-prompt');

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(textarea, 'Manual value');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(setPrompt).toHaveBeenCalledWith('Manual value');
  });

  it('restores the streamed caret and exposes errors accessibly', () => {
    renderField(createState({ caretPosition: 6, error: true }));
    const textarea = container.querySelector<HTMLTextAreaElement>('#ai-prompt');

    expect(textarea?.selectionStart).toBe(6);
    expect(textarea?.classList.contains('sniptale-ai-modal-prompt-textarea')).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(textarea?.getAttribute('aria-describedby')).toContain(
      container.querySelector('[role="alert"]')?.id
    );
  });

  it('removes composer actions while the prompt is disabled', () => {
    renderField(createState(), true);

    expect(
      container.querySelector<HTMLButtonElement>('[data-ui="content.ai-modal.prompt-voice-input"]')
    ).toBeNull();
    expect(container.querySelector('.sniptale-ai-modal-prompt-submit')).toBeNull();
  });

  it('renders a passive Enter hint next to voice input without a composer submit button', () => {
    renderField();
    expect(container.querySelector('.sniptale-ai-modal-prompt-submit-hint')).not.toBeNull();
    expect(container.querySelector('.sniptale-ai-modal-prompt-submit')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Ctrl+Enter');
  });

  it('grows the prompt until five compact lines and then enables internal scrolling', () => {
    renderField();
    const textarea = container.querySelector<HTMLTextAreaElement>('#ai-prompt');
    if (!textarea) throw new Error('Expected prompt textarea');
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 180 });

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(textarea, 'A long prompt');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(textarea.style.height).toBe('136px');
    expect(textarea.style.overflowY).toBe('auto');
  });
});
