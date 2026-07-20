// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorViewState } from './types';
import { PageStyleInspectorSurface } from './view';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function createViewState(): PageStyleInspectorViewState {
  const element = document.createElement('img');
  element.id = 'selected-image';
  document.body.append(element);

  return {
    activeTab: PAGE_STYLE_INSPECTOR_TABS.PROPERTIES,
    defaultValues: {},
    draftPatch: { assets: [], declarations: [] },
    includeComputedInTemplate: false,
    modifiedProperties: [],
    retainImage: false,
    retainText: false,
    ruleName: 'Rule',
    ruleQuery: '',
    rules: [],
    selection: {
      domPath: 'img#selected-image',
      element,
      kind: 'image',
      patch: { assets: [], declarations: [] },
      selector: { locator: '#selected-image' },
      selectorLabel: 'img#selected-image',
      tagName: 'img',
      textPreview: '',
    },
    templateQuery: '',
    templateName: 'Template',
    templates: [],
    values: {},
  };
}

function renderSurface() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  const controller = {
    actions: {
      applyRule: vi.fn(),
      applyTemplate: vi.fn(),
      clearBackgroundAsset: vi.fn(),
      close: vi.fn(),
      saveBackgroundAsset: vi.fn(),
      saveImageReplacement: vi.fn(),
      saveRule: vi.fn(),
      saveTemplate: vi.fn(),
      setActiveTab: vi.fn(),
      setRetainImage: vi.fn(),
      setRetainText: vi.fn(),
      setRuleName: vi.fn(),
      setTemplateName: vi.fn(),
      updateAssetPatch: vi.fn(),
      updateValue: vi.fn(),
    },
    inspectorOpen: true,
    toggleInspector: vi.fn(),
    viewState: createViewState(),
  };

  act(() => {
    root?.render(<PageStyleInspectorSurface controller={controller as never} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('PageStyleInspectorSurface', () => {
  it('does not render a separate accent target outline', () => {
    renderSurface();

    const outline = document.querySelector(
      '[data-ui="content.page-style-inspector.selection-outline"]'
    );
    expect(outline).toBeNull();
    expect(document.body.innerHTML).not.toContain('content.page-style-inspector.selection-outline');
  });

  it('uses the blue quick-edit frame owner for the selected page target', () => {
    renderSurface();

    const frame = document.querySelector<HTMLElement>('.sniptale-quick-edit-page-style-frame');
    expect(frame).not.toBeNull();
    expect(frame?.style.border).toContain('var(--sniptale-color-info)');
  });
});
