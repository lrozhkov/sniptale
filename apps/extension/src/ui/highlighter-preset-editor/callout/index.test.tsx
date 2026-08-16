// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetEditor } from '.';

vi.mock('../../color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../color-selector')>()),
  CompactColorSelector: (props: { label: string; onChange: (value: string) => void }) => (
    <button data-color-field={props.label} onClick={() => props.onChange('#123456')}>
      {props.label}
    </button>
  ),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('edits an existing preset in the shared persistent modal', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const onSave = vi.fn();

  await act(async () => {
    root.render(
      <CalloutPresetEditor
        isOpen
        isSaving={false}
        preset={preset}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
  });

  expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')?.value).toBe(
    'Оранжевый Sniptale'
  );
  expect(document.querySelector<HTMLElement>('[role="dialog"]')?.style.width).toBe('660px');
  expect(document.querySelector('.sniptale-highlighter-preset-editor-dialog')).not.toBeNull();
  expect(
    document.querySelector('[data-ui="shared.callout-preset-editor.preview-panel"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-ui="shared.callout-preset-editor.layout"]')?.className
  ).toContain('sm:grid-cols-[176px_minmax(0,1fr)]');
  const navigation = [...document.querySelectorAll<HTMLButtonElement>('nav button')];
  expect(navigation.at(-1)?.getAttribute('aria-label')).toBe('Позиция');
  expect(document.querySelectorAll('[data-callout-anchor]')).toHaveLength(0);
  expect(document.body.textContent).toContain('Изменить шаблон комментария');

  await act(async () => root.unmount());
});

it('updates the default position and saves it with the live preset preview', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const preset = createSystemCalloutPresetCatalog()[4]!;
  const onSave = vi.fn();

  await act(async () => {
    root.render(
      <CalloutPresetEditor
        isOpen
        isSaving={false}
        preset={preset}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
  });

  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Позиция"]')?.click()
  );

  const positionGrid = document.querySelector<HTMLElement>('[data-position-layout="square"]');
  expect(positionGrid?.style.gridTemplateColumns).toBe('repeat(3, 28px)');
  expect(
    positionGrid?.querySelector<HTMLElement>('[data-callout-anchor="middle-right"]')?.style
      .gridColumn
  ).toBe('3');

  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-callout-anchor="bottom-right"]')?.click()
  );
  expect(document.querySelector('[data-callout-placement="bottom-right"]')).not.toBeNull();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Заголовок"]')?.click()
  );
  const titleInput = document.querySelector<HTMLInputElement>(
    'input[placeholder="Введите заголовок"]'
  );
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(titleInput, 'Template heading');
    titleInput?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Сохранить'
  );
  await act(async () => save?.click());

  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0]?.[0].content).toEqual({ titleText: 'Template heading' });
  expect(onSave.mock.calls[0]?.[0].placement).toEqual({
    anchor: 'bottom-right',
    connectorAttachments: {
      block: { mode: 'auto' },
      frame: { mode: 'auto' },
    },
    side: 'bottom',
  });
  await act(async () => root.unmount());
});

it('shows localized badge weight options in the shared editor', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const source = createSystemCalloutPresetCatalog()[4]!;
  const preset = {
    ...source,
    style: { ...source.style, badge: { ...source.style.badge, enabled: false } },
  };

  await act(async () => {
    root.render(
      <CalloutPresetEditor
        isOpen
        isSaving={false}
        preset={preset}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
  });
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Метка"]')?.click()
  );
  const badgeToggle = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Текстовая метка"]'
  );
  if (badgeToggle?.getAttribute('aria-pressed') !== 'true') {
    await act(async () => badgeToggle?.click());
  }
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Начертание метки"]')?.click()
  );

  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent
  );
  expect(options).toEqual(expect.arrayContaining(['Обычное', 'Жирное']));
  expect(options.some((option) => option?.includes('badgeFontWeight'))).toBe(false);

  await act(async () => root.unmount());
});

it('keeps a new preset draft through saving rerenders', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const source = {
    ...createSystemCalloutPresetCatalog()[0]!,
    id: '',
    name: '',
    origin: 'user' as const,
  };

  const renderEditor = async (isSaving: boolean) => {
    await act(async () => {
      root.render(
        <CalloutPresetEditor
          isNew
          isOpen
          isSaving={isSaving}
          preset={{ ...source }}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );
    });
  };

  await renderEditor(false);
  const input = document.querySelector<HTMLInputElement>('input[maxlength="64"]')!;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(input, 'Recoverable draft');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await renderEditor(true);
  await renderEditor(false);
  expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')?.value).toBe(
    'Recoverable draft'
  );

  await act(async () => root.unmount());
});

it('owns Escape dismissal and restores focus to the previous control', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const trigger = document.createElement('button');
  const host = document.createElement('div');
  document.body.append(trigger, host);
  trigger.focus();
  const root = createRoot(host);
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const onClose = vi.fn();

  const renderEditor = async (isOpen: boolean) => {
    await act(async () => {
      root.render(
        <CalloutPresetEditor
          isOpen={isOpen}
          isSaving={false}
          preset={preset}
          onClose={onClose}
          onSave={vi.fn()}
        />
      );
    });
  };

  await renderEditor(true);
  const activeInput = document.querySelector<HTMLInputElement>('input[maxlength="64"]');
  expect(document.activeElement).toBe(activeInput);

  const escape = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: 'Escape',
  });
  await act(async () => activeInput?.dispatchEvent(escape));
  expect(onClose).toHaveBeenCalledOnce();
  expect(escape.defaultPrevented).toBe(true);

  await renderEditor(false);
  expect(document.activeElement).toBe(trigger);
  await act(async () => root.unmount());
});
