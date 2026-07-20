// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PAGE_STYLE_ASSET_KINDS } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import type { PageStyleInspectorActions } from '../types';
import type { Template } from './model';
import { TemplateRow } from './row';
import type { useTemplateActionRunner } from './status';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

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

function createTemplate(): Template {
  return {
    createdAt: 1,
    id: 'template-1',
    name: 'Hero image',
    patch: {
      assets: [{ assetId: 'asset-1', kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT }],
      declarations: [{ property: 'object-fit', value: 'cover' }],
    },
    propertySummary: ['object-fit'],
    updatedAt: 1,
  };
}

function createGroupedTemplate(): Template {
  return {
    createdAt: 1,
    id: 'template-grouped',
    name: 'Grouped',
    patch: {
      assets: [
        {
          assetId: 'asset-bg',
          filename: 'background.png',
          kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        },
      ],
      declarations: [
        { property: 'color', value: '#111111' },
        { property: 'margin-top', value: '12px' },
        { property: 'background-color', value: '#ffffff' },
        { property: 'object-fit', value: 'cover' },
      ],
    },
    propertySummary: ['color', 'margin-top', 'background-color', 'object-fit'],
    updatedAt: 1,
  };
}

function createSelection(kind: PageStyleSelectionSnapshot['kind']): PageStyleSelectionSnapshot {
  return {
    domPath: '#target',
    element: document.createElement(kind === 'image' ? 'img' : 'div'),
    kind,
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: '#target',
    tagName: kind === 'image' ? 'img' : 'div',
    textPreview: '',
  };
}

function renderRow(
  args: {
    actions?: PageStyleInspectorActions;
    selection?: PageStyleSelectionSnapshot;
    template?: Template;
  } = {}
) {
  const actions = args.actions ?? createActions();
  const actionRunner: ReturnType<typeof useTemplateActionRunner> = {
    run: vi.fn(async (runArgs) => runArgs.action()),
    status: null,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <TemplateRow
        actions={actions}
        actionRunner={actionRunner}
        selection={args.selection ?? createSelection('text')}
        template={args.template ?? createTemplate()}
      />
    );
  });

  return { actions, actionRunner };
}

function changeInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
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

it('disables apply and update actions when an image template is selected on text', () => {
  renderRow();

  expect(document.body.textContent).toContain('Нужен выбранный блок изображения');
  expect(
    document.querySelector<HTMLButtonElement>(
      `button[aria-label="${translate('content.pageStyleInspector.updateTemplate')}"]`
    )?.disabled
  ).toBe(true);
});

it('renames templates through the guarded action runner', async () => {
  const { actions, actionRunner } = renderRow({ selection: createSelection('image') });

  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.pageStyleInspector.renameTemplate')}"]`
      )
      ?.click();
  });
  changeInput(translate('content.pageStyleInspector.templateName'), 'Renamed');
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.pageStyleInspector.renameTemplate')}"]`
      )
      ?.click();
  });

  expect(actionRunner.run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rename' }));
  expect(actions.renameTemplate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'template-1' }),
    'Renamed'
  );
});

it('renders template details grouped by property category', () => {
  renderRow({ selection: createSelection('image'), template: createGroupedTemplate() });

  expect(document.body.textContent).toContain('Текст');
  expect(document.body.textContent).toContain('color: #111111');
  expect(document.body.textContent).toContain('Кадр');
  expect(document.body.textContent).toContain('margin-top: 12px');
  expect(document.body.textContent).toContain('Оформление');
  expect(document.body.textContent).toContain('background-color: #ffffff');
  expect(document.body.textContent).toContain('Файл фона: background.png');
  expect(document.body.textContent).toContain('Изображение');
  expect(document.body.textContent).toContain('object-fit: cover');
});

it('renders a warning for unsupported structured CSS template values', () => {
  renderRow({
    selection: createSelection('image'),
    template: {
      ...createGroupedTemplate(),
      patch: {
        assets: [],
        declarations: [{ property: 'background-image', value: 'radial-gradient(red, blue)' }],
      },
    },
  });

  expect(document.body.textContent).toContain(
    'Есть CSS-значения, которые будут применены как есть'
  );
});
