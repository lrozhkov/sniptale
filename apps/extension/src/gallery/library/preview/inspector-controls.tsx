import { PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { PreviewFloatingControl } from '../../../composition/library-preview/preview-floating-control';
import type { PreviewPanelProps } from './types';

export function PreviewInspectorControls(
  props: Pick<
    PreviewPanelProps,
    'inspectorCollapsed' | 'onClose' | 'onInspectorToggle' | 'trashMode'
  >
) {
  const inspectorLabel = props.inspectorCollapsed
    ? translate('gallery.preview.showInspector')
    : translate('gallery.preview.hideInspector');

  return (
    <>
      {!props.trashMode ? (
        <PreviewFloatingControl ariaLabel={inspectorLabel} onClick={props.onInspectorToggle}>
          {props.inspectorCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </PreviewFloatingControl>
      ) : null}
      <PreviewFloatingControl
        dismiss
        ariaLabel={translate('common.actions.close')}
        onClick={props.onClose}
      >
        <X className="h-4 w-4" />
      </PreviewFloatingControl>
    </>
  );
}
