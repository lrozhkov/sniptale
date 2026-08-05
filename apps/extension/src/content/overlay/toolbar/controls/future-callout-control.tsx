import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { MessageSquareText } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ToolbarFutureFrameCalloutActions, ToolbarFutureFrameStyle } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { FutureCalloutSettingsPopover } from './future-callout';

export function FutureCalloutControl(props: {
  actions: ToolbarFutureFrameCalloutActions;
  menu: ToolbarMenuState;
  setStyle: Dispatch<SetStateAction<ToolbarFutureFrameStyle>>;
  style: ToolbarFutureFrameStyle;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const settings = props.style.futureCallout;
  const update = (next: CalloutSettings | null) => {
    props.setStyle((current) => ({ ...current, futureCallout: next }));
    props.actions.set(next);
  };
  return (
    <>
      <ContentToolbarButton
        ref={buttonRef}
        active={settings != null}
        aria-expanded={props.menu.activeMenuType === 'future-callout'}
        aria-pressed={settings != null}
        dataUi="content.toolbar.future-frame-callout"
        menuIndicator
        onClick={(event) => {
          event.stopPropagation();
          if (settings == null) {
            update(props.actions.enable());
            props.menu.setActiveMenuType('future-callout');
          } else {
            props.menu.toggleMenu('future-callout');
          }
        }}
        title={translate('content.callout.settingsTitle')}
      >
        <MessageSquareText size={18} />
      </ContentToolbarButton>
      {settings ? (
        <FutureCalloutSettingsPopover
          anchorEl={buttonRef.current}
          isOpen={props.menu.activeMenuType === 'future-callout'}
          onChange={update}
          onClose={() => props.menu.closeMenu('future-callout')}
          onDisable={() => {
            update(null);
            props.menu.closeMenu('future-callout');
          }}
          settings={settings}
        />
      ) : null}
    </>
  );
}
