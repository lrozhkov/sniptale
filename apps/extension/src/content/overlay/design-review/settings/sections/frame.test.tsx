// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { BoxSection } from './frame';

const actions: DesignReviewActions = {
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
  updateValue: vi.fn(),
  updateValues: vi.fn(),
  voice: { start: vi.fn(), stop: vi.fn() },
};

it('gives long width values the whole available field row', () => {
  const state: DesignReviewViewState = {
    action: 'refine',
    anchor: null,
    comment: { commitFailed: false, draft: '', marker: null },
    defaultValues: { width: '100px', height: '50px' },
    draftPatch: { declarations: [] },
    modifiedProperties: [],
    selection: null,
    settingsOpen: true,
    values: { width: '1234567px', height: '12345px' },
    voice: { active: false, audioLevel: 0, caretPosition: null, errorCode: null, phase: 'idle' },
  };
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <BoxSection actions={actions} disabled={false} state={state} />
  );
  const widthInput = root.querySelector<HTMLInputElement>('input[aria-label="Ширина"]');
  expect(widthInput?.value).toBe('1234567');
  expect(widthInput?.closest('[data-ui="content.design-review.field"]')?.className).toContain(
    '!grid-cols-1'
  );
  expect(widthInput?.closest('.grid-cols-1')).not.toBeNull();
});
