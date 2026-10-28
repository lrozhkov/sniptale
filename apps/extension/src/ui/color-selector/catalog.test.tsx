// @vitest-environment jsdom
import { act, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ColorCatalogPanel } from './catalog-panel';
import {
  cssCatalog,
  createNamedCatalog,
  nearby,
  overview,
  family,
  lab,
  colorHint,
} from './catalog-model';
vi.mock('./catalog-data', async () => {
  const model = await import('./catalog-model');
  return { namedCatalog: model.createNamedCatalog(model.cssCatalog) };
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('uses reference Oklab endpoints and keeps CSS aliases and named values', () => {
  expect(lab('#000000')[0]).toBe(0);
  expect(lab('#ffffff')[0]).toBeCloseTo(1, 6);
  expect(lab('#ff0000')[0]).toBeCloseTo(0.627955, 5);
  const colors = createNamedCatalog([{ name: 'Rebecca Purple', hex: '#663399' }]);
  expect(colors.find((color) => color.hex === '#663399')?.aliases).toContain('rebeccapurple');
  expect(colorHint('#66339980')).toBe('rebeccapurple · #66339980');
});
it('builds a unique overview and offers real, distinct nearby entries', () => {
  const board = overview(cssCatalog, 'all');
  expect(new Set(board.map((color) => color.hex)).size).toBe(board.length);
  expect(board.slice(0, 8).map(family)).toEqual([
    'red',
    'orange',
    'yellow',
    'green',
    'cyan',
    'blue',
    'violet',
    'pink',
  ]);
  const alternatives = nearby(cssCatalog, '#663399');
  expect(alternatives.length).toBeGreaterThan(0);
  expect(alternatives.every((color) => cssCatalog.includes(color) && color.hex !== '#663399')).toBe(
    true
  );
});
it('keeps the last nearby preview in the row gaps and restores the chosen color on exit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<ColorCatalogPanel color="#66339980" onColorChange={vi.fn()} onExit={vi.fn()} />)
    );
    const row = host.querySelector('.sniptale-catalog-nearby')!;
    const button = row.querySelector('button')!;
    const title = host.querySelector('.sniptale-catalog-title strong')!;
    act(() =>
      button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: null }))
    );
    const hovered = title.textContent;
    expect(hovered).not.toBe('rebeccapurple');
    act(() =>
      button.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: row }))
    );
    expect(title.textContent).toBe(hovered);
    act(() =>
      row.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
      )
    );
    expect(title.textContent).toBe('rebeccapurple');
  } finally {
    await act(async () => root.unmount());
  }
});

it('measures the replacement in picker coordinates after scroll and UI scale compensation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const { useCatalogPlacement } = await import('./catalog-state');
  const { useRef } = await import('react');
  function Sample() {
    const ref = useRef<HTMLDivElement>(null);
    const bounds = useCatalogPlacement(ref, true);
    return (
      <div data-color-picker-body style={{ '--sniptale-content-ui-scale': '0.5' } as CSSProperties}>
        <div ref={ref} data-editor>
          <div data-ui="shared.ui.color-selector.hue" />
          <output>{`${bounds.top}:${bounds.height}`}</output>
        </div>
      </div>
    );
  }
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const top = this.hasAttribute('data-color-picker-body')
        ? 10
        : this.hasAttribute('data-editor')
          ? 15
          : 90;
      const height = this.getAttribute('data-ui') ? 20 : 100;
      return {
        top,
        bottom: top + height,
        left: 0,
        right: 100,
        x: 0,
        y: top,
        width: 100,
        height,
        toJSON() {},
      };
    });
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.hasAttribute('data-color-picker-body') ? 30 : 0;
  });
  try {
    await act(async () => root.render(<Sample />));
    expect(host.querySelector('output')?.textContent).toBe('-40:230');
  } finally {
    await act(async () => root.unmount());
    rect.mockRestore();
    scroll.mockRestore();
  }
});

it('filters CSS families, resets an empty search and selects through the virtualized keyboard grid', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { translate: t } = await import('../../platform/i18n');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const choose = vi.fn(),
    exit = vi.fn();
  const button = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.getAttribute('aria-label') === label
    )!;
  const type = async (value: string) =>
    act(async () => {
      const input = host.querySelector('input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(<ColorCatalogPanel color="#66339980" onColorChange={choose} onExit={exit} />)
    );
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('.sniptale-catalog-sources button')]
        .find((el) => el.textContent === 'CSS')!
        .click()
    );
    act(() => button(t('shared.ui.colorCatalogFamilyRed')).click());
    expect(
      host
        .querySelector('.sniptale-catalog-family[aria-pressed="true"]')
        ?.getAttribute('aria-label')
    ).toBe(t('shared.ui.colorCatalogFamilyRed'));
    act(() => button(t('shared.ui.colorCatalogGroupsAll')).click());
    act(() => button(t('shared.ui.colorCatalogAllShades')).click());
    const input = host.querySelector('input')!;
    act(() => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement?.getAttribute('data-color-index')).toBe('0');
    for (let index = 0; index < 16; index++)
      act(() =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        )
      );
    expect(Number(document.activeElement?.getAttribute('data-color-index'))).toBeGreaterThan(80);
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(choose).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}80$/));
    await type('zzzzzz');
    expect(host.querySelector('.sniptale-catalog-grid.is-empty')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('.sniptale-catalog-empty button')!.click());
    expect(input.value).toBe('');
    await type('coral');
    act(() => button(t('shared.ui.colorCatalogClear')).click());
    expect(input.value).toBe('');
    await type('coral');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(input.value).toBe('');
    expect(exit).not.toHaveBeenCalled();
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(exit).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
  }
});
