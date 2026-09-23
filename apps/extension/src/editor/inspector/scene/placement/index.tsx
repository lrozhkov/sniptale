import { translate } from '../../../../platform/i18n';
import type { EditorInspectorFramePanelProps } from '../types';
import { PanelSection } from '../shared';
import { EditorInspectorSelectInput } from '../../grouped';
import type { ReactNode } from 'react';

export function EditorInspectorFramePlacementSection(
  props: Pick<
    EditorInspectorFramePanelProps,
    'frameDraft' | 'frameLayoutModeOptions' | 'setLayoutMode'
  > & { children?: ReactNode; hideHeader?: boolean }
) {
  return (
    <PanelSection
      label={translate('editor.scene.placementSection')}
      {...(props.hideHeader === undefined ? {} : { hideHeader: props.hideHeader })}
    >
      <div className="space-y-3">
        <EditorInspectorSelectInput
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
