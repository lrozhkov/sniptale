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
        <PreviewFloatingControl
          ariaLabel={inspectorLabel}
          onClick={(event) => {
            const surface = event.currentTarget.closest('[data-ui="gallery.preview.surface"]');
            const keyboard = event.detail === 0;
            props.onInspectorToggle();
            if (!keyboard || !surface) return;
            const nextLabel = translate(
              props.inspectorCollapsed
                ? 'gallery.preview.hideInspector'
                : 'gallery.preview.showInspector'
            );
            queueMicrotask(() => {
              if (!surface.isConnected) return;
              Array.from(surface.querySelectorAll<HTMLButtonElement>('button'))
                .find((button) => button.getAttribute('aria-label') === nextLabel)
                ?.focus();
            });
          }}
        >
          {props.inspectorCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </PreviewFloatingControl>
      ) : null}
      <PreviewFloatingControl ariaLabel={translate('common.actions.close')} onClick={props.onClose}>
        <X className="h-4 w-4" />
      </PreviewFloatingControl>
    </>
  );
}
