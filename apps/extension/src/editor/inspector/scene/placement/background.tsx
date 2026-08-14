import { translate } from '../../../../platform/i18n';
import { PanelSection } from '../shared';
import type { EditorInspectorFramePanelProps } from '../types';
import type { ReactNode } from 'react';

import { EditorInspectorFrameModeButtons } from './modes';

export function EditorInspectorFrameBackgroundSection(
  props: Pick<
    EditorInspectorFramePanelProps,
    'frameBackgroundModeOptions' | 'frameDraft' | 'setBackgroundMode'
  > & { children?: ReactNode }
) {
  return (
    <PanelSection label={translate('editor.scene.backgroundTypeSection')}>
      <EditorInspectorFrameModeButtons
        ariaLabel={translate('editor.scene.backgroundTypeSection')}
        options={props.frameBackgroundModeOptions}
        value={props.frameDraft.backgroundMode}
        onChange={props.setBackgroundMode}
      />
      {props.children ? <div className="mt-3 space-y-3">{props.children}</div> : null}
    </PanelSection>
  );
}
