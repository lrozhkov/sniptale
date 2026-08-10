// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../contracts/settings';
import { usePromptTemplates } from './use-prompt-templates';

const service = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  patch: vi.fn(),
  reset: vi.fn(),
  saveOrder: vi.fn(),
  setEnabled: vi.fn(),
  touch: vi.fn(),
}));
const localeState = vi.hoisted(() => ({ current: 'en' as 'en' | 'ru' }));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  useAppLocale: () => localeState.current,
}));

vi.mock('../service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service')>()),
  createPromptTemplateRecord: service.create,
  deletePromptTemplateRecord: service.remove,
  loadPromptTemplateList: service.list,
  savePromptTemplatePatch: service.patch,
  resetPromptTemplateRecord: service.reset,
  savePromptTemplateOrder: service.saveOrder,
  setPromptTemplateEnabledRecord: service.setEnabled,
  touchPromptTemplateRecord: service.touch,
}));

let mountedRoot: Root | null = null;
let state: ReturnType<typeof usePromptTemplates> | null = null;

function template(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    content: overrides.content ?? 'Body',
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Template',
    isDefault: overrides.isDefault ?? false,
    ...(overrides.lastUsedAt === undefined ? {} : { lastUsedAt: overrides.lastUsedAt }),
    ...(overrides.enabled === undefined ? {} : { enabled: overrides.enabled }),
    ...(overrides.customized === undefined ? {} : { customized: overrides.customized }),
  };
}

function Probe() {
  state = usePromptTemplates();
  return null;
}

async function mountProbe() {
  const container = document.createElement('div');
  document.body.append(container);
  mountedRoot = createRoot(container);
  await act(async () => {
    mountedRoot?.render(<Probe />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function currentState() {
  if (!state) {
    throw new Error('Prompt template hook did not render.');
  }
  return state;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  service.create.mockReset();
  service.remove.mockReset();
  service.list.mockReset();
  service.patch.mockReset();
  service.reset.mockReset();
  service.saveOrder.mockReset();
  service.setEnabled.mockReset();
  service.touch.mockReset();
  localeState.current = 'en';
  service.list.mockResolvedValue([template()]);
  service.reset.mockResolvedValue(template({ id: 'default-translate', isDefault: true }));
  service.saveOrder.mockResolvedValue(undefined);
  service.setEnabled.mockImplementation(async (id, enabled) => template({ id, enabled }));
});

afterEach(() => {
  act(() => mountedRoot?.unmount());
  mountedRoot = null;
  state = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads, refreshes, mutates, selects, and removes prompt templates', async () => {
  await mountProbe();
  expect(currentState().templates).toEqual([template()]);

  service.list.mockResolvedValueOnce([template({ id: 'template-2', name: 'Updated' })]);
  await act(async () => currentState().refreshTemplates());
  expect(currentState().templates).toEqual([template({ id: 'template-2', name: 'Updated' })]);

  service.create.mockResolvedValueOnce(template({ id: 'created', name: 'Created' }));
  await act(async () => currentState().addTemplate('Created', 'Body'));
  expect(currentState().templates[0]?.id).toBe('created');

  service.patch.mockResolvedValueOnce(template({ id: 'created', name: 'Renamed' }));
  await act(async () => currentState().updateTemplate('created', { name: 'Renamed' }));
  expect(currentState().templates[0]?.name).toBe('Renamed');

  const restored = template({ id: 'template-2', name: 'Factory', isDefault: true });
  service.reset.mockResolvedValueOnce(restored);
  await act(async () => currentState().templateLifecycle.restoreSystem('template-2'));
  expect(service.reset).toHaveBeenCalledWith('template-2', 'en');
  expect(currentState().templates[1]).toEqual(restored);

  service.touch.mockResolvedValueOnce({ content: 'Selected body', lastUsedAt: 321 });
  await expect(
    act(async () => currentState().selectTemplate(template({ id: 'created' })))
  ).resolves.toBe('Selected body');
  expect(currentState().templates[0]?.lastUsedAt).toBe(321);

  service.remove.mockResolvedValueOnce(undefined);
  await act(async () => currentState().templateLifecycle.remove('created'));
  expect(currentState().templates).toEqual([restored]);
});

it('stores a readable error when loading fails', async () => {
  service.list.mockRejectedValueOnce(new Error('load failed'));

  await mountProbe();

  expect(currentState().isLoading).toBe(false);
  expect(currentState().error).toBe('load failed');
});

it('keeps system templates available while explicitly toggling their visibility', async () => {
  const systemTemplate = template({ id: 'system', isDefault: true });
  service.list.mockResolvedValueOnce([systemTemplate]);
  service.setEnabled.mockImplementation(async (_id, enabled) => ({ ...systemTemplate, enabled }));

  await mountProbe();

  await act(async () => currentState().templateLifecycle.setEnabled(systemTemplate.id, false));
  expect(currentState().templates).toEqual([{ ...systemTemplate, enabled: false }]);

  await act(async () => currentState().templateLifecycle.setEnabled(systemTemplate.id, true));
  expect(currentState().templates).toEqual([{ ...systemTemplate, enabled: true }]);
  expect(service.remove).not.toHaveBeenCalled();
});

it('reorders templates and persists the resulting visible order', async () => {
  service.list.mockResolvedValueOnce([
    template({ id: 'first' }),
    template({ id: 'second' }),
    template({ id: 'third' }),
  ]);
  await mountProbe();

  await act(async () => currentState().templateLifecycle.move('first', null));

  expect(currentState().templates.map((item) => item.id)).toEqual(['second', 'third', 'first']);
  expect(service.saveOrder).toHaveBeenCalledWith(currentState().templates);
});

it('keeps the previous order and surfaces a persistence failure', async () => {
  service.list.mockResolvedValueOnce([template({ id: 'first' }), template({ id: 'second' })]);
  service.saveOrder.mockRejectedValueOnce(new Error('order failed'));
  await mountProbe();

  let failure: unknown;
  await act(async () => {
    try {
      await currentState().templateLifecycle.move('first', null);
    } catch (error) {
      failure = error;
    }
  });

  expect(failure).toEqual(new Error('order failed'));
  expect(currentState().templates.map((item) => item.id)).toEqual(['first', 'second']);
  expect(currentState().error).toBe('order failed');
});

it('surfaces reset and availability failures and ignores a no-op move', async () => {
  const systemTemplate = template({ id: 'default-translate', isDefault: true });
  service.list.mockResolvedValueOnce([systemTemplate]);
  service.reset.mockRejectedValueOnce(new Error('reset failed'));
  service.setEnabled.mockRejectedValueOnce(new Error('toggle failed'));
  await mountProbe();

  let resetFailure: unknown;
  await act(async () => {
    try {
      await currentState().templateLifecycle.restoreSystem(systemTemplate.id);
    } catch (error) {
      resetFailure = error;
    }
  });
  expect(resetFailure).toEqual(new Error('reset failed'));
  expect(currentState().error).toBe('reset failed');

  let toggleFailure: unknown;
  await act(async () => {
    try {
      await currentState().templateLifecycle.setEnabled(systemTemplate.id, false);
    } catch (error) {
      toggleFailure = error;
    }
  });
  expect(toggleFailure).toEqual(new Error('toggle failed'));
  expect(currentState().error).toBe('toggle failed');

  await act(async () =>
    currentState().templateLifecycle.move(systemTemplate.id, systemTemplate.id)
  );
  expect(service.saveOrder).not.toHaveBeenCalled();
});

it('ignores an older locale load that resolves after the current catalog', async () => {
  const english = createDeferred<PromptTemplate[]>();
  const russian = createDeferred<PromptTemplate[]>();
  service.list.mockReset();
  service.list
    .mockImplementationOnce(() => english.promise)
    .mockImplementationOnce(() => russian.promise);
  await mountProbe();
  expect(service.list).toHaveBeenCalledWith('en');

  localeState.current = 'ru';
  await act(async () => {
    mountedRoot?.render(<Probe />);
    await Promise.resolve();
  });
  expect(service.list).toHaveBeenLastCalledWith('ru');

  await act(async () => russian.resolve([template({ id: 'ru', name: 'Русский' })]));
  expect(currentState().templates[0]?.id).toBe('ru');

  await act(async () => english.resolve([template({ id: 'en', name: 'English' })]));
  expect(currentState().templates[0]?.id).toBe('ru');
});
