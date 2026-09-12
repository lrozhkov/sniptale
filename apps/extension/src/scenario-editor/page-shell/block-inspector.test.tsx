// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideBlockInspector } from './block-inspector';

it('disables mutations while retaining navigation to the step', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  const close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GuideBlockInspector
          item={createGuideStep('Step')}
          block={{ kind: 'note', id: 'note', paragraphs: [], tone: 'info' }}
          disabled
          onChange={change}
          onClose={close}
          t={createTranslator('en')}
        />
      )
    );
    const fields = host.querySelector('fieldset')!;
    expect(fields.disabled).toBe(true);
    for (const button of fields.querySelectorAll('button')) {
      expect(button.matches(':disabled')).toBe(true);
      await act(async () => button.click());
    }
    expect(change).not.toHaveBeenCalled();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Step settings"]')!.click()
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
