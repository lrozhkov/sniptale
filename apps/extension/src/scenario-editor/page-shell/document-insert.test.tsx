// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { GuideDocumentInsert } from './document-insert';

it('offers step and section operations from one visible insertion trigger', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onOperate = vi.fn();
  await act(async () =>
    root.render(
      <GuideDocumentInsert
        target={{ kind: 'item', beforeItemId: 'next' }}
        disabled={false}
        onOperate={onOperate}
        t={(key) => translate(key, 'en')}
      />
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>('.guide-insertion-chrome button')!;
  expect(trigger.getAttribute('aria-label')).toBe('Insert step or section');
  await act(async () => trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const section = [
    ...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button'),
  ].find((button) => button.textContent?.includes('Add section'))!;
  await act(async () => section.click());
  expect(onOperate).toHaveBeenCalledWith({ kind: 'add-section', beforeItemId: 'next' });
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
