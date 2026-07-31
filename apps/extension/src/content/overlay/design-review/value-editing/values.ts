import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type { DesignReviewViewState } from '../types';
import { isInspectorValueModified } from './state';

export function propertyValue(state: DesignReviewViewState, property: PageStyleProperty): string {
  return state.values[property] ?? '';
}

export function propertyDefaultValue(
  state: DesignReviewViewState,
  property: PageStyleProperty
): string {
  return state.defaultValues[property] ?? '';
}

export function propertyModified(
  state: DesignReviewViewState,
  property: PageStyleProperty
): boolean {
  return isInspectorValueModified({
    defaultValues: state.defaultValues,
    property,
    values: state.values,
  });
}
