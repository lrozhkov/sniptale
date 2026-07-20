import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { propertyDefaultValue, propertyModified, propertyValue } from '../value-editing/values';

export function changedSummary(count: number): string {
  if (count > 0) {
    return `${count} ${translate('content.pageStyleInspector.changedSummarySuffix')}`;
  }

  return translate('content.pageStyleInspector.computedSummary');
}

export function countModified(
  state: PageStyleInspectorViewState,
  properties: readonly PageStyleProperty[]
): number {
  const modified = new Set(state.modifiedProperties);
  return properties.filter((property) => modified.has(property)).length;
}

export function fieldState(
  state: PageStyleInspectorViewState,
  actions: PageStyleInspectorActions,
  property: Parameters<PageStyleInspectorActions['resetValue']>[0]
) {
  return {
    defaultValue: propertyDefaultValue(state, property),
    modified: propertyModified(state, property),
    onReset: () => actions.resetValue(property),
    value: propertyValue(state, property),
  };
}
