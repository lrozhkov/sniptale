// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createGlTransitionSelection } from '../features/video/project/transition/gl-catalog';
import { GlTransitionFields } from './gl-transition-fields';
const localeState = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ru' }));
vi.mock('../platform/i18n', async (original) => {
  const { translateCatalogFixture } = await import('../platform/i18n/catalog-fixture.test-support');
  return {
    ...(await original<typeof import('../platform/i18n')>()),
    useAppLocale: () => localeState.locale,
    translate: (key: Parameters<typeof translateCatalogFixture>[0], locale = localeState.locale) =>
      key.startsWith('videoEditor.glTransitions.') ? translateCatalogFixture(key, locale) : key,
  };
});
vi.mock('./compact-inspector-controls', async (original) => ({
  ...(await original<typeof import('./compact-inspector-controls')>()),
  ColorField: (props: {
    label: string;
    value: string;
    allowAlpha: boolean;
    onChange(value: string): void;
  }) => (
    <input
      aria-label={props.label}
      data-allow-alpha={props.allowAlpha}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localeState.locale = 'en';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function render(name: string, unavailable = false) {
  const initial = createGlTransitionSelection(name)!;
  const selection = unavailable ? { ...initial, wgslSha256: '0'.repeat(64) } : initial;
  const before = JSON.stringify(selection),
    change = vi.fn(),
    preview = vi.fn(),
    easing = vi.fn();
  act(() =>
    root.render(
      <GlTransitionFields
        selection={selection}
        easing="LINEAR"
        onChangeSelection={change}
        onPreviewSelection={preview}
        onChangeEasing={easing}
      />
    )
  );
  return { selection, before, change, preview, easing };
}
function input(id: string) {
  return host.querySelector<HTMLInputElement>(`[data-effect-control-id="${id}"] input`)!;
}
function type(node: HTMLInputElement, value: string, key = 'Enter') {
  act(() => node.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}
it('commits a float parameter through the shared numeric gesture without mutating source identity', () => {
  const view = render('CrossZoom');
  type(input('strength'), '0.7');
  expect(view.change).toHaveBeenCalledExactlyOnceWith({
    ...view.selection,
    values: { ...view.selection.values, strength: 0.7 },
  });
  expect(JSON.stringify(view.selection)).toBe(view.before);
  expect(view.preview).toHaveBeenLastCalledWith(null);
});
it('cancels an in-progress numeric edit without changing accepted settings', () => {
  const view = render('CrossZoom');
  type(input('strength'), '0.9', 'Escape');
  expect(view.change).not.toHaveBeenCalled();
  expect(input('strength').value).toBe('0.4');
  expect(view.preview).toHaveBeenLastCalledWith(null);
});
it('uses the common boolean switch and preserves other uniform values', () => {
  const view = render('BowTie');
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-effect-control-id="reverse"] [role="switch"]')!
      .click()
  );
  expect(view.change).toHaveBeenCalledExactlyOnceWith({
    ...view.selection,
    values: { ...view.selection.values, reverse: 1 },
  });
  expect(JSON.stringify(view.selection)).toBe(view.before);
});
it('edits one integer-vector component without resetting its sibling or other parameters', () => {
  const view = render('BlockSlide');
  type(input('grid.x'), '8');
  expect(view.change).toHaveBeenCalledExactlyOnceWith({
    ...view.selection,
    values: { ...view.selection.values, 'grid.x': 8 },
  });
  expect(JSON.stringify(view.selection)).toBe(view.before);
});
it('edits color uniforms through the common picker boundary', () => {
  const view = render('Accordion');
  const color = input('backColor');
  type(color, '#123456');
  expect(view.change).toHaveBeenCalledWith({
    ...view.selection,
    values: { ...view.selection.values, backColor: '#123456' },
  });
  expect(JSON.stringify(view.selection)).toBe(view.before);
});
it('keeps unavailable settings intact and does not expose editable uniforms', () => {
  const view = render('CrossZoom', true);
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    'videoEditor.sidebar.transitionImplementationUnavailable'
  );
  expect(host.querySelector('[data-effect-control-id]')).toBeNull();
  expect(view.change).not.toHaveBeenCalled();
  expect(JSON.stringify(view.selection)).toBe(view.before);
});

it.each([false, true])(
  'keeps the opaque preset action slot available without taking file authority (%s)',
  (unavailable) => {
    const selection = createGlTransitionSelection('Fade')!,
      action = vi.fn(),
      change = vi.fn();
    act(() =>
      root.render(
        <GlTransitionFields
          selection={unavailable ? { ...selection, wgslSha256: '0'.repeat(64) } : selection}
          easing="LINEAR"
          onChangeSelection={change}
          onChangeEasing={vi.fn()}
          presetActions={
            <button data-testid="preset-slot" onClick={action}>
              Preset action
            </button>
          }
        />
      )
    );
    const button = host.querySelector<HTMLButtonElement>('[data-testid=preset-slot]')!;
    expect(button).not.toBeNull();
    act(() => button.click());
    expect(action).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
  }
);

it.each([
  ['en', 'Pan downward', 'Off', 'Blur', 'Color separation', 'Perspective'],
  ['ru', 'Панорама вниз', 'Выкл.', 'Размытие', 'Разделение цветов', 'Перспектива'],
] as const)(
  'renders and operates localized WhipTilt fields in %s',
  (locale, label, enabled, blur, chroma, perspective) => {
    localeState.locale = locale;
    const view = render('WhipTilt');
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.getAttribute('aria-label')).toBe(label);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[data-effect-control-id="down"]')?.textContent).toContain(enabled);
    for (const text of [blur, chroma, perspective]) expect(host.textContent).toContain(text);
    act(() => toggle.click());
    expect(view.change).toHaveBeenCalledExactlyOnceWith({
      ...view.selection,
      values: { ...view.selection.values, down: 1 },
    });
    expect(JSON.stringify(view.selection)).toBe(view.before);
  }
);
