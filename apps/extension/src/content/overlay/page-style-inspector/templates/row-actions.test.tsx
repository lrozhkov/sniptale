// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PageStyleInspectorActions } from '../types';
import type { Template } from './model';
import { TemplateRowActions, type TemplateActionRunner } from './row-actions';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const template: Template = {
  createdAt: 1,
  id: 'template-1',
  name: 'Template',
  patch: { assets: [], declarations: [] },
  propertySummary: [],
  updatedAt: 1,
};

function createActions(): PageStyleInspectorActions {
  return {
    applyRule: vi.fn(),
    applyTemplate: vi.fn(async () => undefined),
    clearBackgroundAsset: vi.fn(),
    close: vi.fn(),
    deleteRule: vi.fn(),
    deleteTemplate: vi.fn(async () => undefined),
    duplicateTemplate: vi.fn(async () => undefined),
    renameTemplate: vi.fn(async () => undefined),
    resetValue: vi.fn(),
    saveBackgroundAsset: vi.fn(),
    saveImageReplacement: vi.fn(),
    saveRule: vi.fn(),
    saveTemplate: vi.fn(),
    setActiveTab: vi.fn(),
    setIncludeComputedInTemplate: vi.fn(),
    setRetainImage: vi.fn(),
    setRetainText: vi.fn(),
    setRuleName: vi.fn(),
    setRuleQuery: vi.fn(),
    setTemplateName: vi.fn(),
    setTemplateQuery: vi.fn(),
    toggleRuleEnabled: vi.fn(),
    updateAssetPatch: vi.fn(),
    updateTemplate: vi.fn(async () => undefined),
    updateValue: vi.fn(),
    updateValues: vi.fn(),
  };
}

function renderActions(disabledReason: string | null = null) {
  const actions = createActions();
  const actionRunner: TemplateActionRunner = {
    run: vi.fn(async (runArgs) => runArgs.action()),
    status: null,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <TemplateRowActions
        actions={actions}
        actionRunner={actionRunner}
        disabledReason={disabledReason}
        pending={false}
        template={template}
      />
    );
  });

  return { actions, actionRunner };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

it('runs update through the guarded action runner', async () => {
  const { actions, actionRunner } = renderActions();

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Обновить из блока"]')?.click();
  });

  expect(actionRunner.run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'update' }));
  expect(actions.updateTemplate).toHaveBeenCalledWith(template);
});

it('disables apply and update when compatibility supplies a disabled reason', () => {
  renderActions('disabled');

  expect(
    document.querySelector<HTMLButtonElement>('button[aria-label="Обновить из блока"]')?.disabled
  ).toBe(true);
  expect(
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'Применить'
    )?.disabled
  ).toBe(true);
});
