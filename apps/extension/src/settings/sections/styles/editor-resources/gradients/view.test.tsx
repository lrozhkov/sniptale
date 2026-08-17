// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const resources = vi.hoisted(() => ({
  value: {
    presets: [
      {
        customized: true,
        enabled: true,
        favorite: false,
        gradient: {
          angle: 135,
          interpolation: 'oklab',
          repeat: { enabled: false, span: 1 },
          stops: [
            { color: '#ffffffff', id: 'a', midpoint: 0.5, position: 0 },
            { color: '#000000ff', id: 'b', midpoint: 0.5, position: 1 },
          ],
          type: 'linear',
        },
        id: 'system-sunset',
        isDefault: true,
        name: 'Закат',
        order: 0,
        origin: 'system',
      },
      {
        customized: false,
        enabled: false,
        favorite: false,
        gradient: {
          angle: 135,
          interpolation: 'oklab',
          repeat: { enabled: false, span: 1 },
          stops: [
            { color: '#ffffffff', id: 'a', midpoint: 0.5, position: 0 },
            { color: '#000000ff', id: 'b', midpoint: 0.5, position: 1 },
          ],
          type: 'linear',
        },
        id: 'user-gradient',
        isDefault: false,
        name: 'Пользовательский',
        order: 1,
        origin: 'user',
      },
      {
        customized: false,
        enabled: true,
        favorite: false,
        gradient: {
          angle: 135,
          interpolation: 'oklab',
          repeat: { enabled: false, span: 1 },
          stops: [
            { color: '#ffffffff', id: 'c', midpoint: 0.5, position: 0 },
            { color: '#000000ff', id: 'd', midpoint: 0.5, position: 1 },
          ],
          type: 'linear',
        },
        id: 'user-enabled',
        isDefault: false,
        name: 'Включённый',
        order: 2,
        origin: 'user',
      },
    ],
    actions: {
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onReorder: vi.fn(),
      onResetPreset: vi.fn(),
      onSave: vi.fn(),
      onSetDefault: vi.fn(),
      onToggleEnabled: vi.fn(),
    },
  } as any,
}));

vi.mock('../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog', () => ({
  useGradientPresetCatalog: () => resources.value,
}));
vi.mock('./editor', () => ({
  GradientPresetEditor: (props: {
    onClose(): void;
    onSave(name: string, gradient: unknown): void;
    open: boolean;
    preset: { gradient: unknown; id: string } | null;
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
              props.preset?.gradient ?? {
                angle: 90,
                interpolation: 'oklab',
                repeat: { enabled: false, span: 1 },
                stops: [],
                type: 'linear',
              }
            )
          }
        />
      </div>
    ) : null,
}));

import { GradientPresetsSettings } from './view';

beforeEach(() => vi.clearAllMocks());

it('renders managed markers and routes table actions through the catalog owner', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<GradientPresetsSettings />));
  expect(node.textContent).not.toContain('Шаблоны градиентов');
  expect(node.textContent).not.toContain('Многоразовые шаблоны градиентов');
  expect(node.textContent).toContain('Предустановленный');
  expect(node.textContent).toContain('По умолчанию');
  expect(node.textContent).toContain('Изменён');
  const userRow = node.querySelector('[data-settings-collection-item="user-gradient"]')!;
  act(() =>
    userRow
      .querySelector<HTMLButtonElement>('[aria-label="Включить"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  expect(resources.value.actions.onToggleEnabled).toHaveBeenCalledWith('user-gradient');
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-sunset"] [aria-label="Редактировать"]'
      )
      ?.click()
  );
  expect(node.querySelector('[data-editor="system-sunset"]')).not.toBeNull();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-save]')?.click());
  expect(resources.value.actions.onEdit).toHaveBeenCalledWith(
    'system-sunset',
    'Saved',
    expect.any(Object)
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-sunset"] [aria-label="Действия"]'
      )
      ?.click()
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="system-sunset"] [aria-label="Сбросить"]'
      )
      ?.click()
  );
  expect(resources.value.actions.onResetPreset).toHaveBeenCalledWith('system-sunset');
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
        '[data-settings-collection-item="user-gradient"] [aria-label="Действия"]'
      )
      ?.click()
  );
  act(() =>
    node
      .querySelector<HTMLButtonElement>(
        '[data-settings-collection-item="user-gradient"] [aria-label="Удалить"]'
      )
      ?.click()
  );
  expect(resources.value.actions.onDelete).toHaveBeenCalledWith('user-gradient');
  const handle = node.querySelector<HTMLButtonElement>(
    '[data-settings-collection-item="user-enabled"] [aria-label="Изменить позицию"]'
  );
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  act(() => handle?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  expect(resources.value.actions.onReorder).toHaveBeenCalledOnce();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-close]')?.click());
  act(() =>
    [...node.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Добавить градиент'))
      ?.click()
  );
  expect(node.querySelector('[data-editor="new"]')).not.toBeNull();
  act(() => node.querySelector<HTMLButtonElement>('[data-editor-save]')?.click());
  expect(resources.value.actions.onSave).toHaveBeenCalledWith('Saved', expect.any(Object));
  act(() => root.unmount());
});
