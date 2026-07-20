import { translate } from '../../../../platform/i18n';
import { PanelSection } from '../shared';
import type { EditorInspectorFramePanelProps } from '../types';

import { EditorInspectorFrameModeButtons } from './modes';

export function EditorInspectorFrameBackgroundSection(
  props: Pick<
    EditorInspectorFramePanelProps,
    'frameBackgroundModeOptions' | 'frameDraft' | 'setBackgroundMode'
  >
) {
  return (
    <PanelSection label={translate('editor.scene.backgroundTypeSection')}>
      <EditorInspectorFrameModeButtons
        ariaLabel={translate('editor.scene.backgroundTypeSection')}
        options={props.frameBackgroundModeOptions}
        value={props.frameDraft.backgroundMode}
        onChange={props.setBackgroundMode}
      />
    </PanelSection>
  );
}
