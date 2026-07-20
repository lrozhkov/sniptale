import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  type VideoAnnotationTemplateControl,
} from './types';

type LegacyAnnotationControlFamily = 'editorial' | 'technical';

export function createLegacyAnnotationControls({
  accentNodeId,
  family,
}: {
  accentNodeId: string;
  family: LegacyAnnotationControlFamily;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    {
      binding: {
        field: 'content.headline',
        kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      },
      defaultValue: family === 'editorial' ? 'Key moment' : 'System state',
      id: 'headline',
      label: { fallback: 'Headline' },
      type: VideoAnnotationControlType.TEXT,
    },
    {
      binding: {
        kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
        nodeId: accentNodeId,
        property: 'fill',
      },
      defaultValue: family === 'editorial' ? '#d97706' : '#2563eb',
      id: 'accent',
      label: { fallback: 'Accent' },
      type: VideoAnnotationControlType.COLOR,
    },
  ];
}
