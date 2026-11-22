// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const language = vi.hoisted(() => ({ locale: 'en', translate: vi.fn<(key: string) => string>() }));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: language.translate,
  useAppLocale: () => language.locale,
}));

it('reads border labels after import and updates them when the prepared language changes', async () => {
  language.locale = 'en';
  language.translate.mockImplementation((key) => `${language.locale}:${key}`);
  const { SideValueInput } = await import('./side-value-input');
  expect(language.translate).not.toHaveBeenCalled();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    for (const locale of ['en', 'ru']) {
      language.locale = locale;
      for (const [value, key] of [
        ['none', 'optionNone'],
        ['solid', 'optionSolid'],
        ['dashed', 'optionDashed'],
        ['dotted', 'optionDotted'],
        ['double', 'optionDouble'],
      ] as const) {
        await act(async () =>
          root.render(
            <SideValueInput disabled={false} kind="select" value={value} onChange={onChange} />
          )
        );
        expect(host.textContent).toContain(`${locale}:content.designReview.${key}`);
      }
    }
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
