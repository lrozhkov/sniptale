import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { propertyDefaultValue, propertyModified, propertyValue } from '../value-editing/values';

export function changedSummary(count: number): string {
  if (count > 0) {
    return `${count} ${translate('content.designReview.changedSummarySuffix')}`;
  }

  return translate('content.designReview.computedSummary');
}

export function countModified(
  state: DesignReviewViewState,
  properties: readonly PageStyleProperty[]
): number {
  const modified = new Set(state.modifiedProperties);
  return properties.filter((property) => modified.has(property)).length;
}

export function fieldState(
  state: DesignReviewViewState,
  actions: DesignReviewActions,
  property: Parameters<DesignReviewActions['resetValue']>[0]
) {
  return {
    defaultValue: propertyDefaultValue(state, property),
    modified: propertyModified(state, property),
    onReset: () => actions.resetValue(property),
    value: propertyValue(state, property),
  };
}
