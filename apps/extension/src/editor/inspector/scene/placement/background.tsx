import { SegmentedRow } from '../../../../ui/compact-inspector-controls';
import { isFrameBackgroundNone } from '../background/settings';
import { translate } from '../../../../platform/i18n';
import type { EditorInspectorFramePanelProps } from '../types';

type BackgroundModeProps = Pick<
  EditorInspectorFramePanelProps,
  'frameDraft' | 'lastFillModeRef' | 'setBackgroundMode'
>;

export function EditorInspectorFrameBackgroundModeControl(props: BackgroundModeProps) {
  return (
    <div data-ui="editor.frame.background-mode" className="editor-background-kinds">
      <SegmentedRow
        columns={4}
        ariaLabel={translate('editor.scene.backgroundTypeSection')}
        value={isFrameBackgroundNone(props.frameDraft) ? 'none' : props.frameDraft.backgroundMode}
        onChange={props.setBackgroundMode}
        options={[
          { value: 'none', label: translate('editor.scene.backgroundNone') },
          { value: 'color', label: translate('editor.compact.frameBackgroundModeColor') },
          { value: 'gradient', label: translate('editor.compact.frameBackgroundModeGradient') },
          { value: 'image', label: translate('editor.compact.frameBackgroundModeImage') },
        ]}
      />
    </div>
  );
}
