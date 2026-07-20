import type { AppLocale } from '../../../../platform/i18n';
import { useDesignSystemPageDerivedState } from '../derived-state';
import { useDesignSystemPageExplorerState } from '../explorer-state';
import { useDesignSystemPageFilters } from '../filters';
import type { DesignSystemPageState } from './types';

export type { DesignSystemPageState } from './types';

export function useDesignSystemPageState(locale: AppLocale): DesignSystemPageState {
  const filters = useDesignSystemPageFilters();
  const derived = useDesignSystemPageDerivedState(locale, filters);
  const explorer = useDesignSystemPageExplorerState(derived.filteredEntries);

  return {
    ...filters,
    ...derived,
    ...explorer,
  };
}
