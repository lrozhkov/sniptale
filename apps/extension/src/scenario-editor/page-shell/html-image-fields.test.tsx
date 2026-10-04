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
    await click('Optimize size');
    await choose('Maximum edge', '1280');
    await choose('WebP quality', '75%');
    await click('Click to view');
    expect(value).toEqual({
      content: 'full',
      optimize: true,
      maxEdge: 1280,
      quality: 0.75,
      viewer: false,
    });
    await click('Optimize size');
    expect(host.textContent).not.toContain('Maximum edge');
    expect(value.viewer).toBe(false);
    await choose('Saved content', 'Visible frame');
    await choose('WebP quality', '95%');
    expect(value).toEqual({
      content: 'frame',
      optimize: false,
      maxEdge: 1280,
      quality: 0.95,
      viewer: false,
    });
    await choose('Saved content', 'Full image');
    expect(value).toEqual({
      content: 'full',
      optimize: false,
      maxEdge: 1280,
      quality: 0.95,
      viewer: false,
    });
    expect(host.querySelector('p')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  'exposes only applicable frame controls with stored optimize=%s',
  async (optimize) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const change = vi.fn();
    const value = { ...DEFAULT_HTML_IMAGES, content: 'frame' as const, optimize, viewer: true };
    try {
      await act(async () =>
        root.render(
          <GuideHtmlImageFields value={value} onChange={change} t={createTranslator('en')} />
        )
      );
      const control = (label: string) =>
        host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
      expect(control('Click to view').disabled).toBe(true);
      expect(control('Click to view').getAttribute('aria-checked')).toBe('false');
      expect(control('Optimize size').disabled).toBe(true);
      expect(control('Optimize size').getAttribute('aria-checked')).toBe('true');
      expect(control('Maximum edge').disabled).toBe(true);
      expect(control('WebP quality').disabled).toBe(false);
      await act(async () => {
        control('Click to view').click();
        control('Optimize size').click();
        control('Maximum edge').click();
      });
      expect(change).not.toHaveBeenCalled();
      expect(document.querySelector('[role="option"]')).toBeNull();
      expect(value.viewer).toBe(true);
      expect(value.optimize).toBe(optimize);
      await act(async () => control('Saved content').click());
      await act(async () =>
        [...document.querySelectorAll<HTMLElement>('[role="option"]')]
          .find((option) => option.textContent === 'Full image')!
          .click()
      );
      expect(change).toHaveBeenCalledExactlyOnceWith({ content: 'full' });
      change.mockClear();
      await act(async () =>
        root.render(
          <GuideHtmlImageFields
            value={value}
            disabled
            onChange={change}
            t={createTranslator('en')}
          />
        )
      );
      for (const label of [
        'Saved content',
        'Optimize size',
        'Maximum edge',
        'WebP quality',
        'Click to view',
      ]) {
        expect(control(label).disabled).toBe(true);
        await act(async () => control(label).click());
      }
      expect(change).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);
