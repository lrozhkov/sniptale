import { translate } from '../../../../platform/i18n';
import React from 'react';
import { toggleToolbarMenu } from '../menu/toggle';

export function ToolbarCaptureActionToggle(props: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  showCaptureMenu: boolean;
  closeMenus: (except?: 'capture' | 'timer' | 'viewport' | null) => void;
  setShowCaptureMenu: (next: boolean) => void;
  getCaptureActionIcon: () => React.ReactNode;
}) {
  const { buttonRef, showCaptureMenu, closeMenus, setShowCaptureMenu, getCaptureActionIcon } =
    props;

  return (
    <button
      ref={buttonRef as React.Ref<HTMLButtonElement>}
      onClick={(event) => {
        event.stopPropagation();
        toggleToolbarMenu(showCaptureMenu, 'capture', closeMenus, setShowCaptureMenu);
      }}
      className="sniptale-btn sniptale-toggle"
      data-ui="content.toolbar.capture-action-button"
      data-active="true"
      data-menu-indicator="true"
      title={translate('content.toolbar.afterCaptureTitle')}
      data-menu-open={showCaptureMenu ? 'true' : 'false'}
    >
      {getCaptureActionIcon()}
    </button>
  );
}
