import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleInspectorViewState } from '../types';
import { isInspectorValueModified } from './state';

export function propertyValue(
  state: PageStyleInspectorViewState,
  property: PageStyleProperty
): string {
  return state.values[property] ?? '';
}

export function propertyDefaultValue(
  state: PageStyleInspectorViewState,
  property: PageStyleProperty
): string {
  return state.defaultValues[property] ?? '';
}

export function propertyModified(
  state: PageStyleInspectorViewState,
  property: PageStyleProperty
): boolean {
  return isInspectorValueModified({
    defaultValues: state.defaultValues,
    property,
    values: state.values,
  });
}
