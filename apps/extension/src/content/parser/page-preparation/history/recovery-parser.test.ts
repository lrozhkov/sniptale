import { expect, it } from 'vitest';
import { parsePagePreparationRecovery } from './recovery-parser';
import { PAGE_RECOVERY_MAX_BYTES } from '../../../../contracts/page-recovery';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../../../features/highlighter/frame-annotation/defaults';
import { createFrameAnnotationSnapshot } from '../../../../features/highlighter/frame-annotation/model';
import type { PagePreparationRecovery, PagePreparationSessionSnapshot } from './types';

it('retains marker-only ranges in both snapshots including stale source descriptors', () => {
  const value = packet();
  const marker = { id: 'range-1', source: 'A😀 old text', start: 1, end: 3, color: '#ffcc00' };
  for (const side of ['before', 'after'] as const) {
    const record = value.entries[0]![side].annotations.domRecords[0]!;
    record.propertyChanges = [];
    record.textMarkers = [marker];
  }
  const decoded = parsePagePreparationRecovery(value);
  for (const side of ['before', 'after'] as const)
    expect(decoded?.entries[0]?.[side].annotations.domRecords[0]?.textMarkers).toEqual([marker]);
});

it.each([
  { start: -1 },
  { end: 99 },
  { start: 2, end: 2 },
  { start: 0.5 },
  { color: 'url(https://example.test/private)' },
])('refuses malformed marker data before recovery: %j', (invalid) => {
  const value = packet();
  value.entries[0]!.after.annotations.domRecords[0]!.textMarkers = [
    { id: 'range', source: 'text', start: 0, end: 4, color: '#ffcc00', ...invalid },
  ];
  expect(parsePagePreparationRecovery(value)).toBeNull();
});

it.each([
  { property: 'background-image' },
  { beforePolicy: { source: 'page' } },
  { after: { value: 'blue', priority: 'urgent' } },
])('refuses unsupported declaration recovery data: %j', (invalid) => {
  const value = packet();
  const entry = value.entries[0]!;
  entry.scope = 'design-review';
  entry.patches = [];
  entry.style = {
    selector: 'p',
    declarations: [
      {
        property: 'color',
        order: 1,
        before: { value: 'red', priority: '' },
        after: { value: 'blue', priority: '' },
        beforePolicy: { source: 'inspector' },
        afterPolicy: { source: 'inspector' },
      },
    ],
  };
  Object.assign(entry.style.declarations[0]!, invalid);
  expect(parsePagePreparationRecovery(value)).toBeNull();
});

function packet(): PagePreparationRecovery {
  const frame = createFrameAnnotationSnapshot(
    {
      id: 'frame-1',
      x: 1,
      y: 2,
      width: 100,
      height: 80,
      callout: createDefaultFrameCallout(),
      stepBadge: createDefaultFrameStepBadge(),
    },
    0
  );
  const snapshot: PagePreparationSessionSnapshot = {
    annotations: {
      schemaVersion: 1,
      nextAnnotationId: 2,
      nextCreationOrder: 3,
      nextMarkerNumber: 2,
      domRecords: [
        {
          annotationId: 1,
          creationOrder: 1,
          markerNumber: 1,
          comment: 'Note',
          designReview: { action: 'verify' },
          propertyChanges: [
            {
              order: 1,
              property: 'color',
              before: { priority: '', value: '#111' },
              after: { priority: 'important', value: '#222' },
            },
          ],
          textChange: { before: 'Original', after: 'Edited' },
          evidence: {
            fileLabel: 'p',
            frame: { kind: 'top-document' },
            locator: 'body > p',
            nodePosition: { x: 1, y: 2 },
            pageUrl: 'https://example.test/page',
            targetPath: 'p',
            targetSelector: 'body > p',
            targetText: 'Original',
            viewport: { width: 1280, height: 560 },
          },
        },
      ],
      frameOrders: [
        {
          frameId: 'frame-1',
          kind: 'linked',
          linkedElementSelector: 'body > p',
          pageUrl: 'https://example.test/page',
          rect: { x: 1, y: 2, width: 100, height: 80 },
          viewport: { width: 1280, height: 560 },
          creationOrder: 2,
          frameName: 'Frame',
        },
      ],
    },
    frameSession: {
      frames: [
        {
          ...frame,
          linkedElementSelector: 'body > p',
          pagePlacement: { iframePath: ['iframe'], pageX: 1, pageY: 2 },
          offset: { x: 1, y: 2, width: -3, height: 4 },
        },
      ],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionCalloutStyle: structuredClone(frame.callout!.style),
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: structuredClone(frame.stepBadge!),
      stepBadgeOrder: [['frame-1', 1]],
    },
  };
  return {
    version: 1,
    entries: [
      {
        scope: 'content-editing',
        before: structuredClone(snapshot),
        after: structuredClone(snapshot),
        drawing: null,
        patches: [
          {
            selector: 'body > p',
            before: { html: 'Original', attributes: {} },
            after: { html: 'Edited', attributes: { style: 'color: #222;' } },
          },
        ],
      },
    ],
  };
}
it('decodes all current page data and retained frame anchors independently of source versions', () => {
  const raw = packet();
  const parsed = parsePagePreparationRecovery(raw)!;
  expect(parsed).not.toBeNull();
  expect(parsed.entries[0]!.after.annotations).toEqual(raw.entries[0]!.after.annotations);
  expect(parsed.entries[0]!.after.frameSession.frames[0]).toMatchObject({
    id: 'frame-1',
    linkedElementSelector: 'body > p',
    pagePlacement: { iframePath: ['iframe'], pageX: 1, pageY: 2 },
    offset: { x: 1, y: 2, width: -3, height: 4 },
    callout: { content: raw.entries[0]!.after.frameSession.frames[0]!.callout!.content },
  });
  raw.entries[0]!.after.annotations.domRecords[0]!.comment = 'Changed caller';
  raw.entries[0]!.after.frameSession.frames[0]!.pagePlacement!.iframePath.push('changed');
  expect(parsed.entries[0]!.after.annotations.domRecords[0]!.comment).toBe('Note');
  expect(parsed.entries[0]!.after.frameSession.frames[0]!.pagePlacement!.iframePath).toEqual([
    'iframe',
  ]);
});
it.each([null, [], {}, { version: 2, entries: [] }, { version: 1, entries: [] }])(
  'refuses malformed and future envelopes %j',
  (value) => {
    expect(parsePagePreparationRecovery(value)).toBeNull();
  }
);
it('refuses invalid producer scopes, snapshots, identities, geometry and styles as a complete set', () => {
  const mutations = [
    (p: PagePreparationRecovery) => Object.assign(p.entries[0]!, { scope: 'future' }),
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.annotations.schemaVersion = 2 as 1;
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.annotations.domRecords.push(
        p.entries[0]!.after.annotations.domRecords[0]!
      );
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.frameSession.frames[0]!.x = NaN;
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.frameSession.sessionFocusSettings.opacity = 2;
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.frameSession.sessionCalloutStyle!.customCss = 'position:fixed';
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.after.frameSession.frames.push(
        structuredClone(p.entries[0]!.after.frameSession.frames[0]!)
      );
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.patches[0]!.after.attributes['data-sniptale-id'] = 'temporary';
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.patches.push(structuredClone(p.entries[0]!.patches[0]!));
    },
    (p: PagePreparationRecovery) => {
      p.entries[0]!.drawing = {
        before: { version: 1, objects: [] },
        after: { version: 1, objects: [] },
      };
    },
  ];
  for (const mutate of mutations) {
    const raw = packet();
    mutate(raw);
    expect(parsePagePreparationRecovery(raw)).toBeNull();
  }
});
it('rejects cyclic, executable, deep and oversized data without calling accessors', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  expect(parsePagePreparationRecovery(cyclic)).toBeNull();
  let reads = 0;
  const accessor = Object.defineProperty({}, 'entries', {
    enumerable: true,
    get: () => {
      reads++;
      return [];
    },
  });
  expect(parsePagePreparationRecovery(accessor)).toBeNull();
  expect(reads).toBe(0);
  const deep: Record<string, unknown> = {};
  let current = deep;
  for (let i = 0; i < 40; i++) {
    const next = {};
    current['next'] = next;
    current = next;
  }
  expect(parsePagePreparationRecovery(deep)).toBeNull();
  expect(
    parsePagePreparationRecovery({ version: 1, entries: [], callback: () => undefined })
  ).toBeNull();
  expect(
    parsePagePreparationRecovery({
      version: 1,
      entries: [],
      large: 'x'.repeat(PAGE_RECOVERY_MAX_BYTES),
    })
  ).toBeNull();
});

it('accepts shared data references that JSON transport can serialize without cycles', () => {
  const raw = packet();
  raw.entries[0]!.before = raw.entries[0]!.after;
  expect(parsePagePreparationRecovery(raw)).not.toBeNull();
});
