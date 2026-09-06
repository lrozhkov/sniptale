// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedDomEvent: vi.fn(() => true),
}));

import { installEditableKeydownBridge } from './targets';

beforeEach(() => {
  document.body.replaceChildren();
});

it('owns host-cancelled contenteditable deletion and claimed Escape', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const dispose = installEditableKeydownBridge(root);
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  editable.textContent = 'abc';
  root.append(editable);
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  const backspace = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: 'Backspace',
  });
  backspace.preventDefault();

  editable.dispatchEvent(backspace);

  expect(editable.textContent).toBe('ab');

  editable.addEventListener('keydown', (event) => event.preventDefault());
  const laterOwner = vi.fn();
  window.addEventListener('keydown', laterOwner, { capture: true });
  const escape = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: 'Escape',
  });
  escape.preventDefault();
  editable.dispatchEvent(escape);

  expect(laterOwner).not.toHaveBeenCalled();
  window.removeEventListener('keydown', laterOwner, { capture: true });
  dispose();
});
