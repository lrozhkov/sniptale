// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../annotation-markers/view', () => ({
  BrowserAnnotationMarkers: () => <div data-ui="review-markers" />,
}));

vi.mock('./popover/view', () => ({
  DesignReviewPopover: () => <div data-ui="review-popover" />,
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
    },
    inspectorOpen: true,
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
    },
  };
}

it('composes the review marker projection and popover on the extension-owned surface', () => {
  const markup = renderToStaticMarkup(<DesignReviewSurface controller={createController()} />);

  expect(markup).toContain('data-ui="review-markers"');
  expect(markup).toContain('data-ui="review-popover"');
});
