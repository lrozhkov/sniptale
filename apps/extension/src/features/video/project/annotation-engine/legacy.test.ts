import { describe, expect, it } from 'vitest';

import {
  LEGACY_TEMPLATE_ELEMENT_KIND,
  LEGACY_TEMPLATE_TARGET_KIND,
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
  getLegacyAnnotationTargetBindingKind,
  isLegacyAnnotationTemplateKind,
  isLegacyAnnotationTemplateRef,
  shouldUseLegacyAnnotationRenderer,
} from './legacy';
import { VideoAnnotationElementKind } from './types';
import { VideoAnnotationTargetKind, VideoOverlayTemplateKind } from '../types/templates';

describe('legacy annotation compatibility boundary', () => {
  it('keeps every legacy template mapped to an element and target kind', () => {
    const templateKinds = Object.values(VideoOverlayTemplateKind);

    expect(new Set(Object.keys(LEGACY_TEMPLATE_ELEMENT_KIND))).toEqual(new Set(templateKinds));
    expect(new Set(Object.keys(LEGACY_TEMPLATE_TARGET_KIND))).toEqual(new Set(templateKinds));
    expect(LEGACY_TEMPLATE_ELEMENT_KIND[VideoOverlayTemplateKind.CALLOUT_CARD]).toBe(
      VideoAnnotationElementKind.CALLOUT
    );
    expect(LEGACY_TEMPLATE_TARGET_KIND[VideoOverlayTemplateKind.CALLOUT_CONNECTOR]).toBe(
      VideoAnnotationTargetKind.POINT
    );
  });

  it('recognizes only known template refs from the two legacy packs', () => {
    expect(isLegacyAnnotationTemplateRef(undefined)).toBe(false);
    expect(
      isLegacyAnnotationTemplateRef({
        packId: SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
        templateId: VideoOverlayTemplateKind.TITLE_REVEAL,
      })
    ).toBe(true);
    expect(
      isLegacyAnnotationTemplateRef({
        packId: SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
        templateId: VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
      })
    ).toBe(true);
    expect(
      isLegacyAnnotationTemplateRef({
        packId: 'custom-pack',
        templateId: VideoOverlayTemplateKind.TITLE_REVEAL,
      })
    ).toBe(false);
    expect(
      isLegacyAnnotationTemplateRef({
        packId: SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
        templateId: 'UNKNOWN',
      })
    ).toBe(false);
  });
});

describe('legacy annotation renderer compatibility', () => {
  it('resolves renderer authority by explicit ref, snapshot ref, then template kind', () => {
    const legacyRef = {
      packId: SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
      templateId: VideoOverlayTemplateKind.TITLE_REVEAL,
    };

    expect(shouldUseLegacyAnnotationRenderer({ templateRef: legacyRef })).toBe(true);
    expect(
      shouldUseLegacyAnnotationRenderer({
        templateRef: { ...legacyRef, packId: 'custom-pack' },
        templateSnapshot: { templateRef: legacyRef },
      })
    ).toBe(false);
    expect(
      shouldUseLegacyAnnotationRenderer({ templateSnapshot: { templateRef: legacyRef } })
    ).toBe(true);
    expect(
      shouldUseLegacyAnnotationRenderer({
        templateSnapshot: { templateRef: { ...legacyRef, packId: 'custom-pack' } },
      })
    ).toBe(false);
    expect(
      shouldUseLegacyAnnotationRenderer({ templateKind: VideoOverlayTemplateKind.SIDE_NOTE })
    ).toBe(true);
    expect(shouldUseLegacyAnnotationRenderer({})).toBe(false);
  });

  it('maps legacy target bindings and validates template-kind inputs', () => {
    expect(getLegacyAnnotationTargetBindingKind(VideoAnnotationTargetKind.POINT)).toBe('point');
    expect(getLegacyAnnotationTargetBindingKind(VideoAnnotationTargetKind.RECT)).toBe('rect');
    expect(getLegacyAnnotationTargetBindingKind(VideoAnnotationTargetKind.NONE)).toBe('none');
    expect(isLegacyAnnotationTemplateKind(VideoOverlayTemplateKind.SHIMMER_LABEL)).toBe(true);
    expect(isLegacyAnnotationTemplateKind('UNKNOWN')).toBe(false);
    expect(isLegacyAnnotationTemplateKind(null)).toBe(false);
  });
});
