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
      <SegmentedRow<'none' | 'color' | 'image'>
        columns={3}
        ariaLabel={translate('editor.scene.backgroundTypeSection')}
        value={
          isFrameBackgroundNone(props.frameDraft)
            ? 'none'
            : props.frameDraft.backgroundMode === 'image'
              ? 'image'
              : 'color'
        }
        onChange={(mode) =>
          props.setBackgroundMode(mode === 'color' ? props.lastFillModeRef.current : mode)
        }
        options={[
          { value: 'none', label: translate('editor.scene.backgroundNone') },
          { value: 'color', label: translate('editor.compact.frameBackgroundModeColor') },
          { value: 'image', label: translate('editor.compact.frameBackgroundModeImage') },
        ]}
      />
    </div>
  );
}
