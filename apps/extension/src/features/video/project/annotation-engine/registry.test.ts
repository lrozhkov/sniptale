import { describe, expect, it } from 'vitest';
import { VideoOverlayTemplateKind } from '../types/templates';
import { getLegacyAnnotationTargetBindingKind, isLegacyAnnotationTemplateKind } from './legacy';
import {
  BUILT_IN_VIDEO_ANNOTATION_PACKS,
  DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF,
  createTemplateRefKey,
  createVideoAnnotationPackRegistry,
  getLegacyAnnotationTemplateRef,
  getLegacyAnnotationTemplateRefs,
  parseVideoAnnotationPack,
  resolveVideoAnnotationTemplate,
} from './index';

describe('annotation template compatibility registry', () => {
  registerBuiltInRegistryTests();
  registerTemplateResolutionTests();
  registerTemplateFallbackTests();
  registerLegacyNarrowingTests();
});

function registerBuiltInRegistryTests() {
  it('ships parseable native built-in annotation packs without legacy comparison packs', () => {
    expect(BUILT_IN_VIDEO_ANNOTATION_PACKS).toHaveLength(2);
    expect(BUILT_IN_VIDEO_ANNOTATION_PACKS.map((pack) => pack.packId).sort()).toEqual([
      'sniptale.apple-glass',
      'sniptale.cursor-ops',
    ]);
    BUILT_IN_VIDEO_ANNOTATION_PACKS.forEach((pack) => {
      expect(parseVideoAnnotationPack(pack)).toEqual(expect.objectContaining({ ok: true }));
    });
  });

  it('keeps legacy packs hidden from the visible catalog but resolvable for old clips', () => {
    const registry = createVideoAnnotationPackRegistry();
    const refs = getLegacyAnnotationTemplateRefs();

    expect(
      registry
        .listPacks()
        .map((pack) => pack.packId)
        .sort()
    ).toEqual(['sniptale.apple-glass', 'sniptale.cursor-ops']);
    expect(Object.keys(refs).sort()).toEqual(Object.values(VideoOverlayTemplateKind).sort());
    Object.values(VideoOverlayTemplateKind).forEach((templateKind) => {
      const ref = getLegacyAnnotationTemplateRef(templateKind);

      expect(registry.getTemplate(ref)?.id).toBe(templateKind);
    });
  });
}

function registerTemplateResolutionTests() {
  it('resolves legacy clips through hidden compatibility templates', () => {
    const result = resolveVideoAnnotationTemplate({
      templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
    });

    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' ? result.ref : null).toEqual(
      getLegacyAnnotationTemplateRef(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)
    );
    expect(result.status === 'resolved' ? result.source : null).toBe('legacyTemplateKind');
  });

  it('resolves new template refs before legacy template kinds', () => {
    const ref = {
      packId: 'sniptale.apple-glass',
      templateId: 'product-title-lockup',
    };
    const result = resolveVideoAnnotationTemplate({
      templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
      templateRef: ref,
    });

    expect(result).toEqual(expect.objectContaining({ ref, source: 'templateRef' }));
  });
}

function registerTemplateFallbackTests() {
  registerMissingTemplateFallbackTests();
  registerSnapshotTemplateFallbackTests();
}

function registerMissingTemplateFallbackTests() {
  it('returns typed fallback state when a pack disappears', () => {
    const result = resolveVideoAnnotationTemplate({
      templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
      templateRef: { packId: 'missing.pack', templateId: 'lower-third' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        fallbackRef: DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF,
        reason: 'missing-pack',
        ref: { packId: 'missing.pack', templateId: 'lower-third' },
        status: 'fallback',
      })
    );
    expect(result.status === 'fallback' ? result.fallbackTemplate?.id : null).toBe(
      DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF.templateId
    );
  });

  it('returns the default fallback when no legacy kind can recover the clip', () => {
    const result = resolveVideoAnnotationTemplate({
      templateRef: { packId: 'missing.pack', templateId: 'lower-third' },
    });

    expect(result.status === 'fallback' ? result.fallbackRef : null).toEqual(
      DEFAULT_VIDEO_ANNOTATION_TEMPLATE_REF
    );
  });
}

function registerSnapshotTemplateFallbackTests() {
  it('uses the clip snapshot template when a custom pack is unavailable', () => {
    const snapshotTemplate = BUILT_IN_VIDEO_ANNOTATION_PACKS[0].templates.title[0]!;
    const result = resolveVideoAnnotationTemplate({
      templateRef: { packId: 'custom.pack', templateId: 'custom-title' },
      templateSnapshot: {
        capturedAtSchemaVersion: 1,
        controls: {},
        template: { ...snapshotTemplate, id: 'custom-title' },
        templateRef: { packId: 'custom.pack', templateId: 'custom-title' },
      },
    });

    expect(result.status).toBe('fallback');
    expect(result.status === 'fallback' ? result.fallbackTemplate?.id : null).toBe('custom-title');
  });

  it('returns typed fallback state when a template disappears', () => {
    const result = resolveVideoAnnotationTemplate({
      templateRef: { packId: 'sniptale.apple-glass', templateId: 'missing-template' },
    });

    expect(result.status).toBe('fallback');
    expect(result.status === 'fallback' ? result.reason : null).toBe('missing-template');
  });
}

function registerLegacyNarrowingTests() {
  it('narrows legacy template and target binding compatibility values', () => {
    expect(isLegacyAnnotationTemplateKind(VideoOverlayTemplateKind.POINTER_LABEL)).toBe(true);
    expect(isLegacyAnnotationTemplateKind('unknown-template')).toBe(false);
    expect(getLegacyAnnotationTargetBindingKind('POINT')).toBe('point');
    expect(getLegacyAnnotationTargetBindingKind('RECT')).toBe('rect');
    expect(getLegacyAnnotationTargetBindingKind('NONE')).toBe('none');
  });

  it('keeps template ref keys stable for future user packs', () => {
    expect(createTemplateRefKey({ packId: 'user.pack', templateId: 'intro' })).toBe(
      'user.pack:intro'
    );
  });
}
