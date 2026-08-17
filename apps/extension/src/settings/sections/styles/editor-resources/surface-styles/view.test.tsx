// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const resources = vi.hoisted(() => ({
  value: {
    catalog: { catalogRevision: 1 },
    presets: [
      {
        customized: true,
        enabled: true,
        favorite: false,
        id: 'system-surface-plain',
        isDefault: true,
        name: 'Обычный',
        order: 0,
        origin: 'system',
        style: { fillPaint: { kind: 'solid', color: '#ffffffff' }, surfaceCss: '' },
      },
      {
        customized: false,
        enabled: false,
        favorite: false,
        id: 'user-surface',
        isDefault: false,
        name: 'Пользовательский',
        order: 1,
        origin: 'user',
        style: { fillPaint: { kind: 'solid', color: '#000000ff' }, surfaceCss: '' },
      },
      {
        customized: false,
        enabled: true,
        favorite: false,
        id: 'user-enabled',
        isDefault: false,
        name: 'Включённый',
        order: 2,
        origin: 'user',
        style: { fillPaint: { kind: 'solid', color: '#123456ff' }, surfaceCss: '' },
      },
    ],
    actions: {
      onCreate: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onReorderAll: vi.fn(),
      onResetPreset: vi.fn(),
      onSetDefault: vi.fn(),
      onToggleEnabled: vi.fn(),
    },
  } as any,
}));

vi.mock(
  '../../../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog',
  () => ({
    useSurfaceStylePresetCatalog: () => resources.value,
  })
);
vi.mock('./editor', () => ({
  SurfaceStylePresetEditor: (props: {
    onClose(): void;
    onSave(name: string, style: unknown): void;
    open: boolean;
    preset: { id: string; style: unknown } | null;
  }) =>
    props.open ? (
      <div data-editor={props.preset?.id ?? 'new'}>
        <button data-editor-close type="button" onClick={props.onClose} />
        <button
          data-editor-save
          type="button"
          onClick={() =>
            props.onSave(
              'Saved',
              props.preset?.style ?? {
                fillPaint: { kind: 'solid', color: '#ffffffff' },
                surfaceCss: '',
              }
            )
          }
        />
      </div>
    ) : null,
}));

import { SurfaceStylePresetsSettings } from './view';

beforeEach(() => vi.clearAllMocks());

it('renders managed markers and routes table actions through the catalog owner', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<SurfaceStylePresetsSettings />));
  expect(node.textContent).not.toContain('Стили поверхностей');
  expect(node.textContent).not.toContain('Многоразовые стили поверхностей');
  expect(node.textContent).toContain('Предустановленный');
  expect(node.textContent).toContain('По умолчанию');
  expect(node.textContent).toContain('Изменён');
  const userRow = node.querySelector('[data-settings-collection-item="user-surface"]')!;
  act(() =>
    userRow
      .querySelector<HTMLButtonElement>('[aria-label="Включить"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  expect(resources.value.actions.onToggleEnabled).toHaveBeenCalledWith('user-surface');
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-surface-plain"] [aria-label="Редактировать"]'
      )
      ?.click()
  );
  expect(node.querySelector('[data-editor="system-surface-plain"]')).not.toBeNull();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-save]')?.click());
  expect(resources.value.actions.onEdit).toHaveBeenCalledWith(
    'system-surface-plain',
    'Saved',
    expect.any(Object)
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-surface-plain"] [aria-label="Действия"]'
      )
      ?.click()
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-surface-plain"] [aria-label="Сбросить"]'
      )
      ?.click()
  );
  expect(resources.value.actions.onResetPreset).toHaveBeenCalledWith('system-surface-plain');
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-enabled"] [aria-label="Действия"]'
      )
      ?.click()
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-enabled"] [aria-label="Сделать по умолчанию"]'
      )
      ?.click()
  );
  expect(resources.value.actions.onSetDefault).toHaveBeenCalledWith('user-enabled');
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-surface"] [aria-label="Действия"]'
      )
      ?.click()
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-surface"] [aria-label="Удалить"]'
      )
      ?.click()
  );
  expect(resources.value.actions.onDelete).toHaveBeenCalledWith('user-surface');
  const handle = node.querySelector<HTMLButtonElement>(
    '[data-settings-collection-item="user-enabled"] [aria-label="Изменить позицию"]'
  );
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(resources.value.actions.onReorderAll).toHaveBeenCalledOnce();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-close]')?.click());
  act(() =>
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Добавить стиль'))
      ?.click()
  );
  expect(node.querySelector('[data-editor="new"]')).not.toBeNull();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-save]')?.click());
  expect(resources.value.actions.onCreate).toHaveBeenCalledWith('Saved', expect.any(Object));
  act(() => root.unmount());
});
