import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { createReviewCaptionSettings } from '../text-document';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveState,
  resolveQuickEditExportPlan,
} from './effective';

it('applies captions from the scene independently of timeline visibility and retains OFF/basic content', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.captions = createReviewCaptionSettings();
  state.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        start: 0,
        end: 2,
        text: 'Caption',
        originalText: '',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'result',
        alignment: 'manual',
        showInVideo: true,
      },
    ],
  };
  const document = { edits: [], canvasComments: [] };
  expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
    video: 'copy',
  });
  state.captions.enabled = true;
  expect(resolveQuickEditEffectiveState(state)).toMatchObject({
    captions: state.captions,
    text: state.text,
  });
  expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
    video: 'render',
    reasons: ['captions'],
  });
  state.ui.mode = 'basic';
  expect(resolveQuickEditEffectiveState(state).captions).toBeUndefined();
  expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
    video: 'copy',
  });
  expect(hasSuppressedAdvancedFeatures(state)).toBe(true);
  expect(state.text.fragments[0]?.text).toBe('Caption');
  state.ui.mode = 'advanced';
  state.text.fragments[0]!.showInVideo = false;
  expect(resolveQuickEditExportPlan({ document, advanced: state })).toMatchObject({
    video: 'copy',
  });
});
