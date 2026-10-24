// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GradientTemplateResources } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import { createDefaultGradientPresetCatalog } from '../../composition/persistence/gradient-presets/defaults';
import { GradientTemplatePanel } from './template-panel';
import { GradientTemplateSave } from './template-save';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let resources: GradientTemplateResources;
const gradient = createDefaultGradientPresetCatalog().presets[0]!.gradient;
const select = vi.fn();
const configure = vi.fn();
const close = vi.fn();
const saved = vi.fn();
const save = vi.fn();
const rename = vi.fn();
const remove = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(true);
  rename.mockResolvedValue(true);
  remove.mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const system = createDefaultGradientPresetCatalog().presets[0]!;
  resources = {
    presets: [
      { ...system, name: 'System', favorite: false, isDefault: false },
      {
        ...structuredClone(system),
        id: 'user-test',
        name: 'Mine',
        origin: 'user',
        favorite: false,
        isDefault: false,
      },
    ],
    actions: {
      onSave: save,
      onRename: rename,
      onDelete: remove,
      onUpdate: vi.fn(),
      onEdit: vi.fn(),
      onToggleFavorite: vi.fn(),
      onToggleEnabled: vi.fn(),
      onSetDefault: vi.fn(),
      onResetPreset: vi.fn(),
      onReorder: vi.fn(),
    },
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function button(label: string) {
  const value = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!value) throw new Error(`Missing button ${label}`);
  return value;
}
function textButton(key: string) {
  const value = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (node) => node.textContent === `highlighter.paintPicker.${key}`
  );
  if (!value) throw new Error(`Missing command ${key}`);
  return value;
}
function input(value: string) {
  const field = host.querySelector<HTMLInputElement>('input');
  if (!field) throw new Error('Missing input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function renderPanel() {
  act(() =>
    root.render(
      <GradientTemplatePanel
        resources={resources}
        activeGradient={gradient}
        onCopy={configure}
        onSelect={select}
      />
    )
  );
}

it('selects without applying and configures a copy with independent stop identities', () => {
  renderPanel();
  expect(button('System').title).toBe('System');
  act(() => button('highlighter.paintPicker.templateGrid').click());
  expect(button('System').textContent).toBe('');
  act(() => button('System').click());
  expect(select).toHaveBeenCalledWith(gradient);
  expect(select.mock.calls[0]![0]).not.toBe(gradient);
  act(() => button('highlighter.paintPicker.configureTemplate: System').click());
  expect(configure).toHaveBeenCalledOnce();
  const copy = configure.mock.calls[0]![0];
  expect(copy.stops.map((stop: { id: string }) => stop.id)).not.toEqual(
    gradient.stops.map((stop) => stop.id)
  );
  expect(copy.stops.map((stop: { color: string }) => stop.color)).toEqual(
    gradient.stops.map((stop) => stop.color)
  );
  expect(host.querySelector('.lucide-copy')).toBeNull();
});

it('supports a compact named list, filtering, and no editing menu for system resources', () => {
  renderPanel();
  expect(
    host.querySelector('[aria-label="highlighter.paintPicker.templateActions: System"]')
  ).toBeNull();
  act(() => button('highlighter.paintPicker.templateList').click());
  expect(button('Mine').textContent).toBe('Mine');
  act(() => input('System'));
  expect(host.querySelector('button[aria-label="Mine"]')).toBeNull();
  expect(button('System')).not.toBeNull();
});

it('retains a failed rename and confirms deletion without changing the paint', async () => {
  rename.mockResolvedValueOnce(false);
  renderPanel();
  act(() => button('highlighter.paintPicker.templateActions: Mine').click());
  act(() => textButton('renameTemplate').click());
  const name = host.querySelector<HTMLInputElement>(
    'input[aria-label="highlighter.paintPicker.templateName"]'
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      name,
      'Renamed'
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(rename).toHaveBeenCalledWith('user-test', 'Renamed');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(name.value).toBe('Renamed');
  act(() => button('highlighter.paintPicker.closeTemplate').click());
  act(() => button('highlighter.paintPicker.templateActions: Mine').click());
  act(() => textButton('deleteTemplate').click());
  expect(remove).not.toHaveBeenCalled();
  act(() => textButton('cancelTemplate').click());
  expect(remove).not.toHaveBeenCalled();
  act(() => button('highlighter.paintPicker.templateActions: Mine').click());
  act(() => textButton('deleteTemplate').click());
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(remove).toHaveBeenCalledWith('user-test');
  expect(select).not.toHaveBeenCalled();
  expect(configure).not.toHaveBeenCalled();
});

it('keeps the name and candidate identity after failed save and saves independently of paint Apply', async () => {
  save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  act(() =>
    root.render(
      <GradientTemplateSave
        gradient={gradient}
        resources={resources}
        onClose={close}
        onSaved={saved}
      />
    )
  );
  act(() => input('Saved mine'));
  const submit = () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
  });
  expect(close).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('Saved mine');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => {
    submit();
  });
  expect(save.mock.calls[0]![2]).toBe(save.mock.calls[1]![2]);
  expect(save.mock.calls[1]!.slice(0, 2)).toEqual(['Saved mine', gradient]);
  expect(saved).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('keeps pointer available and prevents duplicate pending save commands', async () => {
  let accept!: (accepted: boolean) => void;
  save.mockReturnValue(
    new Promise<boolean>((resolve) => {
      accept = resolve;
    })
  );
  act(() =>
    root.render(<GradientTemplateSave gradient={gradient} resources={resources} onClose={close} />)
  );
  act(() => input('Pending'));
  act(() =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(submit.disabled).toBe(false);
  expect(submit.getAttribute('aria-busy')).toBe('true');
  act(() =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(save).toHaveBeenCalledOnce();
  await act(async () => accept(true));
});

it('finishes a pending library save without closing a later editor after its form unmounts', async () => {
  let accept!: (accepted: boolean) => void;
  save.mockReturnValue(
    new Promise<boolean>((resolve) => {
      accept = resolve;
    })
  );
  act(() =>
    root.render(
      <GradientTemplateSave
        gradient={gradient}
        resources={resources}
        onClose={close}
        onSaved={saved}
      />
    )
  );
  act(() => input('Pending'));
  act(() =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  act(() => root.render(<div>New editor</div>));
  await act(async () => accept(true));
  expect(save).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  expect(host.textContent).toBe('New editor');
});

it('keeps an anchored save form keyboard-owned and restores its trigger after dismissal', () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  let rect = { left: 100, top: 400, bottom: 432 };
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({ ...rect }) as DOMRect);
  const show = vi.fn(function (this: HTMLElement) {
    // JSDOM keeps native popovers hidden without this presentation emulation.
    this.removeAttribute('popover');
  });
  const hide = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
  const originalShow = HTMLElement.prototype.showPopover;
  const originalHide = HTMLElement.prototype.hidePopover;
  HTMLElement.prototype.showPopover = show;
  HTMLElement.prototype.hidePopover = hide;
  try {
    act(() =>
      root.render(
        <GradientTemplateSave
          anchor={anchor}
          gradient={gradient}
          resources={resources}
          onClose={close}
        />
      )
    );
    const form = host.querySelector<HTMLFormElement>('form')!;
    const field = form.querySelector<HTMLInputElement>('input')!;
    const controls = Array.from(form.querySelectorAll<HTMLElement>('button, input'));
    expect(show).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(field);
    expect(form.style.left).toBe('100px');
    rect = { left: 200, top: 4, bottom: 36 };
    window.dispatchEvent(new Event('resize'));
    expect(form.style.left).toBe('200px');
    expect(form.style.top).toBe('44px');
    controls[0]!.focus();
    const previous = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => form.dispatchEvent(previous));
    expect(previous.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(controls.at(-1));
    act(() =>
      form.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      )
    );
    expect(document.activeElement).toBe(controls[0]);
    act(() => form.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    act(() => anchor.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(close).not.toHaveBeenCalled();
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(close).toHaveBeenCalledOnce();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => form.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    field.focus();
    act(() => root.render(<div>Editor</div>));
    expect(hide).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
  } finally {
    HTMLElement.prototype.showPopover = originalShow;
    HTMLElement.prototype.hidePopover = originalHide;
    anchor.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('preserves a rejected save for retry and ignores an empty name', async () => {
  save.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(true);
  act(() =>
    root.render(
      <GradientTemplateSave
        gradient={gradient}
        resources={resources}
        onClose={close}
        onSaved={saved}
      />
    )
  );
  const submit = () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await act(async () => {
    submit();
  });
  expect(save).not.toHaveBeenCalled();
  act(() => input('Retained'));
  await act(async () => {
    submit();
  });
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('Retained');
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    submit();
  });
  expect(save.mock.calls[0]![2]).toBe(save.mock.calls[1]![2]);
  expect(saved).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
