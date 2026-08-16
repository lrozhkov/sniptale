import { expect, it } from 'vitest';
import { createGradientPaint, createSolidPaint } from '@sniptale/foundation/paint';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import { createDefaultFrameCallout, createDefaultFrameStepBadge } from './defaults';
import {
  canonicalizeAnnotationForkDraftPayload,
  parseAnnotationForkDraftPayload,
  serializeAnnotationForkDraftPayload,
} from './annotation-fork-payload';

it('accepts a legacy v1 callout title background and rewrites it to canonical Paint', () => {
  const legacyPayload: unknown = JSON.parse(
    serializeAnnotationForkDraftPayload({ callout: createDefaultFrameCallout() })
  );
  if (typeof legacyPayload !== 'object' || legacyPayload === null || !('drafts' in legacyPayload)) {
    throw new Error('Expected serialized annotation drafts');
  }
  const drafts = legacyPayload.drafts;
  if (typeof drafts !== 'object' || drafts === null || !('callout' in drafts)) {
    throw new Error('Expected serialized callout draft');
  }
  const callout = drafts.callout;
  if (typeof callout !== 'object' || callout === null || !('style' in callout)) {
    throw new Error('Expected serialized callout style');
  }
  const style = callout.style;
  if (typeof style !== 'object' || style === null || !('title' in style)) {
    throw new Error('Expected serialized callout title');
  }
  const title = style.title as Record<string, unknown>;
  if (typeof title !== 'object' || title === null) {
    throw new Error('Expected serialized callout title settings');
  }
  delete title['fillPaint'];
  delete title['fillMode'];
  Object.assign(title, { backgroundColor: '#123456' });

  const payload = JSON.stringify(legacyPayload);
  expect(parseAnnotationForkDraftPayload(payload)).toMatchObject({
    callout: { style: { title: { fillMode: 'separate', fillPaint: createSolidPaint('#123456') } } },
  });

  const canonical = canonicalizeAnnotationForkDraftPayload(payload);
  expect(canonical).not.toBeNull();
  const canonicalPayload: unknown = JSON.parse(canonical!);
  if (
    typeof canonicalPayload !== 'object' ||
    canonicalPayload === null ||
    !('drafts' in canonicalPayload)
  ) {
    throw new Error('Expected canonical annotation drafts');
  }
  const canonicalDrafts = canonicalPayload.drafts;
  if (
    typeof canonicalDrafts !== 'object' ||
    canonicalDrafts === null ||
    !('callout' in canonicalDrafts)
  ) {
    throw new Error('Expected canonical callout draft');
  }
  const canonicalCallout = canonicalDrafts.callout;
  if (
    typeof canonicalCallout !== 'object' ||
    canonicalCallout === null ||
    !('style' in canonicalCallout)
  ) {
    throw new Error('Expected canonical callout style');
  }
  const canonicalStyle = canonicalCallout.style;
  if (
    typeof canonicalStyle !== 'object' ||
    canonicalStyle === null ||
    !('title' in canonicalStyle)
  ) {
    throw new Error('Expected canonical callout title');
  }
  expect(canonicalStyle.title).toMatchObject({
    fillMode: 'separate',
    fillPaint: createSolidPaint('#123456'),
  });
  expect(canonicalStyle.title).not.toHaveProperty('backgroundColor');
});

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

  const offsetBadge = {
    ...createDefaultFrameStepBadge(),
    manualPlacement: { normalOffset: -32, position: 0.4, side: 'right' as const },
  };
  const offsetPayload = serializeAnnotationForkDraftPayload({ stepBadge: offsetBadge });
  expect(parseAnnotationForkDraftPayload(offsetPayload)).toMatchObject({
    stepBadge: { manualPlacement: offsetBadge.manualPlacement },
  });
  const invalidOffset: unknown = JSON.parse(offsetPayload);
  if (typeof invalidOffset !== 'object' || invalidOffset === null || !('drafts' in invalidOffset)) {
    throw new Error('Expected annotation drafts');
  }
  const offsetDrafts = invalidOffset.drafts;
  if (typeof offsetDrafts !== 'object' || offsetDrafts === null || !('stepBadge' in offsetDrafts)) {
    throw new Error('Expected step badge draft');
  }
  const invalidStepBadge = offsetDrafts.stepBadge;
  if (
    typeof invalidStepBadge !== 'object' ||
    invalidStepBadge === null ||
    !('manualPlacement' in invalidStepBadge)
  ) {
    throw new Error('Expected manual placement');
  }
  Object.assign(invalidStepBadge.manualPlacement as object, { normalOffset: 49 });
  expect(parseAnnotationForkDraftPayload(JSON.stringify(invalidOffset))).toBeNull();

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
