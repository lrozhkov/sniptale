// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../contracts/settings';
import { usePromptTemplates } from './prompt-template-state';

const serviceMocks = vi.hoisted(() => ({
  createPromptTemplateRecord: vi.fn(),
  deletePromptTemplateRecord: vi.fn(),
  loadPromptTemplateList: vi.fn(),
  savePromptTemplatePatch: vi.fn(),
  touchPromptTemplateRecord: vi.fn(),
}));

vi.mock('../../../features/prompt-templates/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/prompt-templates/service')>()),
  createPromptTemplateRecord: serviceMocks.createPromptTemplateRecord,
  deletePromptTemplateRecord: serviceMocks.deletePromptTemplateRecord,
  loadPromptTemplateList: serviceMocks.loadPromptTemplateList,
  savePromptTemplatePatch: serviceMocks.savePromptTemplatePatch,
  touchPromptTemplateRecord: serviceMocks.touchPromptTemplateRecord,
}));

type PromptTemplatesState = ReturnType<typeof usePromptTemplates>;

let container: HTMLDivElement | null = null;
let latestState: PromptTemplatesState | null = null;
let root: Root | null = null;

function createTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    content: overrides.content ?? 'Prompt body',
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Template',
    ...(overrides.isDefault === undefined
      ? { isDefault: false }
      : { isDefault: overrides.isDefault }),
    ...(overrides.lastUsedAt === undefined ? {} : { lastUsedAt: overrides.lastUsedAt }),
  };
}

function HookHarness() {
  latestState = usePromptTemplates();
  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness />);
  });
  await flushEffects();
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  serviceMocks.createPromptTemplateRecord.mockReset();
  serviceMocks.deletePromptTemplateRecord.mockReset();
  serviceMocks.loadPromptTemplateList.mockReset();
  serviceMocks.savePromptTemplatePatch.mockReset();
  serviceMocks.touchPromptTemplateRecord.mockReset();
  serviceMocks.loadPromptTemplateList.mockResolvedValue([createTemplate()]);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('settings prompt-template state loading', () => {
  it('loads templates and refreshes them on demand', async () => {
    await renderHarness();

    expect(serviceMocks.loadPromptTemplateList).toHaveBeenCalledTimes(1);
    expect(getState().isLoading).toBe(false);
    expect(getState().error).toBeNull();
    expect(getState().templates).toEqual([createTemplate()]);

    serviceMocks.loadPromptTemplateList.mockResolvedValueOnce([
      createTemplate({ id: 'template-2', name: 'Updated' }),
    ]);

    await act(async () => {
      await getState().refreshTemplates();
    });

    expect(getState().templates).toEqual([createTemplate({ id: 'template-2', name: 'Updated' })]);
  });
});

describe('settings prompt-template state mutations', () => {
  it('adds, updates, removes, and selects templates through the shared service', async () => {
    await renderHarness();
    const addedTemplate = createTemplate({
      content: 'New body',
      id: 'added-template',
      name: 'New template',
    });
    serviceMocks.createPromptTemplateRecord.mockResolvedValueOnce(addedTemplate);

    await act(async () => {
      await getState().addTemplate('New template', 'New body');
    });
    expect(getState().templates[0]).toEqual(addedTemplate);

    const updatedTemplate = createTemplate({ id: 'added-template', name: 'Renamed template' });
    serviceMocks.savePromptTemplatePatch.mockResolvedValueOnce(updatedTemplate);
    await act(async () => {
      await getState().updateTemplate('added-template', { name: 'Renamed template' });
    });
    expect(getState().templates[0]?.name).toBe('Renamed template');

    serviceMocks.touchPromptTemplateRecord.mockResolvedValueOnce({
      content: 'Prompt body',
      lastUsedAt: 999,
    });
    const selectedContent = await act(async () => getState().selectTemplate(updatedTemplate));
    expect(selectedContent).toBe('Prompt body');
    expect(getState().templates[0]?.lastUsedAt).toBe(999);

    serviceMocks.deletePromptTemplateRecord.mockResolvedValueOnce(undefined);
    await act(async () => {
      await getState().removeTemplate('added-template');
    });
    expect(getState().templates).toEqual([createTemplate()]);
  });
});

describe('settings prompt-template state failures', () => {
  it('surfaces service failures in local settings state', async () => {
    serviceMocks.loadPromptTemplateList.mockRejectedValueOnce(new Error('load failed'));

    await renderHarness();

    expect(getState().isLoading).toBe(false);
    expect(getState().error).toBe('load failed');
  });
});
