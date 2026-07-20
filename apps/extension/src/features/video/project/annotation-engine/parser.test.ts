import { describe, expect, it } from 'vitest';
import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlSection,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelinePhase,
} from './types';
import { parseVideoAnnotationPack } from './parser';

function createMinimalPack() {
  return {
    description: { fallback: 'Minimal test pack' },
    label: { fallback: 'Test Pack' },
    packId: 'test.pack',
    schemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
    templates: createMinimalTemplateGroups(),
    theme: {
      defaults: { accent: '#2563eb' },
      tokens: [{ id: 'accent', type: 'color', value: '#2563eb' }],
    },
  };
}

function createMinimalTemplateGroups() {
  return {
    callout: [],
    focus: [],
    intro: [],
    lowerThird: [createMinimalTemplate()],
    scene: [],
    title: [],
  };
}

function createMinimalTemplate() {
  return {
    controls: [createHeadlineControl()],
    description: { fallback: 'Lower third' },
    elementKind: VideoAnnotationElementKind.LOWER_THIRD,
    id: 'lower-third',
    label: { fallback: 'Lower third' },
    renderTree: createMinimalRenderTree(),
    target: { kind: VideoAnnotationTargetBindingKind.NONE },
    timeline: createMinimalTimeline(),
  };
}

function createHeadlineControl() {
  return {
    binding: {
      kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
      nodeId: 'headline',
      property: 'text',
    },
    defaultValue: 'Hello',
    id: 'headline',
    label: { fallback: 'Headline' },
    type: VideoAnnotationControlType.TEXT,
  };
}

function createMinimalRenderTree() {
  return {
    children: [
      { id: 'headline', nodeType: VideoAnnotationRenderNodeKind.TEXT, props: { text: 'Hello' } },
    ],
    id: 'root',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
  };
}

function createMinimalTimeline() {
  return {
    durationMs: 1000,
    labels: [{ id: 'in', offsetMs: 0 }],
    phases: [{ durationMs: 300, id: VideoAnnotationTimelinePhase.INTRO, startMs: 0 }],
    tracks: [
      {
        id: 'opacity',
        keyframes: [
          { easing: VideoAnnotationTimelineEasing.EASE_OUT, labelRef: 'in', offsetMs: 0, value: 0 },
          { offsetMs: 300, value: 1 },
        ],
        property: 'opacity',
        targetNodeId: 'root',
      },
    ],
  };
}

function expectRejected(payload: unknown, code: string): void {
  const result = parseVideoAnnotationPack(payload);

  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.errors.map((error) => error.code)).toContain(code);
}

function pushControl(pack: ReturnType<typeof createMinimalPack>, control: unknown): void {
  (pack.templates.lowerThird[0]!.controls as unknown[]).push(control);
}

describe('parseVideoAnnotationPack', () => {
  registerAcceptedAnnotationPackParserTests();
  registerRejectedAnnotationPackParserTests();
});

function registerAcceptedAnnotationPackParserTests() {
  registerBasicAnnotationPackParserTests();
  registerTimelineAnnotationPackParserTests();
  registerControlAnnotationPackParserTests();
}

function registerBasicAnnotationPackParserTests() {
  it('accepts a minimal valid pack', () => {
    const result = parseVideoAnnotationPack(createMinimalPack());

    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it('accepts v1 timeline extrapolate and stagger controls', () => {
    const pack = createMinimalPack();
    const track = {
      ...pack.templates.lowerThird[0]!.timeline.tracks[0]!,
      extrapolate: 'extend',
      stagger: { index: 2, intervalMs: 80 },
    };
    pack.templates.lowerThird[0]!.timeline.tracks = [track];

    expect(parseVideoAnnotationPack(pack)).toEqual(expect.objectContaining({ ok: true }));
  });

  it('accepts v1 native node control properties used by scene renderers', () => {
    const pack = createMinimalPack();
    pushControl(pack, {
      binding: {
        kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
        nodeId: 'headline',
        property: 'fontSize',
      },
      defaultValue: '22',
      id: 'headlineSize',
      label: { fallback: 'Headline size' },
      type: VideoAnnotationControlType.TEXT,
    });

    expect(parseVideoAnnotationPack(pack)).toEqual(expect.objectContaining({ ok: true }));
  });
}

function registerTimelineAnnotationPackParserTests() {
  it('accepts timeline duration and easing controls with known track references', () => {
    const pack = createMinimalPack();
    pushControl(pack, {
      binding: {
        field: 'easing',
        kind: VideoAnnotationControlBindingKind.TIMELINE_PROPERTY,
        trackIds: ['opacity'],
      },
      defaultValue: VideoAnnotationTimelineEasing.LINEAR,
      id: 'easing',
      label: { fallback: 'Easing' },
      options: [{ label: { fallback: 'Linear' }, value: VideoAnnotationTimelineEasing.LINEAR }],
      type: VideoAnnotationControlType.SELECT,
    });

    expect(parseVideoAnnotationPack(pack)).toEqual(expect.objectContaining({ ok: true }));
  });
}

function registerControlAnnotationPackParserTests() {
  it('accepts declarative control section metadata', () => {
    const pack = createMinimalPack();
    (
      pack.templates.lowerThird[0]!.controls[0]! as { section?: VideoAnnotationControlSection }
    ).section = VideoAnnotationControlSection.CONTENT;

    expect(parseVideoAnnotationPack(pack)).toEqual(expect.objectContaining({ ok: true }));
  });
}

function registerRejectedAnnotationPackParserTests() {
  registerRejectedPackIdentityTests();
  registerRejectedControlBindingTests();
  registerRejectedTimelineTests();
}

function registerRejectedPackIdentityTests() {
  it('rejects an invalid root payload', () => {
    expectRejected(null, 'invalid_type');
  });

  it('rejects duplicate ids', () => {
    const pack = createMinimalPack();
    pack.theme.tokens.push({ id: 'accent', type: 'color', value: '#d97706' });

    expectRejected(pack, 'duplicate_id');
  });

  it('rejects unsupported node types', () => {
    const pack = createMinimalPack();
    pack.templates.lowerThird[0]!.renderTree.children[0]!.nodeType = 'image' as never;

    expectRejected(pack, 'invalid_value');
  });
}

function registerRejectedControlBindingTests() {
  it('rejects invalid control bindings', () => {
    const pack = createMinimalPack();
    pack.templates.lowerThird[0]!.controls[0]!.binding.nodeId = 'missing-node';

    expectRejected(pack, 'unknown_control_node');
  });

  it('rejects timeline controls with unknown track references', () => {
    const pack = createMinimalPack();
    pushControl(pack, {
      binding: {
        field: 'durationMs',
        kind: VideoAnnotationControlBindingKind.TIMELINE_PROPERTY,
        trackIds: ['missing-track'],
      },
      defaultValue: 1000,
      id: 'duration',
      label: { fallback: 'Duration' },
      type: VideoAnnotationControlType.NUMBER,
    });

    expectRejected(pack, 'unknown_control_timeline_track');
  });
}

function registerRejectedTimelineTests() {
  it('rejects invalid keyframes', () => {
    const pack = createMinimalPack();
    pack.templates.lowerThird[0]!.timeline.tracks[0]!.keyframes[1]!.offsetMs = 1200;

    expectRejected(pack, 'keyframe_out_of_range');
  });

  it('rejects unknown schema versions', () => {
    const pack = createMinimalPack();
    pack.schemaVersion = 99;

    expectRejected(pack, 'invalid_value');
  });
}
