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
      columns={2}
      ariaLabel={translate('editor.scene.backgroundTypeSection')}
      options={[
        { value: 'fill', label: translate('editor.scene.backgroundFillMode') },
        { value: 'image', label: translate('editor.compact.frameBackgroundModeImage') },
      ]}
      value={props.frameDraft.backgroundMode === 'image' ? 'image' : 'fill'}
      onChange={(value) =>
        props.setBackgroundMode(value === 'image' ? 'image' : props.lastFillModeRef.current)
      }
    />
  );
}
