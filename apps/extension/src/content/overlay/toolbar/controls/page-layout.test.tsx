// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  NormalizedSettings,
  SettingsPatch,
  PageToolbarMode,
} from '../../../../contracts/settings';
const persistence = vi.hoisted(() => ({
  load: vi.fn<() => Promise<NormalizedSettings>>(),
  patch: vi.fn<(patch: SettingsPatch) => Promise<NormalizedSettings>>(),
}));
vi.mock('../../../../composition/persistence/settings', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: persistence.load,
  patchSettings: persistence.patch,
}));
import { createDefaultSettings } from '../../../../composition/persistence/settings';
import { PageToolbarControlsContext, usePageToolbarControls } from '../state/page-controls';
import { PageControlVisibility } from './control-visibility';
import {
  PageToolbarGroup,
  PageToolbarLayoutProvider,
  PageToolbarSlot,
  PageToolbarLayoutDecorations,
} from './page-layout';
let host: HTMLDivElement;
let root: Root;
let preferences: ReturnType<typeof usePageToolbarControls>;
let settings: NormalizedSettings;
const command = vi.fn();
let showOptional: () => void;
let hideOptional: () => void;
function OptionalControl() {
  const [shown, setShown] = useState(false);
  showOptional = () => setShown(true);
  hideOptional = () => setShown(false);
  return shown ? (
    <PageToolbarSlot id="auto-blur" label="Optional">
      <button>Optional</button>
    </PageToolbarSlot>
  ) : null;
}
function Harness(props: { mode?: PageToolbarMode } = {}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  preferences = usePageToolbarControls(true, props.mode);
  return (
    <PageToolbarControlsContext value={preferences}>
      <PageToolbarLayoutProvider toolbarRef={toolbarRef}>
        <div ref={toolbarRef} data-ui="content.toolbar.root" data-display-mode="horizontal">
          <PageToolbarGroup>
            <PageToolbarSlot id="mode" label="Mode">
              <button onClick={command}>Mode</button>
            </PageToolbarSlot>
          </PageToolbarGroup>
          <PageToolbarGroup>
            <PageControlVisibility control="capture-visible" label="Capture">
              <button onClick={command}>Capture</button>
            </PageControlVisibility>
            <PageToolbarSlot id="settings" label="Settings">
              <button onClick={command}>Settings</button>
            </PageToolbarSlot>
          </PageToolbarGroup>
          <OptionalControl />
          <PageToolbarLayoutDecorations />
        </div>
      </PageToolbarLayoutProvider>
    </PageToolbarControlsContext>
  );
}
const overlay = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-page-toolbar-item="${id}"] > button`)!;
function pointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}
async function customize() {
  await act(async () => root.render(<Harness />));
  act(() => preferences.toggleEditing());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  settings = createDefaultSettings();
  settings.contentToolbar!.pageLayouts = { cursor: ['mode', 'capture-visible', 'settings'] };
  persistence.load.mockImplementation(async () => settings);
  persistence.patch.mockImplementation(async (patch) => {
    settings = {
      ...settings,
      contentToolbar: { ...settings.contentToolbar!, ...patch.contentToolbar },
    };
    return settings;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementFromPoint');
});
it('keeps below-threshold clicks as visibility choices without executing the underlying command', async () => {
  await customize();
  const button = overlay('capture-visible');
  await act(async () => {
    pointer(button, 'pointerdown', 10, 10);
    pointer(button, 'pointermove', 13, 10);
    pointer(button, 'pointerup', 13, 10);
    button.click();
  });
  expect(persistence.patch).toHaveBeenCalledExactlyOnceWith({
    contentToolbar: { pageControls: { 'capture-visible': false } },
  });
  expect(command).not.toHaveBeenCalled();
});
it('commits a drop across groups once and suppresses its visibility click', async () => {
  await customize();
  const target = overlay('mode');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  vi.spyOn(target.parentElement!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 28, 28)
  );
  const source = overlay('capture-visible');
  await act(async () => {
    pointer(source, 'pointerdown', 50, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(Number(source.parentElement!.style.order)).toBeLessThan(
    Number(target.parentElement!.style.order)
  );
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(host.querySelector('[data-page-toolbar-drop]')).toBeNull();
  await act(async () => {
    pointer(source, 'pointerup', 5, 10);
    source.click();
  });
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  expect(preferences.layout.indexOf('capture-visible') + 1).toBe(
    preferences.layout.indexOf('mode')
  );
  expect(preferences.controls['capture-visible']).toBe(true);
  expect(command).not.toHaveBeenCalled();
});
it.each(['pointercancel', 'lostpointercapture', 'Escape'])(
  'cancels %s without a write or accidental visibility click',
  async (cancel) => {
    await customize();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => overlay('mode'),
    });
    const source = overlay('capture-visible');
    act(() => {
      pointer(source, 'pointerdown', 50, 10);
      pointer(source, 'pointermove', 5, 10);
    });
    await act(async () => {
      if (cancel === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else pointer(source, cancel, 5, 10);
      pointer(source, 'pointerup', 5, 10);
      source.click();
    });
    expect(persistence.patch).not.toHaveBeenCalled();
    expect(preferences.editing).toBe(true);
    expect(host.querySelector('[data-page-toolbar-drop]')).toBeNull();
  }
);
it('moves a button with Alt+Arrow and keeps its focus', async () => {
  await customize();
  const source = overlay('capture-visible');
  source.focus();
  await act(async () =>
    source.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })
    )
  );
  expect(preferences.layout.indexOf('capture-visible') + 1).toBe(
    preferences.layout.indexOf('mode')
  );
  expect(document.activeElement).toBe(source);
  expect(command).not.toHaveBeenCalled();
});
it('adds and removes a divider through real customization controls', async () => {
  await customize();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.customize-add-divider"]')!
      .click()
  );
  const id = preferences.layout.find((item) => item.startsWith('separator:'))!;
  expect(id).toBeDefined();
  await act(async () => overlay(id).click());
  expect(preferences.layout).not.toContain(id);
  expect(persistence.patch).toHaveBeenCalledTimes(2);
});

it('admits a fresh keyboard activation when the press owner suppresses the post-drag pointer click', async () => {
  await customize();
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => overlay('mode'),
  });
  const source = overlay('capture-visible');
  await act(async () => {
    pointer(source, 'pointerdown', 50, 10);
    pointer(source, 'pointermove', 5, 10);
    pointer(source, 'pointerup', 5, 10);
  });
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  await act(async () => {
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    source.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    source.click();
  });
  expect(preferences.controls['capture-visible']).toBe(false);
  expect(persistence.patch).toHaveBeenCalledTimes(2);
});

it('keeps one visible divider between surviving buttons after hiding the intervening group', async () => {
  settings.contentToolbar!.pageLayouts = {
    cursor: [
      'separator:leading',
      'mode',
      'separator:first',
      'capture-visible',
      'separator:second',
      'settings',
      'separator:trailing',
    ],
  };
  settings.contentToolbar!.pageControls = { 'capture-visible': false };
  await act(async () => root.render(<Harness />));
  const visibleDividers = [
    ...host.querySelectorAll<HTMLElement>('[data-page-toolbar-divider]'),
  ].map((node) => node.dataset['pageToolbarItem']);
  expect(visibleDividers).toEqual(['separator:second']);
});

it('keeps Add divider focus during a pending save and admits only one divider', async () => {
  await customize();
  let complete!: (settings: NormalizedSettings) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const button = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.customize-add-divider"]'
  )!;
  button.focus();
  await act(async () => button.click());
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(button);
  act(() => button.click());
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  await act(async () =>
    complete({
      ...settings,
      contentToolbar: {
        ...settings.contentToolbar!,
        ...persistence.patch.mock.calls[0]![0].contentToolbar,
      },
    })
  );
  expect(document.activeElement).toBe(button);
});

it('updates keyboard targets when an optional child mounts without a toolbar render', async () => {
  await customize();
  await act(async () => showOptional());
  await act(async () =>
    overlay('mode').dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        altKey: true,
        bubbles: true,
      })
    )
  );
  expect(preferences.layout.indexOf('mode')).toBe(preferences.layout.indexOf('auto-blur') + 1);
  expect(persistence.patch).toHaveBeenCalledTimes(1);
});

it('cancels a gesture when the active page mode changes', async () => {
  await customize();
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => overlay('mode'),
  });
  const source = overlay('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 50, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  await act(async () => root.render(<Harness mode="drawing" />));
  expect(host.querySelector('[data-page-reordering]')).toBeNull();
  await act(async () => {
    pointer(source, 'pointerup', 5, 10);
    source.click();
  });
  expect(persistence.patch).not.toHaveBeenCalled();
});
it('holds the dropped preview through lost capture and restores accepted order after a failed save', async () => {
  await customize();
  const target = overlay('mode');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  vi.spyOn(target.parentElement!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 28, 28)
  );
  let refuse!: (reason: Error) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((_, reject) => {
      refuse = reject;
    })
  );
  const source = overlay('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 50, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  act(() => {
    pointer(source, 'pointerup', 5, 10);
    pointer(source, 'lostpointercapture', 5, 10);
  });
  expect(Number(source.parentElement!.style.order)).toBeLessThan(
    Number(target.parentElement!.style.order)
  );
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  await act(async () => refuse(new Error('save refused')));
  expect(Number(source.parentElement!.style.order)).toBeGreaterThan(
    Number(target.parentElement!.style.order)
  );
  expect(preferences.error).not.toBeNull();
});

it.each([false, true])(
  'respects reduced motion=%s and releases preview animations on cancellation',
  async (reduced) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    const prior = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return new DOMRect(Number(this.style.order || 0) * 40, 0, 32, 32);
    });
    try {
      await customize();
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => overlay('mode'),
      });
      const source = overlay('capture-visible');
      act(() => {
        pointer(source, 'pointerdown', 50, 10);
        pointer(source, 'pointermove', 5, 10);
      });
      if (reduced) expect(animate).not.toHaveBeenCalled();
      else expect(animate).toHaveBeenCalled();
      act(() => pointer(source, 'pointercancel', 5, 10));
      if (!reduced) expect(cancel).toHaveBeenCalled();
      animate.mockClear();
      await act(async () => root.render(<Harness mode="drawing" />));
      expect(animate).not.toHaveBeenCalled();
      expect(persistence.patch).not.toHaveBeenCalled();
    } finally {
      if (prior) Object.defineProperty(HTMLElement.prototype, 'animate', prior);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  }
);

it('releases the grabbing state when a conditional source disappears during the gesture', async () => {
  await customize();
  await act(async () => showOptional());
  const source = overlay('auto-blur');
  act(() => pointer(source, 'pointerdown', 50, 10));
  expect(host.querySelector('[data-page-reordering]')).not.toBeNull();
  await act(async () => hideOptional());
  expect(host.querySelector('[data-page-reordering]')).toBeNull();
  expect(persistence.patch).not.toHaveBeenCalled();
});

it('keeps a pending drop preview in its originating mode', async () => {
  await customize();
  const target = overlay('mode');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  vi.spyOn(target.parentElement!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 28, 28)
  );
  let complete!: (value: NormalizedSettings) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const source = overlay('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 50, 10);
    pointer(source, 'pointermove', 5, 10);
    pointer(source, 'pointerup', 5, 10);
  });
  expect(Number(source.parentElement!.style.order)).toBeLessThan(
    Number(target.parentElement!.style.order)
  );
  await act(async () => root.render(<Harness mode="drawing" />));
  expect(Number(overlay('capture-visible').parentElement!.style.order)).toBeGreaterThan(
    Number(overlay('mode').parentElement!.style.order)
  );
  expect(preferences.pending).toBe(true);
  await act(async () =>
    complete({
      ...settings,
      contentToolbar: {
        ...settings.contentToolbar!,
        ...persistence.patch.mock.calls[0]![0].contentToolbar,
      },
    })
  );
  expect(preferences.mode).toBe('drawing');
  expect(preferences.layout.indexOf('capture-visible')).toBeGreaterThan(
    preferences.layout.indexOf('mode')
  );
  expect(persistence.patch).toHaveBeenCalledTimes(1);
});

function addDividerSource() {
  return host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.customize-add-divider"]'
  )!;
}
function pointAt(id: string, rect = new DOMRect(0, 0, 28, 28)) {
  const target = overlay(id);
  vi.spyOn(target.parentElement!, 'getBoundingClientRect').mockReturnValue(rect);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
}
it('does not add a divider on an ordinary pointer click', async () => {
  await customize();
  await act(async () =>
    addDividerSource().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  );
  expect(persistence.patch).not.toHaveBeenCalled();
});
it('copies the divider source into the pointer gap once and leaves its source available', async () => {
  await customize();
  const source = addDividerSource();
  pointAt('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(persistence.patch).not.toHaveBeenCalled();
  const draft = host.querySelector<HTMLElement>('[data-page-toolbar-divider]')!;
  expect(draft).not.toBeNull();
  expect(Number(draft.style.order) + 1).toBe(
    Number(overlay('capture-visible').parentElement!.style.order)
  );
  await act(async () => {
    pointer(source, 'pointerup', 5, 10);
    source.click();
  });
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  expect(addDividerSource()).toBe(source);
  expect(preferences.layout.filter((item) => item.startsWith('separator:'))).toHaveLength(1);
});
it('previews a divider beside another divider but cancels an invalid terminal drop', async () => {
  settings.contentToolbar!.pageLayouts = {
    cursor: ['mode', 'separator:first', 'capture-visible', 'separator:second', 'settings'],
  };
  await customize();
  const original = [...preferences.layout];
  const source = overlay('separator:first');
  pointAt('separator:second');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).not.toBeNull();
  expect(persistence.patch).not.toHaveBeenCalled();
  await act(async () => {
    pointer(source, 'pointerup', 5, 10);
    source.click();
  });
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(preferences.layout).toEqual(original);
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).toBeNull();
});

it('passes through a divider before committing beyond it without deleting either divider', async () => {
  settings.contentToolbar!.pageLayouts = {
    cursor: ['mode', 'separator:first', 'capture-visible', 'separator:second', 'settings'],
  };
  await customize();
  const source = overlay('separator:first');
  const dividerNodes = Array.from(host.querySelectorAll('[data-page-toolbar-divider]'));
  pointAt('separator:second');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).not.toBeNull();
  pointAt('settings');
  act(() => pointer(source, 'pointermove', 25, 10));
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).toBeNull();
  expect(Array.from(host.querySelectorAll('[data-page-toolbar-divider]'))).toEqual(dividerNodes);
  await act(async () => {
    pointer(source, 'pointerup', 25, 10);
    source.click();
  });
  expect(preferences.layout.indexOf('separator:first')).toBe(
    preferences.layout.indexOf('settings') + 1
  );
  expect(preferences.layout).toContain('separator:second');
  expect(persistence.patch).toHaveBeenCalledTimes(1);
});
it('uses the terminal pointer hit and cancels a copy released outside without an extra move event', async () => {
  await customize();
  const original = [...preferences.layout];
  const source = addDividerSource();
  pointAt('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(host.querySelector('[data-page-toolbar-divider]')).not.toBeNull();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  await act(async () => {
    pointer(source, 'pointerup', 500, 500);
    source.click();
  });
  expect(preferences.layout).toEqual(original);
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(host.querySelector('[data-page-toolbar-divider]')).toBeNull();
});
it.each(['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'mode'])(
  'discards a provisional copy after %s without a write',
  async (reason) => {
    await customize();
    const source = addDividerSource();
    pointAt('capture-visible');
    act(() => {
      pointer(source, 'pointerdown', 100, 10);
      pointer(source, 'pointermove', 5, 10);
    });
    expect(host.querySelector('[data-page-toolbar-divider]')).not.toBeNull();
    if (reason === 'mode') await act(async () => root.render(<Harness mode="drawing" />));
    else
      act(() => {
        if (reason === 'Escape')
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        else pointer(source, reason, 5, 10);
      });
    await act(async () => {
      pointer(source, 'pointerup', 5, 10);
      source.click();
    });
    expect(persistence.patch).not.toHaveBeenCalled();
    expect(host.querySelector('[data-page-reordering]')).toBeNull();
    expect(host.querySelector('[data-page-toolbar-invalid]')).toBeNull();
  }
);
it('keeps a copy preview through pending save/lost capture and restores on refusal before explicit retry', async () => {
  await customize();
  let refuse!: (error: Error) => void;
  persistence.patch.mockReturnValueOnce(
    new Promise((_, reject) => {
      refuse = reject;
    })
  );
  const source = addDividerSource();
  pointAt('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
    pointer(source, 'pointerup', 5, 10);
  });
  expect(preferences.pending).toBe(true);
  expect(host.querySelectorAll('[data-page-toolbar-divider]')).toHaveLength(1);
  act(() => {
    pointer(source, 'lostpointercapture', 5, 10);
    source.click();
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
    pointer(source, 'pointerup', 5, 10);
  });
  expect(persistence.patch).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('[data-page-toolbar-divider]')).toHaveLength(1);
  await act(async () => refuse(new Error('save refused')));
  expect(preferences.error).not.toBeNull();
  expect(host.querySelectorAll('[data-page-toolbar-divider]')).toHaveLength(0);
  await act(async () => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
    pointer(source, 'pointerup', 5, 10);
  });
  expect(persistence.patch).toHaveBeenCalledTimes(2);
  expect(preferences.layout.filter((item) => item.startsWith('separator:'))).toHaveLength(1);
  expect(preferences.error).toBeNull();
});
it('skips invalid divider positions with keyboard reordering', async () => {
  settings.contentToolbar!.pageLayouts = {
    cursor: ['mode', 'separator:first', 'separator:second', 'capture-visible', 'settings'],
  };
  await customize();
  await act(async () =>
    overlay('separator:first').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true })
    )
  );
  const shown = preferences.layout.filter((item) =>
    ['mode', 'separator:first', 'separator:second', 'capture-visible', 'settings'].includes(item)
  );
  expect(shown).toEqual([
    'mode',
    'separator:second',
    'capture-visible',
    'separator:first',
    'settings',
  ]);
  expect(persistence.patch).toHaveBeenCalledTimes(1);
});

it('keeps ordinary button self-hover free of divider placement errors', async () => {
  await customize();
  const source = overlay('capture-visible');
  pointAt('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 5, 10);
    pointer(source, 'pointermove', 15, 10);
  });
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).toBeNull();
  expect(persistence.patch).not.toHaveBeenCalled();
});
it('cancels a provisional copy when the accepted layout is replaced', async () => {
  await customize();
  const source = addDividerSource();
  pointAt('capture-visible');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  settings.contentToolbar!.pageLayouts = { cursor: ['mode', 'settings', 'capture-visible'] };
  await act(async () => preferences.reload());
  await act(async () => {
    pointer(source, 'pointerup', 5, 10);
    source.click();
  });
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(host.querySelector('[data-page-reordering]')).toBeNull();
});

it('keeps the shown invalid drop when layout motion changes the hit beneath a stationary pointer', async () => {
  settings.contentToolbar!.pageLayouts = {
    cursor: ['mode', 'separator:first', 'capture-visible', 'separator:second', 'settings'],
  };
  await customize();
  const original = [...preferences.layout];
  const source = overlay('separator:first');
  pointAt('separator:second');
  act(() => {
    pointer(source, 'pointerdown', 100, 10);
    pointer(source, 'pointermove', 5, 10);
  });
  expect(host.querySelector('[data-page-toolbar-invalid="true"]')).not.toBeNull();
  pointAt('mode');
  await act(async () => pointer(source, 'pointerup', 5, 10));
  expect(persistence.patch).not.toHaveBeenCalled();
  expect(preferences.layout).toEqual(original);
});
