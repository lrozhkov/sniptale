import { describe, expect, it } from 'vitest';
import {
  buildTemplateListDerivedState,
  useTemplateDeleteActions,
  useTemplateListDerivedState,
  useTemplateMenuDismiss,
  useTemplateOrderState,
} from './hooks';
import * as deleteActions from './delete';
import * as derivedState from './derived';
import * as orderState from './order';

describe('template-list state hooks', () => {
  it('re-exports the canonical order, derived, and delete owners', () => {
    expect(useTemplateOrderState).toBe(orderState.useTemplateOrderState);
    expect(useTemplateMenuDismiss).toBe(orderState.useTemplateMenuDismiss);
    expect(buildTemplateListDerivedState).toBe(derivedState.buildTemplateListDerivedState);
    expect(useTemplateListDerivedState).toBe(derivedState.useTemplateListDerivedState);
    expect(useTemplateDeleteActions).toBe(deleteActions.useTemplateDeleteActions);
  });
});
