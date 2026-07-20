import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import type { EditorInspectorFramePanelProps } from '../types';

export function EditorInspectorFramePlacementSection(
  props: Pick<
    EditorInspectorFramePanelProps,
    'frameDraft' | 'frameLayoutModeOptions' | 'setLayoutMode'
  >
) {
  return (
    <SelectField
      label={translate('editor.scene.placementSection')}
      value={props.frameDraft.layoutMode}
      options={props.frameLayoutModeOptions}
      onChange={props.setLayoutMode}
    />
  );
}
