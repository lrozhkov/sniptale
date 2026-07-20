import { settingsSectionClassName } from '../../../section-surface';

import type { AppearanceSectionState } from './types';
import { AppearanceControlsCard } from './controls-card';
import { AppearanceSectionHeader } from './section-header';

export function AppearanceSectionContent({ state }: { state: AppearanceSectionState }) {
  return (
    <section className={settingsSectionClassName}>
      <AppearanceSectionHeader locale={state.locale} />
      <AppearanceControlsCard state={state} />
    </section>
  );
}
