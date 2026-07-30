// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_STYLE_INSPECTOR_TABS } from '@sniptale/runtime-contracts/page-style';
import { setLocalePreference } from '../../../platform/i18n';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
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
    comment: { commitFailed: false, draft: '', marker: null },
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

function renderSurface(options: { comment?: string } = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const viewState = createViewState();
  const target = viewState.selection!.element;
  if (options.comment) {
    const targetRect = DOMRect.fromRect({ height: 40, width: 80, x: 30, y: 50 });
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => targetRect,
    });
    Object.defineProperty(target, 'getClientRects', {
      configurable: true,
      value: () => ({
        0: targetRect,
        [Symbol.iterator]: () => [targetRect][Symbol.iterator](),
        item: (index: number) => (index === 0 ? targetRect : null),
        length: 1,
      }),
    });
    browserAnnotationSession.setComment({
      comment: options.comment,
      evidence: {
        fileLabel: '#selected-image',
        frame: { kind: 'top-document' },
        locator: '#selected-image',
        nodePosition: { x: 30, y: 50 },
        pageUrl: 'https://example.test',
        targetPath: 'img#selected-image',
        targetSelector: '#selected-image',
        targetText: '',
        viewport: { height: 900, width: 1280 },
      },
      target,
    });
    viewState.comment = { commitFailed: false, draft: options.comment, marker: 1 };
  }

  const controller = {
    actions: {
      applyRule: vi.fn(),
      applyTemplate: vi.fn(),
      clearBackgroundAsset: vi.fn(),
      close: vi.fn(),
      comment: {
        commit: vi.fn(() => true),
        endComposition: vi.fn(),
        startComposition: vi.fn(),
        updateDraft: vi.fn(),
      },
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
    viewState,
  };

  act(() => {
    root?.render(<PageStyleInspectorSurface controller={controller as never} />);
  });

  return { target };
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  browserAnnotationSession.resetForDocument();
  await setLocalePreference('ru');
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  await setLocalePreference('ru');
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

  it('rerenders mounted comment field and marker copy after a live locale change', async () => {
    renderSurface({ comment: 'Locale comment' });
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    const marker = document.querySelector<HTMLElement>(
      '[data-ui="content.annotation-marker"] [role="note"]'
    );
    expect(textarea?.placeholder).toBe('Добавьте скрытый комментарий');
    expect(marker?.getAttribute('aria-label')).toBe('Комментарий 1');

    await act(async () => {
      await setLocalePreference('en');
    });

    expect(textarea?.placeholder).toBe('Add a hidden comment');
    expect(marker?.getAttribute('aria-label')).toBe('Comment 1');
  });
});
