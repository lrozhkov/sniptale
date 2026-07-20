// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptTemplateEditorProps } from './types';
import { usePromptTemplateEditorState } from './use-state';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

type EditorState = ReturnType<typeof usePromptTemplateEditorState>;

let container: HTMLDivElement | null = null;
let latestState: EditorState | null = null;
let root: Root | null = null;

function PromptTemplateEditorHarness(props: PromptTemplateEditorProps) {
  const state = usePromptTemplateEditorState(props);

  useEffect(() => {
    latestState = state;
  });

  return <input ref={state.fields.nameInputRef} />;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHarness(props: Partial<PromptTemplateEditorProps> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  const nextProps: PromptTemplateEditorProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...props,
  };

  await act(async () => {
    root?.render(<PromptTemplateEditorHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prompt template editor state initialization', () => {
  it('hydrates template values on open and focuses the name input', async () => {
    const focusSpy = vi
      .spyOn(HTMLInputElement.prototype, 'focus')
      .mockImplementation(() => undefined);

    await renderHarness({
      template: {
        id: 'template-1',
        name: 'Summary',
        content: 'Summarize the current page',
      },
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(getState().fields.name).toBe('Summary');
    expect(getState().fields.content).toBe('Summarize the current page');
    expect(getState().validation.errors).toEqual({});
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});

describe('prompt template editor state validation', () => {
  it('blocks invalid submits and exposes translated validation errors', async () => {
    const props = await renderHarness();

    await act(async () => {
      await getState().actions.handleSubmit();
    });

    expect(props.onSave).not.toHaveBeenCalled();
    expect(getState().validation.errors).toEqual({
      content: 'templates.editor.contentRequired',
      name: 'templates.editor.nameRequired',
    });

    act(() => {
      getState().fields.setName('x'.repeat(51));
      getState().fields.setContent('Valid content');
    });
    await flushEffects();

    await act(async () => {
      await getState().actions.handleSubmit();
    });

    expect(props.onSave).not.toHaveBeenCalled();
    expect(getState().validation.errors).toEqual({
      name: 'templates.editor.nameTooLong',
    });
  });
});

describe('prompt template editor save flow', () => {
  it('trims values, saves them, and closes the editor', async () => {
    const props = await renderHarness();

    act(() => {
      getState().fields.setName('  Standup summary  ');
      getState().fields.setContent('  Capture the action items.  ');
    });
    await flushEffects();

    await act(async () => {
      await getState().actions.handleSubmit();
    });

    expect(props.onSave).toHaveBeenCalledWith('Standup summary', 'Capture the action items.');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(getState().validation.isDisabled).toBe(false);
  });

  it('keeps the dialog open when save fails', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));

    await renderHarness({ onClose, onSave });

    act(() => {
      getState().fields.setName('Template');
      getState().fields.setContent('Prompt body');
    });
    await flushEffects();

    await act(async () => {
      await getState().actions.handleSubmit();
    });

    expect(onSave).toHaveBeenCalledWith('Template', 'Prompt body');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('prompt template editor keyboard shortcuts', () => {
  it('closes on Escape and prevents the default browser action', async () => {
    const onClose = vi.fn();
    await renderHarness({ onClose });

    const preventDefault = vi.fn();
    act(() => {
      getState().actions.handleKeyDown({
        key: 'Escape',
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
