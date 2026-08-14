import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import type { EditorInspectorFramePanelProps } from '../types';
import { PanelSection } from '../shared';
import type { ReactNode } from 'react';

export function EditorInspectorFramePlacementSection(
  props: Pick<
    EditorInspectorFramePanelProps,
    'frameDraft' | 'frameLayoutModeOptions' | 'setLayoutMode'
  > & { children?: ReactNode }
) {
  return (
    <PanelSection label={translate('editor.scene.placementSection')}>
      <div className="space-y-3">
        <SelectField
          label={translate('editor.scene.placementSection')}
          value={props.frameDraft.layoutMode}
          options={props.frameLayoutModeOptions}
          onChange={props.setLayoutMode}
        />
        {props.children}
      </div>
    </PanelSection>
  );
}
