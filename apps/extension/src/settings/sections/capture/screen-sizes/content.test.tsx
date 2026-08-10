// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SystemViewportPreset, UserViewportPreset } from '../../../../contracts/settings';

const mocks = vi.hoisted(() => ({ dialogs: vi.fn() }));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  formatNumber: (value: number) => String(value),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
vi.mock('./section-content/dialogs', () => ({
  PresetsDialogs: (props: Record<string, unknown>) => {
    mocks.dialogs(props);
    return <div data-testid="viewport-dialogs" />;
  },
}));

import { PresetsSectionContent } from './section-content/content';

const viewportOne: UserViewportPreset = {
  enabled: true,
  height: 844,
  id: 'viewport-1',
  kind: 'user',
  name: 'Phone',
  order: 0,
  target: 'viewport',
  width: 390,
};
const viewportTwo: UserViewportPreset = {
  ...viewportOne,
  enabled: false,
  height: 768,
  id: 'viewport-2',
  name: 'Tablet',
  order: 1,
  width: 1024,
};
const systemWindow: SystemViewportPreset = {
  catalogRevision: 2,
  customized: true,
  enabled: true,
  height: 720,
  id: 'system:window-hd',
  kind: 'system',
  nameOverride: 'Custom HD window',
  order: 0,
  systemKey: 'windowHd',
  target: 'window',
  width: 1280,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    deletion: {
      close: vi.fn(),
      confirm: vi.fn().mockResolvedValue(undefined),
      isOpen: true,
      message: 'Delete preset?',
    },
    editor: {
      close: vi.fn(),
      editingPreset: viewportOne,
      isOpen: true,
      onAdd: vi.fn(),
      onSave: vi.fn().mockResolvedValue(undefined),
    },
    list: {
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onMoveBefore: vi.fn().mockResolvedValue(undefined),
      onReset: vi.fn().mockResolvedValue(undefined),
      onToggle: vi.fn().mockResolvedValue(undefined),
    },
    model: {
      isLoading: false,
      isMutating: false,
      presets: [viewportOne, viewportTwo, systemWindow],
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('groups viewport/window rows and renders type, size, disabled state, and friendly hints', () => {
  const props = createProps();
  act(() => root?.render(<PresetsSectionContent {...props} />));

  expect(container?.textContent).toContain('viewportPresets.groups.viewport');
  expect(container?.textContent).toContain('viewportPresets.groups.window');
  expect(container?.textContent).toContain('viewportPresets.hints.viewport');
  expect(container?.textContent).toContain('viewportPresets.hints.window');
  expect(container?.textContent?.split('viewportPresets.groups.viewport')).toHaveLength(2);
  expect(container?.textContent?.split('viewportPresets.groups.window')).toHaveLength(2);
  expect(container?.textContent).toContain('Phone');
  expect(container?.textContent).toContain('390 × 844');
  expect(container?.textContent).toContain('Tablet');
  expect(container?.textContent).toContain('viewportPresets.messages.presetDisabled');
  expect(container?.textContent).toContain('Custom HD window');
  expect(container?.textContent).not.toContain('viewportPresets.section.savedLabel');
  expect(container?.querySelector('[data-collection-direct-action="set-default"]')).toBeNull();
  expect(mocks.dialogs).toHaveBeenCalledWith(
    expect.objectContaining({ editingViewport: viewportOne, viewportConfirmOpen: true })
  );

  act(() =>
    root?.render(
      <PresetsSectionContent
        {...props}
        editor={{
          close: props.editor.close,
          isOpen: props.editor.isOpen,
          onAdd: props.editor.onAdd,
          onSave: props.editor.onSave,
        }}
      />
    )
  );
  expect(mocks.dialogs.mock.calls.at(-1)?.[0]).not.toHaveProperty('editingViewport');
});

it('routes toggle, movement, edit, reset, delete, and add collection intents', () => {
  const props = createProps();
  act(() => root?.render(<PresetsSectionContent {...props} />));

  const labelledButton = (label: string, index = 0) =>
    container?.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)[index] ?? null;
  const textButton = (text: string, index = 0) =>
    [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((button) =>
      button.textContent?.includes(text)
    )[index] ?? null;
  act(() => {
    labelledButton('settings.collection.actions.disable')?.click();
    textButton('settings.collection.actions.moveUp', 1)?.click();
    textButton('settings.collection.actions.moveDown')?.click();
    labelledButton('settings.collection.actions.edit')?.click();
    textButton('settings.collection.actions.delete')?.click();
    textButton('settings.collection.actions.reset')?.click();
    const add = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((item) =>
      item.textContent?.includes('viewportPresets.section.addButton')
    );
    add?.click();
  });

  expect(props.list.onToggle).toHaveBeenCalledWith(viewportOne);
  expect(props.list.onMoveBefore).toHaveBeenCalledWith(viewportTwo.id, viewportOne.id);
  expect(props.list.onMoveBefore).toHaveBeenCalledWith(viewportOne.id, null);
  expect(props.list.onEdit).toHaveBeenCalledWith(viewportOne);
  expect(props.list.onDelete).toHaveBeenCalledWith(viewportOne);
  expect(props.list.onReset).toHaveBeenCalledWith(systemWindow);
  expect(props.editor.onAdd).toHaveBeenCalledOnce();

  act(() =>
    root?.render(
      <PresetsSectionContent
        {...props}
        model={{ ...props.model, presets: [viewportOne, viewportTwo] }}
      />
    )
  );
  expect(container?.textContent).not.toContain('viewportPresets.groups.window');
});

it('keeps preset rows mounted while a mutation is being persisted', () => {
  const props = createProps();
  act(() =>
    root?.render(<PresetsSectionContent {...props} model={{ ...props.model, isMutating: true }} />)
  );

  expect(container?.textContent).toContain('Phone');
  expect(container?.textContent).toContain('Tablet');
  expect(container?.querySelector('[data-testid="settings-card-loading"]')).toBeNull();
});
