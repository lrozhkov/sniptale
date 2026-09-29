import {
  settingsCompactWorkbenchClassName,
  settingsSectionClassName,
  SettingsSubpageTabs,
} from '../../../../section-surface';
import { translate } from '../../../../../platform/i18n';

import type { AppearanceSectionState } from './types';
import { AppearanceControlsCard } from './controls-card';
import { ContextMenuControls } from './context-menu-controls';
import { useAppearanceViewFocus } from './view-focus';

export function AppearanceSectionContent(props: {
  onViewChange?: (view: string) => void;
  state: AppearanceSectionState;
  view?: string;
}) {
  const { state } = props;
  const view = props.view === 'context-menu' ? 'context-menu' : 'interface';
  const { navigationRef, interfaceRef, contextMenuRef } = useAppearanceViewFocus(view);
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        navRef={navigationRef}
        activeId={view}
        ariaLabel={translate('settings.navigation.interfaceBrowser', state.locale)}
        items={[
          {
            id: 'interface',
            label: translate('settings.navigation.views.interface', state.locale),
          },
          {
            id: 'context-menu',
            label: translate('settings.navigation.views.contextMenu', state.locale),
          },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'interface' ? (
        <section
          ref={interfaceRef}
          className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName}`}
        >
          <AppearanceControlsCard state={state} />
        </section>
      ) : null}
      <section
        ref={contextMenuRef}
        hidden={view !== 'context-menu'}
        className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName}`}
      >
        <ContextMenuControls state={state} visible={view === 'context-menu'} />
      </section>
    </div>
  );
}
