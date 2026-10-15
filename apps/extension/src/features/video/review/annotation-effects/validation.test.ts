import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveEffectV1ControlDefault,
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
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

const hash = 'a'.repeat(64);
function source(name: string) {
  return readFileSync(
    resolve(
      'apps/extension/public/video-effects/effects/annotations',
      `sniptale-${name}/effect.sniptale-effect.json`
    ),
    'utf8'
  );
}
function snapshot(text: string) {
  const document = readReviewAnnotationEffectDocument(text);
  if (!document)
    throw new Error(JSON.stringify(validateEffectV1Document(JSON.parse(text)).diagnostics));
  return {
    id: `effect:${hash}`,
    schemaVersion: 'sniptale.effect.v1',
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
  it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'])(
    'retains every declared control and geometry of %s independently from the catalog',
    (name) => {
      const text = source(name);
      const document = readReviewAnnotationEffectDocument(text)!;
      const controls = Object.fromEntries(
        document.controls.map((c) => [c.id, resolveEffectV1ControlDefault(c, 'ru')])
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
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(text));
  return { ...retained, id: `effect:${sha256}`, sha256 };
}

async function svgSnapshot(bytes: Uint8Array) {
  const original = readReviewAnnotationEffectDocument(
    readFileSync(
      resolve(
        'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
      ),
      'utf8'
    )
  )!;
  const asset = original.assets[0]!;
  const sha256 = await sha256EffectV1Bytes(bytes);
  const text = JSON.stringify({
    ...original,
    assets: [{ ...asset, sha256, byteLength: bytes.byteLength }],
  });
  const retained = await byteSnapshot(text);
  return {
    ...retained,
    retainedByteLength: retained.retainedByteLength + bytes.byteLength,
    assets: [
      {
        id: asset.id,
        kind: 'svg' as const,
        mimeType: 'image/svg+xml',
        assetId: 'project-asset:imported',
        sha256,
        byteLength: bytes.byteLength,
      },
    ],
  };
}

describe('immutable byte verification', () => {
  it('verifies a real imported PNG with matching metadata and refuses a forged matching-hash signature', async () => {
    const bytes = Uint8Array.from(readFileSync(resolve('apps/extension/public/icons/icon-16.png')));
    const original = readReviewAnnotationEffectDocument(
      readFileSync(
        resolve(
          'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json'
        ),
        'utf8'
      )
    )!;
    const sha256 = await sha256EffectV1Bytes(bytes);
    const asset = original.assets[0]!;
    const retained = await byteSnapshot(
      JSON.stringify({
        ...original,
        controls: [],
        timeline: { phases: [], tracks: [] },
        assets: [
          {
            ...asset,
            kind: 'image',
            mimeType: 'image/png',
            path: 'assets/mark.png',
            byteLength: bytes.byteLength,
            sha256,
          },
        ],
        layers: original.layers.map((layer) =>
          layer.type === 'svgAsset' ? { ...layer, type: 'imageAsset' } : layer
        ),
        program: {
          kind: 'graph',
          version: 1,
          commands: [
            {
              op: 'image',
              assetId: asset.id,
              layerId: 'mark',
              x: 0,
              y: 0,
              width: 240,
              height: 240,
              fit: 'contain',
            },
          ],
        },
      })
    );
    const value = {
      ...retained,
      retainedByteLength: retained.retainedByteLength + bytes.byteLength,
      assets: [
        {
          id: asset.id,
          kind: 'image' as const,
          mimeType: 'image/png',
          assetId: 'project-asset:image',
          byteLength: bytes.byteLength,
          sha256,
        },
      ],
    };
    const verified = await verifyReviewAnnotationEffectSnapshot(
      value,
      async () => new Blob([bytes], { type: 'image/png' }),
      new AbortController().signal
    );
    expect(verified.mode).toBe('scene');
    expect(verified.assets[0]?.blob.size).toBe(bytes.byteLength);
    const forged = new Uint8Array(bytes.byteLength);
    const forgedSha = await sha256EffectV1Bytes(forged);
    const document = verified.document;
    const changed = await byteSnapshot(
      JSON.stringify({
        ...document,
        assets: document.assets.map((entry) => ({ ...entry, sha256: forgedSha })),
      })
    );
    await expect(
      verifyReviewAnnotationEffectSnapshot(
        {
          ...changed,
          retainedByteLength: changed.retainedByteLength + forged.byteLength,
          assets: value.assets.map((entry) => ({ ...entry, sha256: forgedSha })),
        },
        async () => new Blob([forged], { type: 'image/png' }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'resource-integrity' });
  });

  it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'])(
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

  it('verifies external SVG and explicitly retains full-scene geometry', async () => {
    const bytes = Uint8Array.from(
      readFileSync(resolve('tooling/test/e2e/fixtures/effect-v1/assets/neutral-mark.svg'))
    );
    const retained = await svgSnapshot(bytes);
    const blob = new Blob([bytes], { type: 'image/svg+xml' });
    const read = vi.fn(async () => blob);
    const signal = new AbortController().signal;
    const verified = await verifyReviewAnnotationEffectSnapshot(retained, read, signal);
    expect(verified.mode).toBe('scene');
    expect(verified.document.objectLayout).toBeUndefined();
    expect(verified.assets[0]?.blob).toBe(blob);
    expect(read).toHaveBeenCalledExactlyOnceWith('project-asset:imported', signal);
  });

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

  it('refuses missing resources and suppresses raw reader failures', async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const retained = await svgSnapshot(bytes);
    const signal = new AbortController().signal;
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, async () => undefined, signal)
    ).rejects.toMatchObject({ code: 'resource-unavailable' });
    await expect(
      verifyReviewAnnotationEffectSnapshot(
        retained,
        async () => {
          throw new Error('PRIVATE_CONTENT');
        },
        signal
      )
    ).rejects.toMatchObject({ message: 'Annotation effect is unavailable: resource-unavailable.' });
  });

  it('refuses mismatched MIME, size and bytes without rewriting retained metadata', async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const retained = await svgSnapshot(bytes);
    const original = structuredClone(retained);
    for (const blob of [
      new Blob([bytes], { type: 'image/png' }),
      new Blob(['short'], { type: 'image/svg+xml' }),
      new Blob([bytes.map((byte) => byte ^ 1)], { type: 'image/svg+xml' }),
    ]) {
      await expect(
        verifyReviewAnnotationEffectSnapshot(
          retained,
          async () => blob,
          new AbortController().signal
        )
      ).rejects.toMatchObject({ code: 'resource-integrity' });
    }
    expect(retained).toEqual(original);
  });

  it.each([
    'INVALID_SIGNATURE',
    '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    '<svg><image href="https://private.example/image.png"/></svg>',
  ])('refuses forged matching digests for unsafe resource %s', async (text) => {
    const bytes = new TextEncoder().encode(text);
    const retained = await svgSnapshot(bytes);
    await expect(
      verifyReviewAnnotationEffectSnapshot(
        retained,
        async () => new Blob([bytes], { type: 'image/svg+xml' }),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'resource-integrity' });
  });

  it('keeps early and late cancellation distinct from unavailable reads', async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const retained = await svgSnapshot(bytes);
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(
      verifyReviewAnnotationEffectSnapshot(retained, read, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
    const late = new AbortController();
    await expect(
      verifyReviewAnnotationEffectSnapshot(
        retained,
        async () => {
          late.abort();
          return new Blob([bytes], { type: 'image/svg+xml' });
        },
        late.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
