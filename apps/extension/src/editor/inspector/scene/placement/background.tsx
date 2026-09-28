import { translate } from '../../../../platform/i18n';
import { SegmentedRow } from '../../../../ui/compact-inspector-controls';
import type { EditorInspectorFramePanelProps } from '../types';

type BackgroundModeProps = Pick<
  EditorInspectorFramePanelProps,
  'frameDraft' | 'lastFillModeRef' | 'setBackgroundMode'
>;

export function EditorInspectorFrameBackgroundModeControl(props: BackgroundModeProps) {
  return (
    <SegmentedRow
      columns={3}
      ariaLabel={translate('editor.scene.backgroundTypeSection')}
      options={[
        { value: 'color', label: translate('editor.compact.frameBackgroundModeColor') },
        { value: 'gradient', label: translate('editor.compact.frameBackgroundModeGradient') },
        { value: 'image', label: translate('editor.compact.frameBackgroundModeImage') },
      ]}
      value={props.frameDraft.backgroundMode}
      onChange={props.setBackgroundMode}
    />
  );
}
