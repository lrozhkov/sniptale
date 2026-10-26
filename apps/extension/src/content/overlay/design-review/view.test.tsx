// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../annotation-markers/view', () => ({
  BrowserAnnotationMarkers: (props: {
    activeTarget?: Element | null;
    onCloseRecord?: () => void;
    showChrome: boolean;
  }) => (
    <div
      data-active-target={props.activeTarget?.tagName ?? ''}
      data-has-close-record={String(typeof props.onCloseRecord === 'function')}
      data-show-chrome={String(props.showChrome)}
      data-ui="review-markers"
    />
  ),
}));

vi.mock('./popover/view', () => ({
  DesignReviewPopover: () => <div data-ui="review-popover" />,
}));

vi.mock('./feedback-panel/view', () => ({
  DesignReviewFeedbackPanel: () => <div data-ui="review-panel" />,
}));

vi.mock('./session/controller', () => ({
  useDesignReviewController: vi.fn(),
}));

import { DesignReviewSurface, useDesignReviewController } from './view';

function createController(): ReturnType<typeof useDesignReviewController> {
  const element = document.createElement('button');
  return {
    checkOpen: false,
    checks: {
      scope: 'selected',
      setScope: vi.fn(),
      result: null,
      unavailable: false,
      navigationFailed: false,
      setNavigationFailed: vi.fn(),
      newScan: vi.fn(),
      recheck: vi.fn(),
      canScan: true,
      currentViewport: null,
      rootUnavailable: false,
      viewportChanged: false,
    },
    onFinding: vi.fn(),
    actions: {
      tools: {
        cssDrafts: {
          read: vi.fn(() => ''),
          write: vi.fn(),
          accept: vi.fn(),
          discard: vi.fn(),
          registerEditorCancel: vi.fn(() => vi.fn()),
          cancelEditing: vi.fn(() => false),
          items: [],
          revision: 0,
        },
        cancelGesture: vi.fn(() => false),
        registerGestureCancel: vi.fn(() => vi.fn()),
        apply: vi.fn(async () => undefined),
        finish: vi.fn(),
      },
      close: vi.fn(),
      comment: {
        commit: vi.fn(() => true),
        endComposition: vi.fn(),
        startComposition: vi.fn(),
        updateDraft: vi.fn(),
      },
      copyElement: vi.fn(async () => true),
      copyPath: vi.fn(async () => undefined),
      navigateElement: vi.fn(),
      delete: vi.fn(),
      text: { edit: vi.fn(), reset: vi.fn() },
      resetValue: vi.fn(),
      selectAction: vi.fn(),
      setSettingsOpen: vi.fn(),
      setSideFieldLinked: vi.fn(),
      updateValue: vi.fn(),
      updateValues: vi.fn(),
      voice: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
    },
    workspace: { collapsed: false, toggleCollapsed: vi.fn(), close: vi.fn(), comment: vi.fn() },
    tool: 'comment',
    toolPanelOpen: false,
    enabled: true,
    inspectorOpen: true,
    panel: {
      close: vi.fn(),
      open: true,
      openRecord: vi.fn(() => true),
      toggle: vi.fn(),
    },
    sessionRevision: 0,
    viewState: {
      valueError: false,
      measure: { a: null, b: null, preview: null, slot: 'a', replacing: false },
      treeNavigation: { parent: null, child: null },
      action: 'refine',
      anchor: { x: 20, y: 30 },
      comment: { commitFailed: false, draft: '', marker: null },
      defaultValues: {},
      draftPatch: { declarations: [] },
      modifiedProperties: [],
      text: { editable: true, modified: false, preview: 'Heading', resettable: false },
      selection: {
        domPath: 'html > body > button',
        element,
        kind: 'text',
        patch: { declarations: [] },
        selectorLabel: 'button',
        tagName: 'button',
        textPreview: 'Save',
      },
      settingsOpen: false,
      sideFieldLinks: {},
      values: {},
      voice: {
        active: false,
        pending: false,
        audioLevel: 0,
        caretPosition: null,
        errorCode: null,
        phase: 'idle',
      },
    },
  };
}

it('composes the review marker projection and popover on the extension-owned surface', () => {
  const markup = renderToStaticMarkup(
    <DesignReviewSurface controller={createController()} showChrome />
  );

  expect(markup).toContain('data-ui="review-markers"');
  expect(markup).toContain('data-active-target="BUTTON"');
  expect(markup).toContain('data-has-close-record="true"');
  expect(markup).toContain('data-show-chrome="true"');
  expect(markup).toContain('data-ui="review-panel"');
  expect(markup).toContain('data-ui="review-popover"');
});

it('keeps markers while screenshot chrome hides the panel and popover', () => {
  const markup = renderToStaticMarkup(
    <DesignReviewSurface controller={createController()} showChrome={false} />
  );

  expect(markup).toContain('data-ui="review-markers"');
  expect(markup).toContain('data-show-chrome="false"');
  expect(markup).not.toContain('data-ui="review-panel"');
  expect(markup).not.toContain('data-ui="review-popover"');
});
