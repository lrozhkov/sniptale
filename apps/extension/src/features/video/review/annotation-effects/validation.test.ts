import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateAnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { sha256 as hashSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { initializeReviewAnnotationEffectAnchors } from './layout';
import {
  parseReviewAnnotationEffects,
  mergeReviewAnnotationEffectSnapshots,
  parseReviewAnnotationEffectSnapshots,
  readReviewAnnotationEffectDocument,
  reviewAnnotationEffectMatchesDocument,
  verifyReviewAnnotationEffectSnapshot,
} from './validation';
import type { ReviewAnnotationEffect } from './types';
import { createReviewAnnotationTextClip } from './text-animation';
import { createQuickEditAdvancedContent } from '../advanced/defaults';
import { loadQuickEditAdvancedContentState } from '../advanced/validation';

const hash = 'a'.repeat(64);
function source(name: string) {
  return readFileSync(
    name === 'callout'
      ? 'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
      : resolve(
          'apps/extension/public/video-effects/animations',
          `${name}.sniptale-animation.json`
        ),
    'utf8'
  );
}
function snapshot(text: string) {
  const document = readReviewAnnotationEffectDocument(text);
  if (!document)
    throw new Error(JSON.stringify(validateAnimationTemplate(JSON.parse(text)).diagnostics));
  return {
    id: `effect:${hash}`,
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: document.id,
    sha256: hash,
    source: text,
    retainedByteLength: new TextEncoder().encode(text).byteLength,
    assets: [],
  };
}
function instance(): ReviewAnnotationEffect {
  return {
    id: 'instance',
    snapshotId: `effect:${hash}`,
    enabled: true,
    start: 2,
    end: 6,
    attachment: 'content',
    transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation: 0 },
    controls: {},
    order: 0,
  };
}

describe('annotation JSON admission', () => {
  it('reuses identical immutable values regardless of caller key order and still rejects a rewrite', () => {
    const first = parseReviewAnnotationEffectSnapshots([snapshot(source('title'))])![0]!;
    const { source: text, ...rest } = first;
    const reordered = { source: text, ...rest };
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(first));
    expect(mergeReviewAnnotationEffectSnapshots([first], [reordered])).toEqual([first]);
    expect(
      mergeReviewAnnotationEffectSnapshots(
        [first],
        [{ ...reordered, source: `${text}\n`, retainedByteLength: first.retainedByteLength + 1 }]
      )
    ).toBeNull();
  });
  it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners', 'arrow'])(
    'retains every declared control and geometry of %s independently from the catalog',
    (name) => {
      const text = source(name);
      const document = readReviewAnnotationEffectDocument(text)!;
      const controls = Object.fromEntries(
        document.controls.map((c) => [c.id, resolveEffectControlDefault(c, 'ru')])
      );
      const current = instance();
      const anchors = initializeReviewAnnotationEffectAnchors(
        document,
        current.transform,
        controls,
        { width: 1920, height: 1080 }
      );
      for (const handle of document.objectLayout?.handles ?? []) {
        delete controls[handle.xControl];
        delete controls[handle.yControl];
      }
      const raw = {
        enabled: false,
        instances: [{ ...current, controls, ...(anchors ? { anchors } : {}), enabled: false }],
      };
      const admitted = parseReviewAnnotationEffects(raw)!;
      expect(reviewAnnotationEffectMatchesDocument(admitted.instances[0]!, document)).toBe(true);
      expect(parseReviewAnnotationEffects(admitted)).toEqual(admitted);
      const retained = parseReviewAnnotationEffectSnapshots([snapshot(text)]);
      expect(retained).not.toBeNull();
      expect(parseReviewAnnotationEffectSnapshots(retained)).toEqual(retained);
      expect(raw.instances[0]?.enabled).toBe(false);
    }
  );

  it('admits overlapping source intervals with a canonical explicit order', () => {
    const first = instance(),
      second = { ...instance(), id: 'second', order: 1 };
    const raw = { enabled: true, instances: [second, first] };
    expect(parseReviewAnnotationEffects(raw)?.instances).toEqual([first, second]);
    expect(raw.instances).toEqual([second, first]);
    expect(parseReviewAnnotationEffects({ ...raw, instances: [first, first] })).toBeNull();
    expect(
      parseReviewAnnotationEffects({ ...raw, instances: [first, { ...second, order: 0 }] })
    ).toBeNull();
  });

  it.each([
    { start: NaN },
    { end: 2 },
    { attachment: 'scene' },
    { controls: { hidden: true } },
    { transform: { x: 0, y: 0, width: 0, height: 1, rotation: 0 } },
    { anchors: { tip: { x: Infinity, y: 0 } } },
  ])('refuses malformed authored values %j', (change) => {
    expect(
      parseReviewAnnotationEffects({ enabled: true, instances: [{ ...instance(), ...change }] })
    ).toBeNull();
  });

  it('checks declared control kinds, ranges, options and handle closure without visual-preset restrictions', () => {
    const document = readReviewAnnotationEffectDocument(source('callout'))!;
    const control = document.controls.find((c) => c.kind === 'number' && c.max !== undefined)!;
    const handle = document.objectLayout!.handles![0]!;
    const current = { ...instance(), anchors: { [handle.id]: { x: 2, y: -0.3 } } };
    expect(reviewAnnotationEffectMatchesDocument(current, document)).toBe(true);
    expect(
      reviewAnnotationEffectMatchesDocument({ ...current, controls: { unknown: 1 } }, document)
    ).toBe(false);
    expect(
      reviewAnnotationEffectMatchesDocument(
        { ...current, controls: { [control.id]: 'wrong' } },
        document
      )
    ).toBe(false);
    expect(
      reviewAnnotationEffectMatchesDocument(
        { ...current, controls: { [handle.xControl]: 1 } },
        document
      )
    ).toBe(false);
    expect(reviewAnnotationEffectMatchesDocument(instance(), document)).toBe(false);
    expect(
      reviewAnnotationEffectMatchesDocument(
        { ...current, anchors: { unknown: { x: 0, y: 0 } } },
        document
      )
    ).toBe(false);
  });

  it('refuses invalid source, identity, totals, missing resources and duplicate immutable identities', () => {
    const value = snapshot(source('frame'));
    for (const change of [
      { source: '{}' },
      { id: 'other' },
      { documentId: 'other' },
      { retainedByteLength: value.retainedByteLength + 1 },
      { kind: 'transition' },
      { assets: [{ id: 'external', assetId: 'project-asset:missing' }] },
    ])
      expect(parseReviewAnnotationEffectSnapshots([{ ...value, ...change }])).toBeNull();
    expect(parseReviewAnnotationEffectSnapshots([value, value])).toBeNull();
  });
});

async function byteSnapshot(text: string) {
  const retained = snapshot(text);
  const sha256 = bytesToHex(hashSha256(new TextEncoder().encode(text)));
  return { ...retained, id: `effect:${sha256}`, sha256 };
}

function imageSource(bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  const original = readReviewAnnotationEffectDocument(source('frame'))!;
  return JSON.stringify({
    ...original,
    resources: [
      ...original.resources,
      {
        path: 'images/mark.png',
        mimeType: 'image/png',
        byteLength: bytes.byteLength,
        sha256: bytesToHex(hashSha256(bytes)),
        base64: Buffer.from(bytes).toString('base64'),
        ...overrides,
      },
    ],
    animation: {
      ...original.animation,
      assets: [{ id: 'mark', w: 16, h: 16, p: 'images/mark.png', u: '', e: 0 }],
    },
  });
}

function png() {
  return Uint8Array.from(readFileSync(resolve('apps/extension/public/icons/icon-16.png')));
}

describe('immutable byte verification', () => {
  it('verifies an embedded PNG and refuses a changed resource digest without changing the snapshot', async () => {
    const bytes = png();
    const retained = await byteSnapshot(imageSource(bytes));
    const before = structuredClone(retained);
    const read = vi.fn();
    const verified = await verifyReviewAnnotationEffectSnapshot(
      retained,
      read,
      new AbortController().signal
    );
    expect(verified.mode).toBe('object');
    expect(verified.assets).toEqual([]);
    expect(verified.document.resources.at(-1)?.base64).toBe(Buffer.from(bytes).toString('base64'));
    expect(verified.document.resources.at(-1)?.byteLength).toBe(bytes.byteLength);
    expect(read).not.toHaveBeenCalled();
    const changed = await byteSnapshot(imageSource(bytes, { sha256: '0'.repeat(64) }));
    await expect(
      verifyReviewAnnotationEffectSnapshot(changed, read, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'resource-integrity' });
    expect(retained).toEqual(before);
  });

  it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners', 'arrow'])(
    'verifies %s source without a catalog or resource acquisition',
    async (name) => {
      const retained = await byteSnapshot(source(name));
      const read = vi.fn();
      const verified = await verifyReviewAnnotationEffectSnapshot(
        retained,
        read,
        new AbortController().signal
      );
      expect(verified.snapshot).toEqual(retained);
      expect(verified.mode).toBe('object');
      expect(verified.assets).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    }
  );

  it('refuses changed source despite structurally valid JSON and recomputed retained size', async () => {
    const retained = await byteSnapshot(source('frame'));
    const read = vi.fn();
    await expect(
      verifyReviewAnnotationEffectSnapshot(
        {
          ...retained,
          source: retained.source + ' ',
          retainedByteLength: retained.retainedByteLength + 1,
        },
        read,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'source-integrity' });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { mimeType: 'image/jpeg' },
    { byteLength: 1 },
    { path: 'https://private.example/mark.png' },
    { path: '../mark.png' },
  ])('refuses inconsistent embedded metadata without external acquisition %j', async (change) => {
    const text = imageSource(png(), change);
    const bytes = new TextEncoder().encode(text),
      digest = bytesToHex(hashSha256(bytes));
    const retained = {
      ...snapshot(source('frame')),
      source: text,
      id: `effect:${digest}`,
      sha256: digest,
      retainedByteLength: bytes.byteLength,
    };
    const before = structuredClone(retained),
      read = vi.fn();
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, read, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'ReviewAnnotationEffectUnavailableError' });
    expect(read).not.toHaveBeenCalled();
    expect(retained).toEqual(before);
  });

  it.each([
    'INVALID_SIGNATURE',
    '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    '<svg><image href="https://private.example/image.png"/></svg>',
  ])('refuses forged matching digests and unsupported SVG before acquisition %s', async (text) => {
    const bytes = new TextEncoder().encode(text),
      value = imageSource(bytes);
    const digest = bytesToHex(hashSha256(new TextEncoder().encode(value))),
      read = vi.fn();
    const retained = {
      ...snapshot(source('frame')),
      id: `effect:${digest}`,
      sha256: digest,
      source: value,
      retainedByteLength: new TextEncoder().encode(value).byteLength,
    };
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, read, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses a missing embedded resource instead of invoking the legacy asset reader', async () => {
    const original = readReviewAnnotationEffectDocument(source('title'))!;
    const text = JSON.stringify({ ...original, resources: [] });
    const digest = bytesToHex(hashSha256(new TextEncoder().encode(text))),
      read = vi.fn(async () => {
        throw new Error('PRIVATE_CONTENT');
      });
    const retained = {
      ...snapshot(source('title')),
      id: `effect:${digest}`,
      sha256: digest,
      source: text,
      retainedByteLength: new TextEncoder().encode(text).byteLength,
    };
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, read, new AbortController().signal)
    ).rejects.toMatchObject({ message: 'Annotation effect is unavailable: invalid.' });
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps early and late cancellation distinct without reading external resources', async () => {
    const retained = await byteSnapshot(source('title')),
      read = vi.fn();
    const early = new AbortController();
    early.abort();
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, read, early.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    const late = new AbortController();
    const pending = verifyReviewAnnotationEffectSnapshot(retained, read, late.signal);
    // Verification yields after the first embedded resource. Abort before its continuation.
    late.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
  });
});

it('admits native text and phases in schema 35 and rejects malformed or downgraded data', () => {
  const content = createQuickEditAdvancedContent();
  const text = createReviewAnnotationTextClip('title', 'Результат 👩🏽‍💻', 5, 7, 1);
  text.entrance.preset = 'cascade';
  text.loop.preset = 'sway';
  text.exit.preset = 'fade';
  const lane = { enabled: true, instances: [instance()], textClips: [text] };
  expect(loadQuickEditAdvancedContentState({ ...content, annotationEffects: lane })).toEqual({
    ...content,
    annotationEffects: lane,
  });
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 34 })).toEqual(content);
  expect(
    loadQuickEditAdvancedContentState({ ...content, schemaVersion: 34, annotationEffects: lane })
  ).toBeNull();
  for (const clip of [
    { ...text, id: instance().id },
    { ...text, order: 0 },
    { ...text, end: text.start },
    { ...text, color: 'url(https://example.test)' },
    { ...text, loop: { ...text.loop, period: 0 } },
    { ...text, exit: { ...text.exit, preset: 'unknown' } },
  ]) {
    expect(parseReviewAnnotationEffects({ ...lane, textClips: [clip] })).toBeNull();
  }
});

it('admits long non-overlapping text and rejects excess simultaneous layout work', () => {
  const text = 'Д'.repeat(4096);
  const start = createReviewAnnotationTextClip('start', text, 0, 3, 0);
  const overlap = createReviewAnnotationTextClip('overlap', text, 1, 2, 1);
  const next = createReviewAnnotationTextClip('next', text, 2, 4, 2);
  const lane = { enabled: true, instances: [], textClips: [start, overlap, next] };
  expect(parseReviewAnnotationEffects(lane)).toEqual(lane);
  expect(
    parseReviewAnnotationEffects({
      ...lane,
      textClips: [start, overlap, { ...next, start: 1.99 }],
    })
  ).toBeNull();
  const shortTitles = Array.from({ length: 129 }, (_, index) =>
    createReviewAnnotationTextClip(`small-${index}`, 'A', 0, 1, index)
  );
  expect(parseReviewAnnotationEffects({ ...lane, textClips: shortTitles })).toBeNull();
  expect(
    parseReviewAnnotationEffects({ ...lane, textClips: shortTitles.slice(0, 128) })
  ).not.toBeNull();
});
