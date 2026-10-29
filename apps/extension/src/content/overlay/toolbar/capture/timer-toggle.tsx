import React from 'react';
import { Clock4 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton, ContentToolbarDelayIndicator } from '@sniptale/ui/content-toolbar';
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
      tone="property"
      ref={buttonRef as React.Ref<HTMLButtonElement>}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggleToolbarMenu(showTimerMenu, 'timer', closeMenus, setShowTimerMenu);
      }}
      active={timerDelay > 0}
      className="sniptale-timer-btn"
      dataUi="content.toolbar.timer-button"
      menuIndicator={timerDelay === 0}
      title={translate('content.toolbar.screenshotDelayTooltip')}
      data-menu-open={showTimerMenu ? 'true' : 'false'}
      aria-haspopup="menu"
      aria-expanded={showTimerMenu}
    >
      <ContentToolbarDelayIndicator value={timerDelay} dataUi="content.toolbar.timer-value">
        <Clock4 size={18} />
      </ContentToolbarDelayIndicator>
    </ContentToolbarButton>
  );
}
