// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type {
  FrameSessionSnapshot,
  PagePreparationHistoryBridge,
  PagePreparationSessionSnapshot,
} from '../../../../../parser/page-preparation/history';
import { pagePreparationHistory } from '../../../../../parser/page-preparation/history';
import { clearAllSniptaleIds } from '../../../../../platform/frame';
import { setSniptaleId } from '../../../../../parser/dom-utils/dom-helpers';
import {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
} from '../../../../../../features/highlighter/style/defaults';
import { createBrowserAnnotationSession } from '../../../../../parser/page-preparation/annotations/session';
import { applyAiChangesWithHistory } from './history';

function createFrameSessionSnapshot(): FrameSessionSnapshot {
  return {
    frames: [],
    globalEffectMode: 'border',
    globalStepBadgeSettings: { autoMode: true },
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionBlurSettings: DEFAULT_BLUR_SETTINGS,
    sessionCalloutStyle: null,
    sessionFocusSettings: DEFAULT_FOCUS_SETTINGS,
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [],
  };
}

const annotationSession = createBrowserAnnotationSession();
const snapshot: PagePreparationSessionSnapshot = {
  annotations: annotationSession.captureSnapshot(),
  frameSession: createFrameSessionSnapshot(),
};

const bridge: PagePreparationHistoryBridge = {
  applySnapshot: () => undefined,
  captureSnapshot: () => structuredClone(snapshot),
};

afterEach(() => {
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  document.body.replaceChildren();
});

it('restores applied AI text through toolbar history after parser ids are cleaned', () => {
  const link = document.createElement('a');
  link.id = 'target';
  link.textContent = 'Before';
  document.body.append(link);
  const tree = {
    context: 'test',
    title: 'Page',
    structure: [
      {
        children: [
          {
            id: 'field-1',
            label: 'Status',
            selected: true,
            selector: '#target',
            type: 'field',
            value: 'Before',
            valueType: 'string',
          },
        ],
        id: 'section-1',
        selected: true,
        title: 'Section',
        type: 'section',
      },
    ],
  } satisfies ParsedDOMTree;
  pagePreparationHistory.registerBridge(bridge);

  applyAiChangesWithHistory(tree, [
    { fieldId: 'field-1', fieldName: 'Status', newValue: 'After', type: 'field' },
  ]);
  setSniptaleId(link, 'field-1-next-pass');
  clearAllSniptaleIds();

  expect(link.textContent).toBe('After');
  expect(pagePreparationHistory.getState().canUndo).toBe(true);
  pagePreparationHistory.undo();
  expect(link.textContent).toBe('Before');
});
