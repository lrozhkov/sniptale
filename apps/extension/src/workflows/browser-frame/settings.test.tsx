// @vitest-environment jsdom
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { WindowHeaderSettings } from './settings';
import { InspectorLayout } from '../../ui/compact-inspector-controls/layout';
import {
  DEFAULT_WINDOW_HEADER,
  type WindowHeader,
} from '@sniptale/runtime-contracts/window-header';
const acquire = vi.hoisted(() => vi.fn());
const importIcon = vi.hoisted(() => vi.fn());
vi.mock('./local-icon', () => ({
  WINDOW_HEADER_ICON_ACCEPT: '.png,.ico,.svg',
  importWindowHeaderIcon: importIcon,
}));
vi.mock('./favicon', () => ({ acquireWindowHeaderFavicon: acquire }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const icon = 'data:image/png;base64,iVBORw0KGgo=';

it('keeps saved icon offline, clears on disable, and reacquires only on explicit enable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current: WindowHeader | undefined;
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>({
      ...DEFAULT_WINDOW_HEADER,
      url: 'example.test',
      faviconEnabled: true,
      faviconDataUrl: icon,
    });
    current = header;
    return <WindowHeaderSettings header={header} onChange={setHeader} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(acquire).not.toHaveBeenCalled();
    const button = host.querySelector<HTMLButtonElement>('button[aria-pressed="true"][title]')!;
    // Segmented controls have titles too; favicon is the final button.
    const toggle = () =>
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('windowHeader.favicon')}"]`
      )!;
    await act(async () => toggle().click());
    expect(current?.faviconEnabled).toBe(false);
    expect(current?.faviconDataUrl).toBeUndefined();
    expect(acquire).not.toHaveBeenCalled();
    acquire.mockResolvedValue(icon);
    await act(async () => toggle().click());
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(current?.faviconDataUrl).toBe(icon);
    expect(button).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('does not restore a late favicon after the user disables it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let resolve!: (value: string) => void;
  acquire.mockReturnValue(
    new Promise<string>((done) => {
      resolve = done;
    })
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current: WindowHeader | undefined;
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>({
      ...DEFAULT_WINDOW_HEADER,
      url: 'example.test',
    });
    current = header;
    return <WindowHeaderSettings header={header} onChange={setHeader} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const toggle = () =>
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('windowHeader.favicon')}"]`
      )!;
    await act(async () => toggle().click());
    await act(async () => toggle().click());
    await act(async () => resolve(icon));
    expect(current?.faviconEnabled).toBe(false);
    expect(current?.faviconDataUrl).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps typing local until blur or Enter and cancels an edit with Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>(DEFAULT_WINDOW_HEADER);
    return (
      <WindowHeaderSettings
        header={header}
        onChange={(next) => {
          changed(next);
          setHeader(next);
        }}
      />
    );
  }
  const input = () => host.querySelector<HTMLInputElement>('input')!;
  const type = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input(),
        value
      );
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => input().focus());
    await type('A');
    await type('A title');
    expect(input().value).toBe('A title');
    expect(changed).not.toHaveBeenCalled();
    await act(async () => input().blur());
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'A title' }));
    await act(async () => input().focus());
    await type('Cancel');
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(changed).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('A title');
    await act(async () => input().focus());
    await type('Accepted');
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('does not start favicon acquisition after an async image edit outlives its inspector', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await act(async () =>
    root.render(
      <WindowHeaderSettings
        header={{ ...DEFAULT_WINDOW_HEADER, url: 'example.test' }}
        onChange={() => pending}
      />
    )
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('windowHeader.favicon')}"]`
      )!
      .click()
  );
  await act(async () => root.unmount());
  await act(async () => finish());
  expect(acquire).not.toHaveBeenCalled();
});

function mountIconSettings(initial: WindowHeader) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let current = initial;
  function Harness() {
    const [header, setHeader] = useState(initial);
    current = header;
    return <WindowHeaderSettings header={header} onChange={(next) => setHeader(next ?? initial)} />;
  }
  act(() => root.render(<Harness />));
  return {
    host,
    current: () => current,
    async click(key: 'favicon' | 'fileIcon' | 'application') {
      await act(async () => {
        const label = translate(`windowHeader.${key}`);
        const button = Array.from(host.querySelectorAll('button')).find(
          (candidate) =>
            candidate.getAttribute('aria-label') === label || candidate.textContent === label
        );
        button!.click();
      });
    },
    async file(file?: File) {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    },
    async address(value: string) {
      const input = host.querySelector<HTMLInputElement>(
        `input[aria-label="${translate('windowHeader.address')}"]`
      )!;
      await act(async () => input.focus());
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => input.blur());
    },
    async dispose() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it('replaces website on file success, preserves it across address edits, and toggles both ways', async () => {
  const initial = {
    ...DEFAULT_WINDOW_HEADER,
    faviconEnabled: true,
    url: 'example.test',
    faviconDataUrl: icon,
  };
  const view = mountIconSettings(initial);
  const file = new File(['image'], 'icon.png', { type: 'image/png' });
  const custom = icon + 'custom';
  try {
    await view.file();
    expect(view.current()).toEqual(initial);
    importIcon.mockResolvedValueOnce(null);
    await view.file(file);
    expect(view.current()).toEqual(initial);
    expect(view.host.querySelector('[role="alert"]')).not.toBeNull();
    importIcon.mockResolvedValue(custom);
    await view.file(file);
    expect(view.current()).toMatchObject({
      faviconEnabled: true,
      faviconSource: 'file',
      faviconDataUrl: custom,
    });
    expect(
      view.host
        .querySelector(`button[aria-label="${translate('windowHeader.favicon')}"]`)
        ?.getAttribute('aria-pressed')
    ).toBe('false');
    await view.address('other.example');
    expect(view.current()).toMatchObject({
      url: 'other.example',
      faviconSource: 'file',
      faviconDataUrl: custom,
    });
    expect(acquire).not.toHaveBeenCalled();
    await view.click('fileIcon');
    expect(view.current().faviconEnabled).toBe(false);
    expect(view.current().faviconDataUrl).toBeUndefined();
    expect(view.current().faviconSource).toBeUndefined();
    const chooser = vi.spyOn(
      view.host.querySelector<HTMLInputElement>('input[type="file"]')!,
      'click'
    );
    await view.click('fileIcon');
    expect(chooser).toHaveBeenCalledOnce();
    await view.file(file);
    acquire.mockResolvedValue(icon);
    await view.click('favicon');
    expect(view.current()).toMatchObject({ faviconSource: 'site', faviconDataUrl: icon });
    await view.click('favicon');
    expect(view.current().faviconEnabled).toBe(false);
    expect(view.current().faviconSource).toBeUndefined();
  } finally {
    await view.dispose();
  }
});

it.each(['website', 'kind', 'unmount'] as const)(
  'discards a local decode superseded by %s',
  async (action) => {
    let finish!: (value: string) => void;
    importIcon.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const view = mountIconSettings({ ...DEFAULT_WINDOW_HEADER, url: 'example.test' });
    let disposed = false;
    try {
      await view.file(new File(['image'], 'icon.png'));
      const signal: AbortSignal = importIcon.mock.calls.at(-1)![1];
      if (action === 'website') {
        acquire.mockResolvedValue(icon);
        await view.click('favicon');
      } else if (action === 'kind') await view.click('application');
      else {
        await view.dispose();
        disposed = true;
      }
      expect(signal.aborted).toBe(true);
      await act(async () => finish(icon + 'late'));
      expect(view.current().faviconSource).not.toBe('file');
      expect(view.current().faviconDataUrl).not.toBe(icon + 'late');
    } finally {
      if (!disposed) await view.dispose();
    }
  }
);

it('does not let a late website response overwrite a chosen file', async () => {
  let finish!: (value: string) => void;
  acquire.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  importIcon.mockResolvedValue(icon + 'local');
  const view = mountIconSettings({ ...DEFAULT_WINDOW_HEADER, url: 'example.test' });
  try {
    await view.click('favicon');
    await view.file(new File(['image'], 'icon.png'));
    await act(async () => finish(icon));
    expect(view.current()).toMatchObject({ faviconSource: 'file', faviconDataUrl: icon + 'local' });
  } finally {
    await view.dispose();
  }
});

it('keeps the address and icon actions in one inspector value owner', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <InspectorLayout>
          <WindowHeaderSettings
            header={{ ...DEFAULT_WINDOW_HEADER, title: '', url: '' }}
            onChange={vi.fn()}
          />
        </InspectorLayout>
      )
    );
    const address = host.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('windowHeader.address')}"]`
    )!;
    const value = address.closest('.sniptale-parameter-value');
    expect(address.placeholder).toBe('example.com');
    expect(
      value?.querySelector(`button[aria-label="${translate('windowHeader.favicon')}"]`)
    ).not.toBeNull();
    expect(
      value?.querySelector(`button[aria-label="${translate('windowHeader.fileIcon')}"]`)
    ).not.toBeNull();
    expect(
      host.querySelector<HTMLInputElement>(
        `input[aria-label="${translate('windowHeader.tabTitle')}"]`
      )?.placeholder
    ).toBe(translate('windowHeader.tabTitle'));
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(['favicon', 'fileIcon'] as const)(
  'cancels an armed Space and suppresses repeated Enter for scoped %s actions',
  async (action) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <CommandPressScope value={true}>
            <WindowHeaderSettings header={DEFAULT_WINDOW_HEADER} onChange={vi.fn()} />
          </CommandPressScope>
        )
      );
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate(`windowHeader.${action}`)}"]`
      )!;
      const key = (type: 'keydown' | 'keyup', value: string, repeat = false) => {
        const event = new KeyboardEvent(type, {
          key: value,
          repeat,
          bubbles: true,
          cancelable: true,
        });
        act(() => button.dispatchEvent(event));
        return event;
      };
      key('keydown', ' ');
      expect(button.dataset['pressing']).toBe('true');
      key('keydown', 'Escape');
      expect(button.hasAttribute('data-pressing')).toBe(false);
      expect(key('keyup', ' ').defaultPrevented).toBe(true);
      key('keydown', 'Enter');
      expect(key('keydown', 'Enter', true).defaultPrevented).toBe(true);
      key('keyup', 'Enter');
      expect(button.hasAttribute('data-pressing')).toBe(false);
      expect(acquire).not.toHaveBeenCalled();
      expect(importIcon).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);

it('restores an explicitly supplied dormant header through the existing type control without acquisition', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const remembered = {
    ...DEFAULT_WINDOW_HEADER,
    style: 'macos' as const,
    theme: 'dark' as const,
    title: 'Сохранённый заголовок',
    url: 'https://example.test/retained',
  };
  let current: WindowHeader | undefined;
  function Harness() {
    const [header, setHeader] = useState<WindowHeader | undefined>();
    current = header;
    return (
      <WindowHeaderSettings header={header} rememberedHeader={remembered} onChange={setHeader} />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(current).toBeUndefined();
    expect(host.querySelectorAll('input')).toHaveLength(0);
    const browser = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === translate('windowHeader.browser')
    )!;
    await act(async () => browser.click());
    expect(current).toEqual(remembered);
    expect(
      Array.from(host.querySelectorAll('input')).some((input) => input.value === remembered.title)
    ).toBe(true);
    expect(acquire).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
