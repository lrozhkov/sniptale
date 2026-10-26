import { z } from 'zod';
import { parseColor } from '@sniptale/foundation/color';
import { PAGE_STYLE_ALLOWED_PROPERTIES } from '@sniptale/runtime-contracts/page-style';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  CalloutVisualStyle,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import { parseDrawingDocument } from '../../../../features/drawing/public';
import { parseFrameAnnotationSnapshot } from '../../../../features/highlighter/frame-annotation/parser';
import {
  parseBorderSettings,
  parseBlurSettings,
  isStepBadgeSettings,
  isCalloutSettings,
} from '../../../../features/highlighter/frame-annotation/settings-parser';
import { isPageRecoveryPayload } from '../../../../contracts/page-recovery';
import type { PagePreparationRecovery, SerializableFrameData } from './types';

/** Zod optional fields can contain undefined; owner snapshots use absent optional properties. */
function definedFields<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite();
const text = z.string().max(2_000_000);
const id = z.string().min(1).max(256);
const selector = z.string().min(1).max(16_384);
const point = z.object({ x: finite, y: finite });
const rect = point.extend({ width: finite.nonnegative(), height: finite.nonnegative() });
const viewport = z.object({ width: finite.nonnegative(), height: finite.nonnegative() });
const effect = z.enum(['border', 'blur', 'focus']);
const scope = z.enum(['annotation', 'content-editing', 'design-review', 'drawing']);
const frameContext = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('top-document') }),
  z
    .object({ kind: z.literal('iframe'), selector, name: text.optional(), url: text.optional() })
    .transform(definedFields),
]);
const evidence = z
  .object({
    fileLabel: text,
    frame: frameContext,
    locator: selector,
    nodePosition: point,
    pageUrl: text,
    targetPath: text,
    targetRole: text.optional(),
    targetSelector: selector,
    targetText: text,
    viewport,
  })
  .transform(definedFields);
const declaration = z.object({ priority: z.enum(['', 'important']), value: text });
const textMarker = z
  .object({
    id,
    source: text,
    start: count,
    end: count,
    color: z
      .string()
      .max(256)
      .refine((value) => parseColor(value) !== null),
  })
  .refine((value) => value.start < value.end && value.end <= value.source.length);
const domRecord = z
  .object({
    annotationId: count,
    creationOrder: count,
    comment: text.optional(),
    markerNumber: count.optional(),
    designReview: z
      .object({ action: z.enum(['refine', 'fix', 'simplify', 'verify', 'explain']).nullable() })
      .optional(),
    evidence,
    propertyChanges: z
      .array(
        z.object({
          before: declaration,
          after: declaration,
          order: count,
          property: z.string().min(1).max(256),
        })
      )
      .max(2000),
    textChange: z.object({ before: text, after: text }).optional(),
    textMarkers: z.array(textMarker).max(2000).optional(),
  })
  .transform(definedFields);
const frameRecord = z
  .object({
    borderPresetName: text.optional(),
    comment: text.optional(),
    frameId: id,
    kind: z.enum(['free', 'linked']),
    linkedElementSelector: selector.optional(),
    pageUrl: text,
    rect,
    viewport,
    creationOrder: count,
    frameName: text,
  })
  .transform(definedFields);
function unique<T>(values: T[], identity: (value: T) => string | number): boolean {
  return new Set(values.map(identity)).size === values.length;
}
const annotations = z.object({
  schemaVersion: z.literal(1),
  nextAnnotationId: count,
  nextCreationOrder: count,
  nextMarkerNumber: count,
  domRecords: z
    .array(domRecord)
    .max(2000)
    .refine((values) => unique(values, (value) => value.annotationId)),
  frameOrders: z
    .array(frameRecord)
    .max(2000)
    .refine((values) => unique(values, (value) => value.frameId)),
});
function ownerParser<T>(decode: (value: unknown) => T | null | undefined) {
  return z.unknown().transform((value, context) => {
    const parsed = decode(value);
    if (parsed === null || parsed === undefined) {
      context.addIssue({ code: 'custom', message: 'Invalid page recovery owner data' });
      return z.NEVER;
    }
    return parsed;
  });
}
const anchors = z
  .object({
    linkedElementSelector: selector.optional(),
    createdBy: z.literal('auto-blur').optional(),
    pagePlacement: z
      .object({ iframePath: z.array(selector).max(20), pageX: finite, pageY: finite })
      .optional(),
    offset: point.extend({ width: finite, height: finite }).optional(),
  })
  .transform(definedFields);
function parseFrame(value: unknown): SerializableFrameData | null {
  if (!isPlainRecord(value)) return null;
  const visual = parseFrameAnnotationSnapshot({ ...value, version: 1, ordering: 0 });
  const anchor = anchors.safeParse(value);
  if (!visual || !anchor.success) return null;
  const { version: _version, ordering: _ordering, ...fields } = visual;
  return { ...fields, ...anchor.data };
}
const stepBadge = z
  .custom<StepBadgeSettings>((value) => value !== undefined && isStepBadgeSettings(value))
  .transform((value) => structuredClone(value));
const calloutStyle = z
  .custom<CalloutVisualStyle>(
    (value) =>
      value !== undefined &&
      isCalloutSettings({
        enabled: false,
        content: { bodyHtml: '', titleText: '' },
        placement: { anchor: 'top-center', side: 'auto' },
        style: value,
      })
  )
  .transform((value) => structuredClone(value));
const focus = z
  .object({
    opacity: finite.min(0).max(1),
    blurAmount: finite.min(0).max(25).optional(),
    showBorder: z.boolean().optional(),
  })
  .transform(definedFields);
const frameSession = z.object({
  frames: z
    .array(ownerParser(parseFrame))
    .max(2000)
    .refine((values) => unique(values, (value) => value.id)),
  globalEffectMode: effect,
  globalStepBadgeSettings: z.object({ autoMode: z.boolean() }),
  sessionBorderPreset: ownerParser(parseBorderSettings),
  sessionBlurSettings: ownerParser(parseBlurSettings),
  sessionCalloutStyle: calloutStyle.nullable(),
  sessionFocusSettings: focus,
  sessionStepBadgeTemplate: stepBadge.nullable(),
  stepBadgeOrder: z
    .array(z.tuple([id, count]))
    .max(2000)
    .refine((values) => unique(values, (value) => value[0])),
});
const snapshot = z.object({ annotations, frameSession });
const elementState = z.object({
  html: text,
  attributes: z
    .record(z.string().min(1).max(256), z.string().max(200_000))
    .refine(
      (value) =>
        Object.keys(value).length <= 1024 &&
        !Object.keys(value).some((key) =>
          ['__proto__', 'prototype', 'constructor', 'data-sniptale-id'].includes(key)
        )
    ),
});
const drawing = ownerParser(parseDrawingDocument);
const style = z.object({
  selector,
  declarations: z
    .array(
      z.object({
        property: z.enum(PAGE_STYLE_ALLOWED_PROPERTIES),
        order: count,
        before: declaration,
        after: declaration,
        beforePolicy: z.object({ source: z.literal('inspector') }),
        afterPolicy: z.object({ source: z.literal('inspector') }),
      })
    )
    .min(1)
    .max(PAGE_STYLE_ALLOWED_PROPERTIES.length)
    .refine((values) => unique(values, (value) => value.property)),
});
const packetSchema = z
  .object({
    version: z.literal(1),
    entries: z
      .array(
        z
          .object({
            scope,
            before: snapshot,
            after: snapshot,
            patches: z
              .array(z.object({ selector, before: elementState, after: elementState }))
              .max(2000)
              .refine((values) => unique(values, (value) => value.selector)),
            drawing: z.object({ before: drawing, after: drawing }).nullable(),
            style: style.nullable().optional(),
          })
          .refine((value) =>
            value.scope === 'drawing'
              ? value.drawing !== null && value.patches.length === 0 && !value.style
              : value.drawing === null &&
                (!value.style || (value.scope === 'design-review' && value.patches.length === 0))
          )
          .transform(definedFields)
      )
      .min(1)
      .max(2000),
  })
  .strict();

/** Rejects cyclic, executable and excessive data before owner parsers can retain custom fields. */
function isBoundedData(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number; leave?: boolean }> = [{ value, depth: 0 }];
  const ancestors = new Set<object>();
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (item.leave && typeof item.value === 'object' && item.value !== null) {
      ancestors.delete(item.value);
      continue;
    }
    if (++nodes > 2_000_000 || item.depth > 32) return false;
    const current = item.value;
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== 'object' || ancestors.has(current)) return false;
    if (
      !Array.isArray(current) &&
      Object.getPrototypeOf(current) !== Object.prototype &&
      Object.getPrototypeOf(current) !== null
    )
      return false;
    ancestors.add(current);
    pending.push({ value: current, depth: item.depth, leave: true });
    for (const field of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if (!field.enumerable) continue;
      if (field.get || field.set) return false;
      pending.push({ value: field.value, depth: item.depth + 1 });
    }
  }
  return true;
}

/** Decodes the complete portable set before the first DOM or drawing mutation. */
export function parsePagePreparationRecovery(value: unknown): PagePreparationRecovery | null {
  try {
    if (!isBoundedData(value) || !isPageRecoveryPayload(JSON.stringify(value))) return null;
    const parsed = packetSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
