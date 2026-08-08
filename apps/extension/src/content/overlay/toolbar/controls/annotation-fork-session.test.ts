import { expect, it, vi } from 'vitest';

const sendRuntimeMessage = vi.hoisted(() =>
  vi.fn(async (_message: unknown) => ({ result: 'written', revision: 1, success: true }))
);
vi.mock('../../../application/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/runtime-services/services')>()),
  getContentRuntimeServices: () => ({ messaging: { sendRuntimeMessage } }),
}));
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createDefaultFrameStepBadge } from '../../../../features/highlighter/frame-annotation/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import type { ToolbarFutureFrameStyle } from '../types';
import {
  applyAnnotationForkDrafts,
  parseAnnotationForkDrafts,
  persistAnnotationForkDrafts,
  selectAnnotationForkDrafts,
} from './annotation-fork-session';
import { serializeAnnotationForkDraftPayload } from '../../../../features/highlighter/frame-annotation/annotation-fork-payload';

function createStyle(): ToolbarFutureFrameStyle {
  return {
    blurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    borderSettings: DEFAULT_BORDER_PRESET,
    effectMode: 'border',
    focusSettings: { opacity: 0.5, showBorder: true },
  };
}

it('selects only unsaved fork slots and restores them over current tab defaults', () => {
  const callout = createDefaultCalloutSettings();
  const stepBadge = createDefaultFrameStepBadge();
  const {
    sourcePresetId: _sourcePresetId,
    sourcePresetName: _sourcePresetName,
    ...manualBorderSettings
  } = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
  const forkedStyle: ToolbarFutureFrameStyle = {
    ...createStyle(),
    borderSettings: { ...manualBorderSettings, width: 7 },
    futureCallout: { ...callout, sourcePresetId: undefined },
    futureStepBadge: { ...stepBadge, sourcePresetId: undefined },
  };
  const drafts = selectAnnotationForkDrafts(forkedStyle);
  const restored = applyAnnotationForkDrafts(createStyle(), drafts);

  expect(drafts).toMatchObject({
    callout: { enabled: true },
    frame: { borderSettings: { width: 7 } },
    stepBadge: { enabled: true },
  });
  expect(restored).toMatchObject({
    borderSettings: { width: 7 },
    futureCallout: { enabled: true },
    futureStepBadge: { enabled: true },
  });
});

it('persists only text-free visual fork settings', async () => {
  const callout = createDefaultCalloutSettings();
  callout.content = { bodyHtml: '<b>private body</b>', titleText: 'private title' };
  callout.instanceId = 'private-instance';
  callout.style.badge.text = 'private badge';
  const stepBadge = { ...createDefaultFrameStepBadge(), value: 'private number' };
  const {
    sourcePresetId: _frameSourcePresetId,
    sourcePresetName: _frameSourcePresetName,
    ...manualBorderSettings
  } = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
  const drafts = selectAnnotationForkDrafts({
    ...createStyle(),
    borderSettings: manualBorderSettings,
    futureCallout: { ...callout, sourcePresetId: undefined },
    futureStepBadge: { ...stepBadge, sourcePresetId: undefined },
  });

  await persistAnnotationForkDrafts(drafts);
  const rawMessage = sendRuntimeMessage.mock.lastCall?.[0];
  if (typeof rawMessage !== 'object' || rawMessage === null || !('payload' in rawMessage)) {
    throw new Error('Expected a persisted annotation fork payload');
  }
  expect(rawMessage.payload).not.toContain('private body');
  expect(rawMessage.payload).not.toContain('private title');
  expect(rawMessage.payload).not.toContain('private badge');
  expect(rawMessage.payload).not.toContain('private-instance');
  expect(rawMessage.payload).not.toContain('private number');
  expect(parseAnnotationForkDrafts(rawMessage.payload as string)).toMatchObject({
    callout: {
      content: { bodyHtml: '', titleText: '' },
      style: { badge: { text: '' } },
    },
    frame: { borderSettings: { width: manualBorderSettings.width } },
    stepBadge: { value: '' },
  });

  const frameLabelPayload = serializeAnnotationForkDraftPayload({
    frame: {
      ...createStyle(),
      borderSettings: {
        ...DEFAULT_BORDER_PRESET,
        sourcePresetName: 'private template label',
      },
    },
  });
  expect(frameLabelPayload).not.toContain('private template label');
});

it('reconciles a current-document revision race once and does not retry stale documents', async () => {
  sendRuntimeMessage
    .mockResolvedValueOnce({ result: 'stale', revision: 8, success: true })
    .mockResolvedValueOnce({ result: 'written', revision: 9, success: true });

  await persistAnnotationForkDrafts({ frame: createStyle() });
  const revisionRaceCalls = sendRuntimeMessage.mock.calls.slice(-2).map(([message]) => message);
  expect(revisionRaceCalls).toHaveLength(2);
  expect(revisionRaceCalls[1]).toMatchObject({ expectedRevision: 8, operation: 'write' });

  sendRuntimeMessage.mockResolvedValueOnce({
    result: 'stale-document',
    revision: 10,
    success: true,
  });
  const callCountBeforeStaleDocument = sendRuntimeMessage.mock.calls.length;
  await persistAnnotationForkDrafts({ frame: createStyle() });
  expect(sendRuntimeMessage.mock.calls.length).toBe(callCountBeforeStaleDocument + 1);
});

it('rejects malformed or unsafe stored fork payloads', () => {
  expect(parseAnnotationForkDrafts('{')).toBeNull();
  expect(parseAnnotationForkDrafts(JSON.stringify({ drafts: {}, version: 2 }))).toBeNull();
  expect(
    parseAnnotationForkDrafts(
      JSON.stringify({
        drafts: {
          frame: {
            ...createStyle(),
            borderSettings: { ...DEFAULT_BORDER_PRESET, customCss: 'background:url(javascript:x)' },
          },
        },
        version: 1,
      })
    )
  ).toBeNull();
  expect(
    parseAnnotationForkDrafts(JSON.stringify({ drafts: {}, extra: true, version: 1 }))
  ).toBeNull();
  expect(
    parseAnnotationForkDrafts(
      JSON.stringify({ drafts: { stepBadge: { unexpected: 'private' } }, version: 1 })
    )
  ).toBeNull();

  const safePayload = serializeAnnotationForkDraftPayload({
    callout: createDefaultCalloutSettings(),
  });
  for (const inheritedName of ['constructor', '__proto__', 'toString']) {
    const candidate = JSON.parse(safePayload) as {
      drafts: { callout: { style: { surface: Record<string, unknown> } } };
    };
    Object.defineProperty(candidate.drafts.callout.style.surface, inheritedName, {
      configurable: true,
      enumerable: true,
      value: 'private page text',
    });
    expect(parseAnnotationForkDrafts(JSON.stringify(candidate))).toBeNull();
  }

  const frameCandidate = JSON.parse(
    serializeAnnotationForkDraftPayload({ frame: createStyle() })
  ) as { drafts: { frame: { borderSettings: Record<string, unknown> } } };
  frameCandidate.drafts.frame.borderSettings['sourcePresetName'] = 'private template label';
  expect(parseAnnotationForkDrafts(JSON.stringify(frameCandidate))).toBeNull();
});
