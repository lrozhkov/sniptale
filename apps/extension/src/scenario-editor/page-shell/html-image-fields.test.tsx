// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import { GuideHtmlImageFields } from './html-image-fields';
import { DEFAULT_HTML_IMAGES } from './html-image-settings';
it('edits content, bounded optimization and viewer independently using shared controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let value = { ...DEFAULT_HTML_IMAGES };
  const render = () =>
    root.render(
      <GuideHtmlImageFields
        value={value}
        onChange={(patch) => {
          value = { ...value, ...patch };
          render();
        }}
        t={createTranslator('en')}
      />
    );
  const click = async (label: string) =>
    act(async () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
    );
  const choose = async (label: string, option: string) => {
    await click(label);
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role=option]')]
        .find((node) => node.textContent?.includes(option))!
        .click()
    );
  };
  try {
    await act(async () => render());
    await choose('Saved content', 'Visible frame');
    await click('Optimize size');
    await choose('Maximum edge', '1280');
    await choose('WebP quality', '75%');
    await click('Click to view');
    expect(value).toEqual({
      content: 'frame',
      optimize: true,
      maxEdge: 1280,
      quality: 0.75,
      viewer: false,
    });
    await click('Optimize size');
    expect(host.textContent).not.toContain('Maximum edge');
    expect(value.viewer).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
