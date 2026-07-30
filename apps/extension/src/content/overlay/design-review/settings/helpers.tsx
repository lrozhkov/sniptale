import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { propertyDefaultValue, propertyModified, propertyValue } from '../value-editing/values';

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
