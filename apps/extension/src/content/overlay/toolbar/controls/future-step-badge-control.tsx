import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ListOrdered } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ToolbarFutureFrameStepBadgeActions, ToolbarFutureFrameStyle } from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { FutureStepBadgeSettingsPopover } from './future-step-badge';

export function FutureStepBadgeControl(props: {
  actions: ToolbarFutureFrameStepBadgeActions;
  menu: ToolbarMenuState;
  setStyle: Dispatch<SetStateAction<ToolbarFutureFrameStyle>>;
  style: ToolbarFutureFrameStyle;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const settings = props.style.futureStepBadge;
  const update = (next: StepBadgeSettings | null) => {
    props.setStyle((current) => ({ ...current, futureStepBadge: next }));
    props.actions.set(next);
  };
  return (
    <>
      <ContentToolbarButton
        ref={buttonRef}
        active={settings != null}
        aria-expanded={props.menu.activeMenuType === 'future-step-badge'}
        aria-pressed={settings != null}
        dataUi="content.toolbar.future-frame-step-badge"
        menuIndicator
        onClick={(event) => {
          event.stopPropagation();
          if (settings == null) {
            update(props.actions.enable());
            props.menu.setActiveMenuType('future-step-badge');
          } else {
            props.menu.toggleMenu('future-step-badge');
          }
        }}
        title={translate('content.stepBadge.settingsTitle')}
      >
        <ListOrdered size={18} />
      </ContentToolbarButton>
      {settings ? (
        <FutureStepBadgeSettingsPopover
          anchorEl={buttonRef.current}
          frameVisuals={{
            borderColor: props.style.borderSettings.color,
            borderWidth: props.style.borderSettings.width,
            fillColor: props.style.borderSettings.fillColor,
            fillOpacity: props.style.borderSettings.fillOpacity,
          }}
          isOpen={props.menu.activeMenuType === 'future-step-badge'}
          onChange={update}
          onClose={() => props.menu.closeMenu('future-step-badge')}
          onDisable={() => {
            update(null);
            props.menu.closeMenu('future-step-badge');
          }}
          settings={settings}
        />
      ) : null}
    </>
  );
}
