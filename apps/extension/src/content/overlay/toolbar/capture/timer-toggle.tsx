import React from 'react';

import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { toggleToolbarMenu } from '../menu/toggle';

export function ToolbarTimerToggle(props: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  showTimerMenu: boolean;
  timerDelay: number;
  closeMenus: (except?: 'capture' | 'timer' | 'viewport' | null) => void;
  setShowTimerMenu: (next: boolean) => void;
}) {
  const { buttonRef, showTimerMenu, timerDelay, closeMenus, setShowTimerMenu } = props;

  return (
    <ContentToolbarButton
      ref={buttonRef as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleToolbarMenu(showTimerMenu, 'timer', closeMenus, setShowTimerMenu);
      }}
      active={timerDelay > 0}
      className="sniptale-timer-btn"
      dataUi="content.toolbar.timer-button"
      menuIndicator
      title={translate('content.toolbar.screenshotDelayTooltip')}
      data-menu-open={showTimerMenu ? 'true' : 'false'}
    >
      {timerDelay > 0 ? (
        <span className="sniptale-timer-badge">
          {timerDelay}
          {translate('content.toolbar.timerBadgeSuffix')}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
    </ContentToolbarButton>
  );
}
