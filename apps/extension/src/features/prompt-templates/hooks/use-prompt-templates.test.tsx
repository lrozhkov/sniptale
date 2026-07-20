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
  touch: vi.fn(),
}));

vi.mock('../service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../service')>()),
  createPromptTemplateRecord: service.create,
  deletePromptTemplateRecord: service.remove,
  loadPromptTemplateList: service.list,
  savePromptTemplatePatch: service.patch,
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  service.create.mockReset();
  service.remove.mockReset();
  service.list.mockReset();
  service.patch.mockReset();
  service.touch.mockReset();
  service.list.mockResolvedValue([template()]);
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

  service.touch.mockResolvedValueOnce({ content: 'Selected body', lastUsedAt: 321 });
  await expect(
    act(async () => currentState().selectTemplate(template({ id: 'created' })))
  ).resolves.toBe('Selected body');
  expect(currentState().templates[0]?.lastUsedAt).toBe(321);

  service.remove.mockResolvedValueOnce(undefined);
  await act(async () => currentState().removeTemplate('created'));
  expect(currentState().templates).toEqual([template({ id: 'template-2', name: 'Updated' })]);
});

it('stores a readable error when loading fails', async () => {
  service.list.mockRejectedValueOnce(new Error('load failed'));

  await mountProbe();

  expect(currentState().isLoading).toBe(false);
  expect(currentState().error).toBe('load failed');
});
