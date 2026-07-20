import { z } from 'zod';
import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlSection,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelineExtrapolate,
  VideoAnnotationTimelinePhase,
  type VideoAnnotationPack,
  type VideoAnnotationRenderNode,
} from './types';
import { VIDEO_ANNOTATION_NODE_PROPERTIES } from './node-properties';

const primitiveValueSchema = z.union([z.boolean(), z.number(), z.string(), z.null()]);
const localizedTextSchema = z.object({
  fallback: z.string().min(1),
  key: z.string().min(1).optional(),
});

const controlSchema = z.object({
  binding: z.discriminatedUnion('kind', [
    z.object({
      field: z.enum([
        'content.badge',
        'content.headline',
        'content.subline',
        'style.accentColor',
        'style.backgroundColor',
        'style.badgeTextColor',
        'style.borderRadius',
        'style.headlineColor',
        'style.padding',
        'style.sublineColor',
      ]),
      kind: z.literal(VideoAnnotationControlBindingKind.TEMPLATE_FIELD),
    }),
    z.object({
      kind: z.literal(VideoAnnotationControlBindingKind.THEME_TOKEN),
      tokenId: z.string().min(1),
    }),
    z.object({
      kind: z.literal(VideoAnnotationControlBindingKind.NODE_PROPERTY),
      nodeId: z.string().min(1),
      property: z.enum(VIDEO_ANNOTATION_NODE_PROPERTIES),
    }),
    z.object({
      field: z.enum(['durationMs', 'easing']),
      kind: z.literal(VideoAnnotationControlBindingKind.TIMELINE_PROPERTY),
      trackIds: z.array(z.string().min(1)).optional(),
    }),
  ]),
  defaultValue: primitiveValueSchema,
  id: z.string().min(1),
  label: localizedTextSchema,
  max: z.number().optional(),
  min: z.number().optional(),
  options: z.array(z.object({ label: localizedTextSchema, value: z.string().min(1) })).optional(),
  section: z.enum(Object.values(VideoAnnotationControlSection)).optional(),
  step: z.number().positive().optional(),
  type: z.enum([
    VideoAnnotationControlType.BOOLEAN,
    VideoAnnotationControlType.COLOR,
    VideoAnnotationControlType.NUMBER,
    VideoAnnotationControlType.SELECT,
    VideoAnnotationControlType.TEXT,
  ]),
});

const renderNodeSchema: z.ZodType<VideoAnnotationRenderNode> = z.lazy(() =>
  z.object({
    children: z.array(renderNodeSchema).optional(),
    frame: z
      .object({
        height: z.union([z.number(), z.string()]).optional(),
        width: z.union([z.number(), z.string()]).optional(),
        x: z.union([z.number(), z.string()]).optional(),
        y: z.union([z.number(), z.string()]).optional(),
      })
      .optional(),
    id: z.string().min(1),
    nodeType: z.enum(Object.values(VideoAnnotationRenderNodeKind)),
    props: z.record(z.string(), primitiveValueSchema).optional(),
    style: z.record(z.string(), primitiveValueSchema).optional(),
  })
);

const timelineSchema = z.object({
  durationMs: z.number().positive(),
  labels: z.array(z.object({ id: z.string().min(1), offsetMs: z.number().min(0) })),
  phases: z.array(
    z.object({
      durationMs: z.number().min(0),
      id: z.enum(Object.values(VideoAnnotationTimelinePhase)),
      startMs: z.number().min(0),
    })
  ),
  tracks: z.array(
    z.object({
      extrapolate: z.enum(Object.values(VideoAnnotationTimelineExtrapolate)).optional(),
      id: z.string().min(1),
      keyframes: z
        .array(
          z.object({
            easing: z.enum(Object.values(VideoAnnotationTimelineEasing)).optional(),
            labelRef: z.string().min(1).optional(),
            offsetMs: z.number().min(0),
            phase: z.enum(Object.values(VideoAnnotationTimelinePhase)).optional(),
            value: primitiveValueSchema,
          })
        )
        .min(1),
      property: z.string().min(1),
      stagger: z
        .object({
          index: z.number().int().min(0).optional(),
          intervalMs: z.number().min(0),
        })
        .optional(),
      targetNodeId: z.string().min(1),
    })
  ),
});

const templateSchema = z.object({
  controls: z.array(controlSchema),
  description: localizedTextSchema,
  elementKind: z.enum(Object.values(VideoAnnotationElementKind)),
  id: z.string().min(1),
  label: localizedTextSchema,
  renderTree: renderNodeSchema,
  target: z.object({
    kind: z.enum(Object.values(VideoAnnotationTargetBindingKind)),
    required: z.boolean().optional(),
  }),
  timeline: timelineSchema,
});

const annotationPackSchema = z.object({
  description: localizedTextSchema,
  label: localizedTextSchema,
  packId: z.string().min(1),
  schemaVersion: z.literal(VIDEO_ANNOTATION_PACK_SCHEMA_VERSION),
  templates: z.object({
    callout: z.array(templateSchema),
    focus: z.array(templateSchema),
    intro: z.array(templateSchema),
    lowerThird: z.array(templateSchema),
    scene: z.array(templateSchema),
    title: z.array(templateSchema),
  }),
  theme: z.object({
    defaults: z.record(z.string(), primitiveValueSchema),
    tokens: z.array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['color', 'fontFamily', 'number', 'shadow', 'text']),
        value: primitiveValueSchema,
      })
    ),
  }),
});

export function parseAnnotationPackPayload(payload: unknown) {
  return annotationPackSchema.safeParse(payload);
}

export function coerceParsedAnnotationPack(pack: z.infer<typeof annotationPackSchema>) {
  return pack satisfies VideoAnnotationPack;
}
