import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  translate: vi.fn(() => 'Default textbox text'),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: mocks.translate,
}));

import { attachEditorTextboxLifecycle } from './textbox-lifecycle';

function createTextbox(text: string, previous?: () => void) {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    textbox: {
      sniptaleEditingExitedHandler: previous,
      off: vi.fn(),
      on: vi.fn((eventName: string, handler: () => void) => handlers.set(eventName, handler)),
      text,
    },
  };
}

it('replaces old editing handlers and routes empty/default text to empty lifecycle', () => {
  const previous = vi.fn();
  const onEmpty = vi.fn();
  const { handlers, textbox } = createTextbox('Default textbox text', previous);

  attachEditorTextboxLifecycle(textbox as never, {
    onCommit: vi.fn(),
    onEmpty,
  });
  handlers.get('editing:exited')?.();

  expect(textbox.off).toHaveBeenCalledWith('editing:exited', previous);
  expect(onEmpty).toHaveBeenCalledOnce();
});

it('commits textbox lifecycle when text contains user content', () => {
  const onCommit = vi.fn();
  const { handlers, textbox } = createTextbox('Real note');

  attachEditorTextboxLifecycle(textbox as never, {
    onCommit,
    onEmpty: vi.fn(),
  });
  handlers.get('editing:exited')?.();

  expect(onCommit).toHaveBeenCalledWith(textbox);
});
