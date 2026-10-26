// @vitest-environment jsdom
import {
  Harness,
  click,
  deferred,
  fill,
  mocks,
  root,
  selectTarget,
  shadow,
  submit,
  target,
  trusted,
  ui,
} from './view.test-support';
import { act } from 'react';
import { translate } from '../../../../platform/i18n';
import { expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';

it('opens the selected text form, rejects synthetic submission and commits literal text with Undo/Redo', async () => {
  await click(target, false);
  expect(shadow.querySelector('[data-ui="content.ai-text.popover"]')).toBeNull();
  await selectTarget();
  expect(ui('content.ai-text.source').textContent).toBe('Original words');
  await fill('Shorten this');
  await click(ui('content.ai-text.submit'), false);
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.request.mockResolvedValueOnce('<b>Literal answer</b>');
  await submit();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'Original words',
      prompt: 'Shorten this',
      model: expect.objectContaining({ id: 'model' }),
    })
  );
  expect(target.textContent).toBe('<b>Literal answer</b>');
  expect(target.querySelector('b')).toBeNull();
  expect(shadow.querySelector('[data-ui="content.ai-text.popover"]')).toBeNull();
  expect(shadow.activeElement).toBe(ui('content.toolbar.ai-text'));
  act(() => pagePreparationHistory.undo('page-editing'));
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  act(() => pagePreparationHistory.redo('page-editing'));
  expect(target.textContent).toBe('<b>Literal answer</b>');
});

it('shows elapsed time and preserves the draft after Stop, retry and a late response', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Keep this draft');
  vi.useFakeTimers();
  await submit();
  expect(ui('content.ai-text.status').textContent).toContain('content.toolbar.aiTextWaiting');
  await act(async () => vi.advanceTimersByTimeAsync(2200));
  expect(ui('content.ai-text.status').querySelector('[role="timer"]')?.textContent).toContain(
    'content.toolbar.aiTextElapsed'
  );
  const signal: AbortSignal = mocks.request.mock.calls[0]?.[0].signal;
  await submit();
  expect(signal.aborted).toBe(true);
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Keep this draft');
  expect(target.textContent).toBe('Original words');
  await submit();
  expect(target.textContent).toBe('Edited source');
  await act(async () => pending.resolve('Late old answer'));
  expect(target.textContent).toBe('Edited source');
});

it('cancels on close and restores focus without applying a delayed response', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Instruction');
  await submit();
  const signal: AbortSignal = mocks.request.mock.calls[0]?.[0].signal;
  await click(ui('content.ai-text.close'));
  expect(signal.aborted).toBe(true);
  expect(ui('content.toolbar.ai-text').getAttribute('aria-pressed')).toBe('false');
  expect(shadow.activeElement).toBe(ui('content.toolbar.ai-text'));
  await act(async () => pending.resolve('Late answer'));
  expect(target.textContent).toBe('Original words');
});

it('cancels when another mode hides the tool and does not apply its late result', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Instruction');
  await submit();
  const signal: AbortSignal = mocks.request.mock.calls[0]?.[0].signal;
  await act(async () => root.render(<Harness active={false} visible={false} />));
  expect(signal.aborted).toBe(true);
  expect(shadow.querySelector('[data-ui="content.ai-text.popover"]')).toBeNull();
  await act(async () => pending.resolve('Late answer'));
  expect(target.textContent).toBe('Original words');
});

it('switches the target during a request, preserving the draft and cancelling the request', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Shared instruction');
  await submit();
  const second = document.createElement('p');
  second.textContent = 'Second source';
  document.body.append(second);
  const signal: AbortSignal = mocks.request.mock.calls[0]?.[0].signal;
  await click(second);
  expect(signal.aborted).toBe(true);
  expect(ui('content.ai-text.source').textContent).toBe('Second source');
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Shared instruction');
  await submit();
  await act(async () => pending.resolve('Wrong old answer'));
  expect(target.textContent).toBe('Original words');
  expect(second.textContent).toBe('Edited source');
});

it('preserves external source edits, then permits a fresh selection and request', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Instruction');
  await submit();
  target.textContent = 'External update';
  await act(async () => pending.resolve('Stale response'));
  expect(target.textContent).toBe('External update');
  expect(ui('content.ai-text.feedback').textContent).toBe('content.toolbar.aiTextStale');
  await selectTarget();
  await submit();
  expect(target.textContent).toBe('Edited source');
  act(() => pagePreparationHistory.undo('page-editing'));
  expect(target.textContent).toBe('External update');
});

it('retains the accepted DOM and prompt after history refusal and allows retry', async () => {
  await selectTarget();
  await fill('Instruction');
  const refused = vi.spyOn(pagePreparationHistory, 'beginTransaction').mockReturnValueOnce(false);
  await submit();
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  expect(ui('content.ai-text.feedback').textContent).toBe('content.toolbar.aiTextError');
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Instruction');
  refused.mockRestore();
  await submit();
  expect(target.textContent).toBe('Edited source');
});

it.each(['too-large', 'timeout', 'model-unavailable'])(
  'shows a fixed recoverable %s error without changing the source',
  async (code) => {
    mocks.request.mockRejectedValueOnce(new Error(code));
    await selectTarget();
    await fill('Instruction');
    await submit();
    expect(ui('content.ai-text.feedback').getAttribute('role')).toBe('alert');
    expect(target.textContent).toBe('Original words');
    expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Instruction');
  }
);

it('recovers after a model bootstrap refusal without sending a request without a model', async () => {
  await click(ui('content.toolbar.ai-text'));
  mocks.models.mockRejectedValueOnce(new Error('Synthetic catalog failure'));
  await click(ui('content.toolbar.ai-text'));
  await selectTarget();
  await fill('Instruction');
  expect(shadow.textContent).toContain('content.toolbar.aiTextModelsError');
  expect(ui<HTMLButtonElement>('content.ai-text.submit').disabled).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
  await click(ui('content.ai-text.close'));
  await click(ui('content.toolbar.ai-text'));
  await selectTarget();
  await fill('Instruction');
  await submit();
  expect(target.textContent).toBe('Edited source');
});

it('keeps IME composition intact, then supports trusted keyboard submission and Escape cancellation', async () => {
  const pending = deferred<string>();
  mocks.request.mockReturnValueOnce(pending.promise);
  await selectTarget();
  await fill('Instruction');
  const input = ui<HTMLTextAreaElement>('content.ai-text.prompt');
  const composing = new KeyboardEvent('keydown', {
    key: 'Enter',
    ctrlKey: true,
    isComposing: true,
    composed: true,
    bubbles: true,
  });
  trusted.add(composing);
  await act(async () => input.dispatchEvent(composing));
  expect(mocks.request).not.toHaveBeenCalled();
  const enter = new KeyboardEvent('keydown', {
    key: 'Enter',
    ctrlKey: true,
    composed: true,
    bubbles: true,
  });
  trusted.add(enter);
  await act(async () => input.dispatchEvent(enter));
  expect(mocks.request).toHaveBeenCalledOnce();
  const signal: AbortSignal = mocks.request.mock.calls[0]?.[0].signal;
  const escape = new KeyboardEvent('keydown', { key: 'Escape', composed: true, bubbles: true });
  trusted.add(escape);
  await act(async () => input.dispatchEvent(escape));
  expect(signal.aborted).toBe(true);
  expect(shadow.querySelector('[data-ui="content.ai-text.popover"]')).toBeNull();
  await act(async () => pending.resolve('Late answer'));
  expect(target.textContent).toBe('Original words');
});

it.each([false, true])(
  'discloses selected text, instruction, destination and history (local=%s)',
  async (local) => {
    await click(ui('content.toolbar.ai-text'));
    mocks.models.mockResolvedValueOnce({
      defaultModelId: 'disclosed',
      models: [
        {
          id: 'disclosed',
          providerId: 'destination',
          modelCode: 'code',
          displayName: 'Disclosed model',
        },
      ],
      providers: [
        {
          id: 'destination',
          name: 'Disclosed provider',
          connectionType: local ? 'chrome-built-in' : 'openai-compatible',
        },
      ],
    });
    await click(ui('content.toolbar.ai-text'));
    await selectTarget();
    await fill('Instruction');
    const send = ui('content.ai-text.submit');
    const hint = send.getAttribute('title');
    expect(hint).toContain(
      local ? translate('aiModal.disclosureLocalDestination') : 'Disclosed provider'
    );
    expect(hint).toContain('Disclosed model');
    expect(hint).toContain(translate('content.toolbar.aiTextDisclosureData'));
    expect(hint).toContain(translate('aiModal.disclosureHistory'));
    expect(send.getAttribute('aria-description')).toBe(hint);
    expect(mocks.request).not.toHaveBeenCalled();
  }
);

it('offers ready prompts and places public dictation inside the prompt field', async () => {
  await selectTarget();
  expect(ui('content.ai-text.prompt-field').contains(ui('content.ai-text.prompt'))).toBe(true);
  expect(ui('content.ai-text.prompt-field').contains(ui('content.ai-text.voice'))).toBe(true);
  expect(ui('content.ai-text.footer').contains(ui('content.ai-text.voice'))).toBe(false);
  const picker = ui('ai-modal.template-picker');
  await click(picker.querySelector<HTMLButtonElement>('button')!);
  const option = Array.from(shadow.querySelectorAll<HTMLElement>('[role="option"]')).find((node) =>
    node.textContent?.includes('Shorten')
  );
  if (!option) throw new Error('The ready prompt option is missing');
  await click(option);
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe(
    'Make the selected text concise.'
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
