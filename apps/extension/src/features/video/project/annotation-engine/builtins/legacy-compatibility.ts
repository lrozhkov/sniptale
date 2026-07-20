import {
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
  getLegacyAnnotationTargetBindingKind,
  getLegacyAnnotationTemplateRef,
  LEGACY_TEMPLATE_ELEMENT_KIND,
  LEGACY_TEMPLATE_TARGET_KIND,
} from '../legacy';
import { createEmptyVideoAnnotationTemplateGroups } from '../parser';
import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTimelinePhase,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateGroups,
} from '../types';
import { createLegacyAnnotationControls } from '../legacy-controls';
import { VIDEO_OVERLAY_TEMPLATE_DEFINITION_LIST } from '../../overlay-template/data';
import type { VideoOverlayTemplateDefinition } from '../../overlay-template/definition';

type LegacyFamily = 'editorial' | 'technical';

export function createLegacyAnnotationCompatibilityPacks(): readonly VideoAnnotationPack[] {
  return [createPack('editorial'), createPack('technical')];
}

function createPack(family: LegacyFamily): VideoAnnotationPack {
  return {
    description: { fallback: 'Hidden compatibility templates for existing annotation clips.' },
    label: { fallback: family === 'editorial' ? 'Legacy Editorial' : 'Legacy Technical' },
    packId:
      family === 'editorial'
        ? SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID
        : SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
    schemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
    templates: createTemplateGroups(family),
    theme: createTheme(family),
  };
}

function createTemplateGroups(family: LegacyFamily): VideoAnnotationTemplateGroups {
  const groups = createEmptyVideoAnnotationTemplateGroups();

  VIDEO_OVERLAY_TEMPLATE_DEFINITION_LIST.forEach((definition) => {
    const packId =
      family === 'editorial'
        ? SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID
        : SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID;
    const ref = getLegacyAnnotationTemplateRef(definition.templateKind);
    if (ref.packId !== packId) {
      return;
    }
    const elementKind = LEGACY_TEMPLATE_ELEMENT_KIND[definition.templateKind];
    groups[elementKind] = [...groups[elementKind], createTemplate(definition, family)];
  });

  return groups;
}

function createTemplate(
  definition: VideoOverlayTemplateDefinition,
  family: LegacyFamily
): VideoAnnotationTemplate {
  const targetKind = LEGACY_TEMPLATE_TARGET_KIND[definition.templateKind];
  return {
    controls: createControls(family),
    description: { fallback: definition.templateKind, key: definition.descriptionKey },
    elementKind: LEGACY_TEMPLATE_ELEMENT_KIND[definition.templateKind],
    id: definition.templateKind,
    label: { fallback: definition.templateKind, key: definition.labelKey },
    renderTree: createRenderTree(definition.templateKind),
    target: {
      kind: getLegacyAnnotationTargetBindingKind(targetKind),
      required: targetKind !== 'NONE',
    },
    timeline: {
      durationMs: Math.round(definition.defaultDurationSeconds * 1000),
      labels: [],
      phases: [
        {
          durationMs: Math.round(definition.defaultDurationSeconds * 1000),
          id: VideoAnnotationTimelinePhase.IDLE,
          startMs: 0,
        },
      ],
      tracks: [],
    },
  };
}

function createRenderTree(templateId: string): VideoAnnotationTemplate['renderTree'] {
  return {
    children: [
      {
        frame: { height: '100%', width: '100%', x: 0, y: 0 },
        id: 'panel',
        nodeType: VideoAnnotationRenderNodeKind.RECT,
        style: { fill: 'token:panel', radius: 12 },
      },
      {
        frame: { height: 28, width: '82%', x: 18, y: 16 },
        id: 'headline',
        nodeType: VideoAnnotationRenderNodeKind.TEXT,
        props: { text: `field:headline:${templateId}` },
        style: { fill: 'token:text', fontSize: 18, weight: 680 },
      },
    ],
    id: 'root',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
  };
}

function createControls(family: LegacyFamily) {
  return createLegacyAnnotationControls({ accentNodeId: 'headline', family });
}

function createTheme(family: LegacyFamily): VideoAnnotationPack['theme'] {
  const accent = family === 'editorial' ? '#d97706' : '#2563eb';
  return {
    defaults: {
      accent,
      panel: 'rgba(15,23,42,0.78)',
      text: '#ffffff',
    },
    tokens: [
      { id: 'accent', type: 'color', value: accent },
      { id: 'panel', type: 'color', value: 'rgba(15,23,42,0.78)' },
      { id: 'text', type: 'color', value: '#ffffff' },
    ],
  };
}
