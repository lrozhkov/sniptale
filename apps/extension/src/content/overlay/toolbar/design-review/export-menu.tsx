import React, { useCallback, useRef, useState } from 'react';
import { Archive, Copy, Download, Settings2 } from 'lucide-react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../platform/i18n';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import type { ToolbarMenuState } from '../state/menu';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import {
  preventToolbarMenuClick,
  resolveToolbarDropdownState,
  ToolbarMenuDropdown,
} from '../menu/dropdown';
import { getToolbarMenuPosition } from '../menu/position';
import {
  executeToolbarAnnotationExportAction,
  type ToolbarAnnotationExportAction,
} from './export-actions';

type AnnotationExportMenuProps = {
  compactMenus: boolean;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  toolbarMenuState: ToolbarMenuState;
};

const ANNOTATION_EXPORT_OPTIONS: Array<{
  action: Extract<ToolbarAnnotationExportAction, 'copy' | 'download'>;
  hintKey: 'annotationExportCopyHint' | 'annotationExportDownloadHint';
  labelKey: 'annotationExportCopyLabel' | 'annotationExportDownloadLabel';
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
    getMenuPosition: (ref, height = 230) => getToolbarMenuPosition(ref.current, height),
    menuHeight: 230,
    menuWidth: 280,
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
        <div className="flex items-stretch gap-1" role="group">
          <ProductToolbarMenuItem
            className="min-w-0 flex-1"
            dataUi="content.toolbar.annotation-export.export-page"
            disabled={props.busyAction !== null}
            onClick={(event) => props.onSelect('export-page', event)}
            onMouseDown={preventToolbarMenuClick}
          >
            <Archive aria-hidden="true" className="sniptale-popover-icon" />
            <ProductToolbarMenuItemCopy
              hint={translate('content.toolbar.annotationExportOpenHint')}
              label={translate('content.toolbar.annotationExportOpenLabel')}
            />
          </ProductToolbarMenuItem>
          <button
            type="button"
            className="sniptale-btn shrink-0"
            data-ui="content.toolbar.annotation-export.configure-export"
            disabled={props.busyAction !== null}
            aria-label={translate('content.toolbar.annotationExportConfigureLabel')}
            title={translate('content.toolbar.annotationExportConfigureHint')}
            style={{ alignSelf: 'stretch', height: 'auto', minWidth: 38, padding: 0 }}
            onClick={(event) => props.onSelect('configure-export', event)}
            onMouseDown={preventToolbarMenuClick}
          >
            <Settings2 aria-hidden="true" size={16} />
          </button>
        </div>
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}

function getSuccessMessage(action: ToolbarAnnotationExportAction): string {
  if (action === 'copy') return translate('content.toolbar.annotationExportCopySuccess');
  if (action === 'download') return translate('content.toolbar.annotationExportDownloadSuccess');
  if (action === 'export-page') return translate('content.toolbar.annotationExportPageSuccess');
  return translate('content.toolbar.annotationExportOpenSuccess');
}

function getErrorMessage(action: ToolbarAnnotationExportAction): string {
  if (action === 'copy') return translate('content.toolbar.annotationExportCopyError');
  if (action === 'download') return translate('content.toolbar.annotationExportDownloadError');
  if (action === 'export-page') return translate('content.toolbar.annotationExportPageError');
  return translate('content.toolbar.annotationExportOpenError');
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
  const closeMenuAfterAction = useCallback(() => {
    props.toolbarMenuState.closeMenu('annotations-export');
    queueMicrotask(() => triggerRef.current?.blur());
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
        showToast(getErrorMessage(action), 'error');
        return;
      }

      setBusyAction(action);
      void executeToolbarAnnotationExportAction(action, contentIntentSource)
        .then(() => {
          showToast(getSuccessMessage(action), 'success');
          closeMenuAfterAction();
        })
        .catch(() => {
          showToast(getErrorMessage(action), 'error');
        })
        .finally(() => {
          setBusyAction(null);
        });
    },
    [busyAction, closeMenuAfterAction]
  );

  return (
    <div className="relative" data-ui="content.toolbar.annotation-export">
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        data-menu-open={open ? 'true' : 'false'}
        dataUi="content.toolbar.annotation-export-button"
        disabled={props.disabled}
        menuIndicator
        onClick={(event) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu('annotations-export');
        }}
        title={translate('content.toolbar.annotationExportMenuTitle')}
      >
        <Archive size={20} strokeWidth={2} />
      </ContentToolbarButton>
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
