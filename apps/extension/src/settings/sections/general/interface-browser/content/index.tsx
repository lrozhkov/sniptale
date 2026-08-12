import {
  settingsCompactWorkbenchClassName,
  settingsSectionClassName,
} from '../../../../section-surface';

import type { AppearanceSectionState } from './types';
import { AppearanceControlsCard } from './controls-card';

export function AppearanceSectionContent({ state }: { state: AppearanceSectionState }) {
  return (
    <section className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName}`}>
      <AppearanceControlsCard state={state} />
    </section>
  );
}
