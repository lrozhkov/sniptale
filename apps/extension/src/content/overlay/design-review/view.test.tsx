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
    actions: {
      close: vi.fn(),
      comment: {
        commit: vi.fn(() => true),
        endComposition: vi.fn(),
        startComposition: vi.fn(),
        updateDraft: vi.fn(),
      },
      copyElement: vi.fn(async () => undefined),
      copyPath: vi.fn(async () => undefined),
      delete: vi.fn(),
      resetValue: vi.fn(),
      selectAction: vi.fn(),
      setSettingsOpen: vi.fn(),
      setSideFieldLinked: vi.fn(),
      updateValue: vi.fn(),
      updateValues: vi.fn(),
      voice: { start: vi.fn(), stop: vi.fn() },
    },
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
      action: 'refine',
      anchor: { x: 20, y: 30 },
      comment: { commitFailed: false, draft: '', marker: null },
      defaultValues: {},
      draftPatch: { declarations: [] },
      modifiedProperties: [],
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
