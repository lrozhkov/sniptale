// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../../../contracts/settings';
import { usePromptTemplates } from './prompt-template-state';

const serviceMocks = vi.hoisted(() => ({
  createPromptTemplateRecord: vi.fn(),
  deletePromptTemplateRecord: vi.fn(),
  loadPromptTemplateList: vi.fn(),
  savePromptTemplatePatch: vi.fn(),
  touchPromptTemplateRecord: vi.fn(),
}));

vi.mock('../../../../../features/prompt-templates/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/service')>()),
  createPromptTemplateRecord: serviceMocks.createPromptTemplateRecord,
  deletePromptTemplateRecord: serviceMocks.deletePromptTemplateRecord,
  loadPromptTemplateList: serviceMocks.loadPromptTemplateList,
  savePromptTemplatePatch: serviceMocks.savePromptTemplatePatch,
  touchPromptTemplateRecord: serviceMocks.touchPromptTemplateRecord,
}));

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof usePromptTemplates> | null = null;
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

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness />);
    await Promise.resolve();
    await Promise.resolve();
  });
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

describe('ai-modal prompt-template state', () => {
  it('loads prompt templates for the content AI modal', async () => {
    await renderHarness();

    expect(getState().templates).toEqual([createTemplate()]);
    expect(getState().isLoading).toBe(false);
    expect(getState().error).toBeNull();
  });

  it('selects a template and keeps last-used ordering owner-local', async () => {
    await renderHarness();
    serviceMocks.touchPromptTemplateRecord.mockResolvedValueOnce({
      content: 'Prompt body',
      lastUsedAt: 123,
    });

    const content = await act(async () => getState().selectTemplate(createTemplate()));

    expect(content).toBe('Prompt body');
    expect(getState().templates[0]?.lastUsedAt).toBe(123);
  });

  it('surfaces service load failures in content session state', async () => {
    serviceMocks.loadPromptTemplateList.mockRejectedValueOnce(new Error('load failed'));

    await renderHarness();

    expect(getState().templates).toEqual([]);
    expect(getState().error).toBe('load failed');
  });
});
