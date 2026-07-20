import type { AnnotationTargetControlsProps } from './target/props';
import { renderAnnotationTargetFields } from './target-sections';

export function AnnotationTargetControls(props: AnnotationTargetControlsProps) {
  return renderAnnotationTargetFields(props);
}
