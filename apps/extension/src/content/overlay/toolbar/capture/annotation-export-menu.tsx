import React, { useCallback, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, FileOutput } from 'lucide-react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import type { ToolbarMenuState } from '../state/menu';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import {
  preventToolbarMenuClick,
  resolveToolbarDropdownState,
  ToolbarMenuDropdown,
} from './dropdown.shared';
import {
  executeToolbarAnnotationExportAction,
  type ToolbarAnnotationExportAction,
} from './annotation-export-actions';

type AnnotationExportMenuProps = {
  compactMenus: boolean;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  toolbarMenuState: ToolbarMenuState;
};

const ANNOTATION_EXPORT_OPTIONS: Array<{
  action: ToolbarAnnotationExportAction;
  hintKey: 'annotationExportCopyHint' | 'annotationExportDownloadHint' | 'annotationExportOpenHint';
  labelKey:
    | 'annotationExportCopyLabel'
    | 'annotationExportDownloadLabel'
    | 'annotationExportOpenLabel';
  icon: typeof Copy;
}> = [
  {
    action: 'download',
    hintKey: 'annotationExportDownloadHint',
    icon: Download,
    labelKey: 'annotationExportDownloadLabel',
  },
  {
    action: 'copy',
    hintKey: 'annotationExportCopyHint',
    icon: Copy,
    labelKey: 'annotationExportCopyLabel',
  },
  {
    action: 'open-export',
    hintKey: 'annotationExportOpenHint',
    icon: ExternalLink,
    labelKey: 'annotationExportOpenLabel',
  },
];

function AnnotationExportDropdown(
  props: AnnotationExportMenuProps & {
    busyAction: ToolbarAnnotationExportAction | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onSelect: (
      action: ToolbarAnnotationExportAction,
      event: React.MouseEvent<HTMLButtonElement>
    ) => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }
) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.triggerRef,
    displayMode: props.displayMode,
    getMenuPosition: (ref, height = 230) => {
      const rect = ref.current?.getBoundingClientRect();
      return rect &&
        window.innerHeight - rect.bottom < height &&
        rect.top > window.innerHeight - rect.bottom
        ? 'up'
        : 'down';
    },
    menuHeight: 230,
    menuWidth: 300,
    preferredAlign: 'end',
  });
  if (!style) return null;

  return (
    <ToolbarMenuDropdown dataUi="content.toolbar.annotation-export-menu" menuRef={props.menuRef}>
      <ProductToolbarMenu
        compact={props.compactMenus}
        placement={menuPlacement}
        style={style}
        title={translate('content.toolbar.annotationExportMenuTitle')}
        variant="capture"
      >
        {ANNOTATION_EXPORT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <ProductToolbarMenuItem
              key={option.action}
              dataUi={`content.toolbar.annotation-export.${option.action}`}
              disabled={props.busyAction !== null}
              onClick={(event) => props.onSelect(option.action, event)}
              onMouseDown={preventToolbarMenuClick}
            >
              <Icon aria-hidden="true" className="sniptale-popover-icon" />
              <ProductToolbarMenuItemCopy
                hint={translate(`content.toolbar.${option.hintKey}`)}
                label={translate(`content.toolbar.${option.labelKey}`)}
              />
            </ProductToolbarMenuItem>
          );
        })}
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}

function getSuccessMessage(action: ToolbarAnnotationExportAction): string {
  if (action === 'copy') return translate('content.toolbar.annotationExportCopySuccess');
  if (action === 'download') return translate('content.toolbar.annotationExportDownloadSuccess');
  return translate('content.toolbar.annotationExportOpenSuccess');
}

export function AnnotationExportMenu(props: AnnotationExportMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busyAction, setBusyAction] = useState<ToolbarAnnotationExportAction | null>(null);
  const open = props.toolbarMenuState.activeMenuType === 'annotations-export';
  const closeMenu = useCallback(() => {
    props.toolbarMenuState.closeMenu('annotations-export');
    queueMicrotask(() => triggerRef.current?.focus());
  }, [props.toolbarMenuState]);
  const closeMenuWithoutFocus = useCallback(() => {
    props.toolbarMenuState.closeMenu('annotations-export');
  }, [props.toolbarMenuState]);

  useToolbarFloatingMenuDismissal({
    closeOnFarPointer: true,
    menuRef,
    onClose: closeMenu,
    onFarPointerClose: closeMenuWithoutFocus,
    open,
    triggerRef,
  });

  const handleSelect = useCallback(
    (action: ToolbarAnnotationExportAction, event: React.MouseEvent<HTMLButtonElement>) => {
      preventToolbarMenuClick(event);
      if (busyAction !== null) return;

      const contentIntentSource = createTrustedContentActionIntentSource(event.nativeEvent);
      if (!contentIntentSource) {
        showToast(translate('content.toolbar.annotationExportActionError'), 'error');
        return;
      }

      setBusyAction(action);
      void executeToolbarAnnotationExportAction(action, contentIntentSource)
        .then(() => {
          showToast(getSuccessMessage(action), 'success');
          closeMenu();
        })
        .catch(() => {
          showToast(translate('content.toolbar.annotationExportActionError'), 'error');
        })
        .finally(() => {
          setBusyAction(null);
        });
    },
    [busyAction, closeMenu]
  );

  return (
    <div>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        className="sniptale-btn"
        data-menu-open={open ? 'true' : 'false'}
        data-ui="content.toolbar.annotation-export-button"
        disabled={props.disabled}
        onClick={(event) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu('annotations-export');
        }}
        title={translate('content.toolbar.annotationExportMenuTitle')}
      >
        <FileOutput size={20} strokeWidth={2} />
      </button>
      {open ? (
        <AnnotationExportDropdown
          {...props}
          busyAction={busyAction}
          menuRef={menuRef}
          onSelect={handleSelect}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}
