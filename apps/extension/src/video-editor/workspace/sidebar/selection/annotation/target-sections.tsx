import { translate } from '../../../../../platform/i18n';
import { resolveAnnotationTemplateControls } from '../../../../../features/video/project/annotation/template-controls';
import { getAnnotationTargetKindOptions } from './options';
import { renderTargetDecorFields } from './target/decor-fields';
import { renderPointOrRectFields } from './target/fields';
import type { AnnotationTargetControlsProps } from './target/props';
import { OptionButtonsField } from '../shared/option-buttons';

export function renderAnnotationTargetFields(props: AnnotationTargetControlsProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);
  if (!controls.supportsTarget) {
    return null;
  }

  return (
    <>
      <OptionButtonsField
        label={translate('videoEditor.sidebar.annotationTargetLabel')}
        value={props.clip.target}
        disabled={props.disabled}
        onChange={(value) => props.onUpdateAnnotationClipTemplate(props.clip.id, { target: value })}
        options={getAnnotationTargetKindOptions()}
      />
      {renderPointOrRectFields(props)}
      {renderTargetDecorFields(props)}
    </>
  );
}
