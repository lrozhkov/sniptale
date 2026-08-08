import { describe, expect, it } from 'vitest';
import {
  createFrameAnnotationSnapshot,
  parseFrameAnnotationSnapshot,
  parseSerializedFrameAnnotationSnapshot,
  serializeFrameAnnotationSnapshot,
} from '.';
import { createDefaultFrameCallout, createDefaultFrameStepBadge } from './defaults';
import { createDefaultHighlighterSettings } from '../style/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';

describe('frame annotation snapshot boundary', () => {
  it('round-trips the versioned visual state without page or editor runtime metadata', () => {
    const snapshot = createFrameAnnotationSnapshot(
      {
        id: 'frame-1',
        x: 10,
        y: 20,
        width: 300,
        height: 180,
        effectMode: 'focus',
        focusSettings: { opacity: 0.65, showBorder: true },
      },
      4
    );

    expect(
      parseSerializedFrameAnnotationSnapshot(serializeFrameAnnotationSnapshot(snapshot))
    ).toEqual(snapshot);
    expect(snapshot).not.toHaveProperty('pagePlacement');
    expect(snapshot).not.toHaveProperty('linkedElementSelector');
  });

  it('round-trips up to four additional callouts and rejects oversized collections', () => {
    const callout = createDefaultFrameCallout();
    const snapshot = createFrameAnnotationSnapshot(
      {
        id: 'frame-with-callouts',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        callout,
        additionalCallouts: Array.from({ length: 4 }, () => structuredClone(callout)),
      },
      0
    );
    expect(parseFrameAnnotationSnapshot(snapshot)).toEqual(snapshot);
    expect(
      parseFrameAnnotationSnapshot({
        ...snapshot,
        additionalCallouts: [...snapshot.additionalCallouts!, structuredClone(callout)],
      })
    ).toBeNull();
    expect(parseFrameAnnotationSnapshot({ ...snapshot, callout: undefined })).toBeNull();
  });

  it('normalizes duplicate callout instance ids to stable collision-free identities', () => {
    const callout = { ...createDefaultFrameCallout(), instanceId: 'duplicate' };
    const snapshot = createFrameAnnotationSnapshot(
      {
        id: 'frame-duplicates',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        callout,
        additionalCallouts: [{ ...callout }, { ...callout }],
      },
      0
    );
    const parsed = parseFrameAnnotationSnapshot({
      ...snapshot,
      callout,
      additionalCallouts: [{ ...callout }, { ...callout }],
    });
    const ids = [parsed?.callout, ...(parsed?.additionalCallouts ?? [])].map(
      (item) => item?.instanceId
    );

    expect(ids).toEqual(['duplicate', 'frame-duplicates:callout:1', 'frame-duplicates:callout:2']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      parseSerializedFrameAnnotationSnapshot(serializeFrameAnnotationSnapshot(parsed!))
    ).toEqual(parsed);
  });

  it('rejects unknown versions, invalid geometry, cycles, and unbounded metadata', () => {
    const valid = createFrameAnnotationSnapshot(
      { id: 'frame-1', x: 0, y: 0, width: 10, height: 10 },
      0
    );
    expect(parseFrameAnnotationSnapshot({ ...valid, version: 2 })).toBeNull();
    expect(parseFrameAnnotationSnapshot({ ...valid, width: -1 })).toBeNull();
    expect(parseFrameAnnotationSnapshot({ ...valid, x: Number.NaN })).toBeNull();

    const cyclic: Record<string, unknown> = { ...valid };
    cyclic['callout'] = cyclic;
    expect(parseFrameAnnotationSnapshot(cyclic)).toBeNull();
    expect(parseSerializedFrameAnnotationSnapshot('{')).toBeNull();
  });

  it('normalizes ordering and protects the serialized boundary size', () => {
    const snapshot = createFrameAnnotationSnapshot(
      { id: 'frame-1', x: 0, y: 0, width: 10, height: 10 },
      3.8
    );
    expect(snapshot.ordering).toBe(3);
    expect(parseSerializedFrameAnnotationSnapshot('x'.repeat(1_000_001))).toBeNull();
  });

  it('rejects malformed nested settings and network-bearing custom CSS', () => {
    const valid = createFrameAnnotationSnapshot(
      { id: 'frame-1', x: 0, y: 0, width: 10, height: 10 },
      0
    );
    expect(parseFrameAnnotationSnapshot({ ...valid, blurSettings: 'blur(4px)' })).toBeNull();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        borderSettings: { customCss: 'background:url(https://example.com/pixel)' },
      })
    ).toBeNull();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        borderSettings: { customCss: 'background: u\\72l(https://example.com/pixel)' },
      })
    ).toBeNull();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        borderSettings: { customCss: 'color: v\\61r(--page-color)' },
      })
    ).toBeNull();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        borderSettings: { customCss: 'position: fixed' },
      })
    ).toBeNull();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        stepBadge: {
          ...createDefaultFrameStepBadge(),
          style: { ...createDefaultFrameStepBadge().style, customCss: '[badge]\nwidth: 200px;' },
        },
      })
    ).toBeNull();
    const callout = createDefaultFrameCallout();
    expect(
      parseFrameAnnotationSnapshot({
        ...valid,
        callout: {
          ...callout,
          style: { ...callout.style, customCss: '[card]\nposition: fixed;' },
        },
      })
    ).toBeNull();
  });

  it('validates linked frame template ids at the snapshot boundary', () => {
    const defaults = createDefaultHighlighterSettings();
    const borderSettings = projectBorderPresetToAppliedSettings(defaults.borderPresets[0]!);
    const valid = createFrameAnnotationSnapshot(
      { id: 'linked-frame', x: 0, y: 0, width: 100, height: 80, borderSettings },
      0
    );
    expect(parseFrameAnnotationSnapshot(valid)).toEqual({
      ...valid,
      borderSettings: { ...valid.borderSettings!, color: '#f97316' },
    });

    for (const linkedTemplates of [
      'callout',
      { calloutPresetId: 17, stepBadgePresetId: null },
      { calloutPresetId: null, stepBadgePresetId: {} },
      { calloutPresetId: 'x'.repeat(257), stepBadgePresetId: null },
      { calloutPresetId: null },
    ]) {
      expect(
        parseFrameAnnotationSnapshot({
          ...valid,
          borderSettings: {
            ...valid.borderSettings,
            effects: { ...valid.borderSettings!.effects, linkedTemplates },
          },
        })
      ).toBeNull();
    }
  });

  it('accepts the complete canonical badge and callout visual settings', () => {
    const snapshot = createFrameAnnotationSnapshot(
      {
        id: 'frame-1',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        stepBadge: createDefaultFrameStepBadge(),
        callout: createDefaultFrameCallout(),
      },
      0
    );
    expect(parseFrameAnnotationSnapshot(snapshot)).toEqual(snapshot);
  });

  it.each([
    ['connector', 'color'],
    ['accentEdge', 'color'],
    ['surface', 'shadowColor'],
  ] as const)('rejects direct and escaped resource-bearing callout %s.%s', (section, field) => {
    const valid = createFrameAnnotationSnapshot(
      {
        id: 'frame-1',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        callout: createDefaultFrameCallout(),
      },
      0
    );
    for (const unsafe of [
      'url(https://attacker.example/pixel)',
      'u\\72l(https://attacker.example/pixel)',
      'image-set("https://attacker.example/pixel" 1x)',
      'v\\61r(--page-color)',
    ]) {
      const callout = structuredClone(valid.callout!);
      Object.assign(callout.style[section], { [field]: unsafe });
      expect(parseFrameAnnotationSnapshot({ ...valid, callout })).toBeNull();
    }
  });
});
