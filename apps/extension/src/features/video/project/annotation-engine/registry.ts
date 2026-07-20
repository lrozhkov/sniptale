import { BUILT_IN_VIDEO_ANNOTATION_PACKS } from './builtins/index';
import { APPLE_GLASS_ANNOTATION_PACK_ID } from './builtins/ids';
import { createLegacyAnnotationCompatibilityPacks } from './builtins/legacy-compatibility';
import { getLegacyAnnotationTemplateRef, isLegacyAnnotationTemplateKind } from './legacy';
import {
  VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControlValues,
  type VideoAnnotationTemplateRef,
  type VideoAnnotationTemplateSnapshot,
} from './types';
import type { VideoOverlayTemplateKind } from '../types/templates';

export interface VideoAnnotationPackRegistry {
  getPack(packId: string): VideoAnnotationPack | null;
  getTemplate(ref: VideoAnnotationTemplateRef): VideoAnnotationTemplate | null;
  listPacks(): readonly VideoAnnotationPack[];
  listTemplates(): readonly VideoAnnotationTemplate[];
}

export type VideoAnnotationTemplateResolution =
  | {
      pack: VideoAnnotationPack;
      ref: VideoAnnotationTemplateRef;
      source: 'legacyTemplateKind' | 'templateRef';
      status: 'resolved';
      template: VideoAnnotationTemplate;
    }
  | {
      fallbackRef: VideoAnnotationTemplateRef;
      fallbackTemplate: VideoAnnotationTemplate | null;
      message: string;
      reason: 'missing-pack' | 'missing-template' | 'missing-template-ref';
      ref: VideoAnnotationTemplateRef | null;
      status: 'fallback';
    };

type VideoAnnotationTemplateFallbackReason = Exclude<
  VideoAnnotationTemplateResolution,
  { status: 'resolved' }
>['reason'];

export interface VideoAnnotationTemplateResolvableClip {
  templateControlValues?: VideoAnnotationTemplateControlValues | undefined;
  templateKind?: VideoOverlayTemplateKind | undefined;
  templateRef?: VideoAnnotationTemplateRef | undefined;
  templateSnapshot?: VideoAnnotationTemplateSnapshot | undefined;
}

export const DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF: VideoAnnotationTemplateRef = {
  packId: APPLE_GLASS_ANNOTATION_PACK_ID,
  templateId: 'glass-identity-lower-third',
};

export function createVideoAnnotationPackRegistry(
  packs: readonly VideoAnnotationPack[] = BUILT_IN_VIDEO_ANNOTATION_PACKS
): VideoAnnotationPackRegistry {
  const compatibilityPacks =
    packs === BUILT_IN_VIDEO_ANNOTATION_PACKS ? createLegacyAnnotationCompatibilityPacks() : [];
  const indexedPacks = [...packs, ...compatibilityPacks];
  const packById = new Map(indexedPacks.map((pack) => [pack.packId, pack]));
  const templateByRef = new Map<string, VideoAnnotationTemplate>();

  indexedPacks.forEach((pack) => {
    Object.values(pack.templates).forEach((templates) => {
      templates.forEach((template) => {
        templateByRef.set(
          createTemplateRefKey({ packId: pack.packId, templateId: template.id }),
          template
        );
      });
    });
  });

  return {
    getPack(packId) {
      return packById.get(packId) ?? null;
    },
    getTemplate(ref) {
      return templateByRef.get(createTemplateRefKey(ref)) ?? null;
    },
    listPacks() {
      return packs;
    },
    listTemplates() {
      return [...templateByRef.values()];
    },
  };
}

export function createTemplateRefKey(ref: VideoAnnotationTemplateRef): string {
  return `${ref.packId}:${ref.templateId}`;
}

export function resolveVideoAnnotationTemplate(
  clip: VideoAnnotationTemplateResolvableClip,
  registry: VideoAnnotationPackRegistry = createVideoAnnotationPackRegistry()
): VideoAnnotationTemplateResolution {
  const sourceRef = resolveClipTemplateRef(clip);

  if (!sourceRef) {
    return createFallbackResolution('missing-template-ref', null, registry);
  }

  const pack = registry.getPack(sourceRef.ref.packId);
  if (!pack) {
    return createFallbackResolution('missing-pack', sourceRef.ref, registry, clip);
  }

  const template = registry.getTemplate(sourceRef.ref);
  if (!template) {
    return createFallbackResolution('missing-template', sourceRef.ref, registry, clip);
  }

  return {
    pack,
    ref: sourceRef.ref,
    source: sourceRef.source,
    status: 'resolved',
    template,
  };
}

export function resolveClipTemplateRef(
  clip: VideoAnnotationTemplateResolvableClip
): { ref: VideoAnnotationTemplateRef; source: 'legacyTemplateKind' | 'templateRef' } | null {
  if (isValidTemplateRef(clip.templateRef)) {
    return { ref: clip.templateRef, source: 'templateRef' };
  }
  if (isLegacyAnnotationTemplateKind(clip.templateKind)) {
    return { ref: getLegacyAnnotationTemplateRef(clip.templateKind), source: 'legacyTemplateKind' };
  }
  if (clip.templateSnapshot?.capturedAtSchemaVersion === VIDEO_ANNOTATION_PACK_SCHEMA_VERSION) {
    return { ref: clip.templateSnapshot.templateRef, source: 'templateRef' };
  }
  return null;
}

export function createVideoAnnotationTemplateSnapshot(
  ref: VideoAnnotationTemplateRef,
  controls: VideoAnnotationTemplateControlValues,
  template?: VideoAnnotationTemplate,
  pack?: {
    label?: VideoAnnotationPack['label'] | undefined;
    theme?: VideoAnnotationPack['theme'] | undefined;
  }
): VideoAnnotationTemplateSnapshot {
  return {
    capturedAtSchemaVersion: VIDEO_ANNOTATION_PACK_SCHEMA_VERSION,
    controls,
    ...(pack?.label ? { packLabel: pack.label } : {}),
    ...(pack?.theme ? { packTheme: pack.theme } : {}),
    ...(template ? { template } : {}),
    templateRef: ref,
  };
}

function createFallbackResolution(
  reason: VideoAnnotationTemplateFallbackReason,
  ref: VideoAnnotationTemplateRef | null,
  registry: VideoAnnotationPackRegistry,
  clip?: VideoAnnotationTemplateResolvableClip
): VideoAnnotationTemplateResolution {
  const fallbackRef = resolveLegacyFallbackRef(clip) ?? DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF;

  return {
    fallbackRef,
    fallbackTemplate:
      resolveSnapshotFallbackTemplate(reason, clip) ?? registry.getTemplate(fallbackRef),
    message: createFallbackMessage(reason, ref),
    reason,
    ref,
    status: 'fallback',
  };
}

function resolveSnapshotFallbackTemplate(
  reason: VideoAnnotationTemplateFallbackReason,
  clip: VideoAnnotationTemplateResolvableClip | undefined
): VideoAnnotationTemplate | null {
  if (reason === 'missing-template-ref') {
    return null;
  }
  if (clip?.templateSnapshot?.capturedAtSchemaVersion !== VIDEO_ANNOTATION_PACK_SCHEMA_VERSION) {
    return null;
  }
  return clip.templateSnapshot.template ?? null;
}

function resolveLegacyFallbackRef(
  clip: VideoAnnotationTemplateResolvableClip | undefined
): VideoAnnotationTemplateRef | null {
  return isLegacyAnnotationTemplateKind(clip?.templateKind)
    ? DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF
    : null;
}

function createFallbackMessage(
  reason: VideoAnnotationTemplateFallbackReason,
  ref: VideoAnnotationTemplateRef | null
): string {
  if (reason === 'missing-template-ref') {
    return 'Annotation clip has no template reference.';
  }
  if (reason === 'missing-pack') {
    return `Annotation pack ${ref?.packId ?? ''} is unavailable.`;
  }
  return `Annotation template ${ref?.templateId ?? ''} is unavailable.`;
}

function isValidTemplateRef(
  value: VideoAnnotationTemplateRef | undefined
): value is VideoAnnotationTemplateRef {
  return (
    typeof value?.packId === 'string' &&
    value.packId !== '' &&
    typeof value.templateId === 'string' &&
    value.templateId !== ''
  );
}
