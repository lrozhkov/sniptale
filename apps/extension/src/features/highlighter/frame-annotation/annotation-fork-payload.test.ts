import { expect, it } from 'vitest';
import { createGradientPaint } from '@sniptale/foundation/paint';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import { createDefaultFrameCallout, createDefaultFrameStepBadge } from './defaults';
import {
  canonicalizeAnnotationForkDraftPayload,
  parseAnnotationForkDraftPayload,
  serializeAnnotationForkDraftPayload,
} from './annotation-fork-payload';

it('round-trips canonical gradient Paint and rejects unknown nested paint fields', () => {
  let id = 0;
  const fillPaint = createGradientPaint('#12345680', () => `stop-${++id}`, 'radial');
  const payload = serializeAnnotationForkDraftPayload({
    frame: {
      blurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      borderSettings: {
        ...projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
        fillPaint,
      },
      effectMode: 'border',
      focusSettings: { opacity: 0.5, showBorder: true },
    },
  });

  expect(parseAnnotationForkDraftPayload(payload)).toMatchObject({
    frame: { borderSettings: { fillPaint } },
  });
  const canonical = canonicalizeAnnotationForkDraftPayload(payload);
  expect(canonical).not.toBeNull();
  expect(canonicalizeAnnotationForkDraftPayload(canonical!)).toBe(canonical);

  const malformed: unknown = JSON.parse(payload);
  if (typeof malformed !== 'object' || malformed === null || !('drafts' in malformed)) {
    throw new Error('Expected serialized annotation drafts');
  }
  const drafts = malformed.drafts;
  if (typeof drafts !== 'object' || drafts === null || !('frame' in drafts)) {
    throw new Error('Expected serialized frame draft');
  }
  const frame = drafts.frame;
  if (typeof frame !== 'object' || frame === null || !('borderSettings' in frame)) {
    throw new Error('Expected serialized border settings');
  }
  const borderSettings = frame.borderSettings;
  if (
    typeof borderSettings !== 'object' ||
    borderSettings === null ||
    !('fillPaint' in borderSettings)
  ) {
    throw new Error('Expected serialized Paint');
  }
  const paint = borderSettings.fillPaint;
  if (typeof paint !== 'object' || paint === null) throw new Error('Expected Paint object');
  Object.assign(paint, { privatePageValue: true });
  expect(parseAnnotationForkDraftPayload(JSON.stringify(malformed))).toBeNull();
  const allDrafts = serializeAnnotationForkDraftPayload({
    callout: createDefaultFrameCallout(),
    stepBadge: createDefaultFrameStepBadge(),
  });
  expect(parseAnnotationForkDraftPayload(allDrafts)).toMatchObject({
    callout: { content: { bodyHtml: '', titleText: '' } },
    stepBadge: { value: '' },
  });
  expect(parseAnnotationForkDraftPayload(JSON.stringify({ drafts: {}, version: 1 }))).toEqual({});

  const invalidMode: unknown = JSON.parse(payload);
  if (typeof invalidMode !== 'object' || invalidMode === null || !('drafts' in invalidMode)) {
    throw new Error('Expected annotation drafts');
  }
  const invalidDrafts = invalidMode.drafts;
  if (typeof invalidDrafts !== 'object' || invalidDrafts === null || !('frame' in invalidDrafts)) {
    throw new Error('Expected frame draft');
  }
  const invalidFrame = invalidDrafts.frame;
  if (typeof invalidFrame !== 'object' || invalidFrame === null) throw new Error('Expected frame');
  Object.assign(invalidFrame, { effectMode: 'unknown' });
  expect(parseAnnotationForkDraftPayload(JSON.stringify(invalidMode))).toBeNull();
  expect(canonicalizeAnnotationForkDraftPayload('{')).toBeNull();
});
