import { useMemo } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import type { DesignSystemUsageContext } from '../../catalog/registry/types';
import { DESIGN_SYSTEM_REGISTRY } from '../../catalog/registry';
import { localize } from '../../catalog/localization';

export function useDesignSystemUsageOptions(locale: AppLocale) {
  return useMemo(() => {
    const options = new Map<string, DesignSystemUsageContext>();

    for (const entry of DESIGN_SYSTEM_REGISTRY) {
      for (const usage of entry.usageContexts) {
        options.set(usage.usageId, usage);
      }
    }

    return [...options.values()].sort((left, right) =>
      localize(locale, left.labelRu, left.labelEn).localeCompare(
        localize(locale, right.labelRu, right.labelEn),
        locale
      )
    );
  }, [locale]);
}
