import { translate } from '../../platform/i18n';

export function createFrameAnnotationLayerLabel(index: number): string {
  return `${translate('editor.tools.frameAnnotation')} ${index}`;
}
