import { SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID } from '../legacy';
import {
  type VideoAnnotationTemplateControlValues,
  type VideoAnnotationTemplateRef,
} from '../types';
import { createLegacyAnnotationControls } from '../legacy-controls';

type BuiltInFamily = 'editorial' | 'technical';

export function createBuiltInAnnotationControlValues(
  templateRef: VideoAnnotationTemplateRef
): VideoAnnotationTemplateControlValues {
  const family =
    templateRef.packId === SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID ? 'technical' : 'editorial';

  return Object.fromEntries(
    createBuiltInControls(family).map((control) => [control.id, control.defaultValue])
  );
}

function createBuiltInControls(family: BuiltInFamily) {
  return createLegacyAnnotationControls({
    accentNodeId: family === 'technical' ? 'dot' : 'accent',
    family,
  });
}
