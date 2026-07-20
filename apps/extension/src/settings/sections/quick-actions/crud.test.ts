import { describe, expect, it } from 'vitest';
import {
  beginEditQuickAction,
  beginNewQuickAction,
  createQuickActionsCrud,
  deleteQuickAction,
  persistQuickActions,
  reorderAndSaveQuickActions,
  saveEditedQuickAction,
  toggleQuickActionStatus,
  updateQuickActionField,
} from './crud';

describe('quick actions crud facade', () => {
  it('re-exports the owner-local CRUD helpers', () => {
    expect(beginEditQuickAction).toBeTypeOf('function');
    expect(beginNewQuickAction).toBeTypeOf('function');
    expect(createQuickActionsCrud).toBeTypeOf('function');
    expect(deleteQuickAction).toBeTypeOf('function');
    expect(persistQuickActions).toBeTypeOf('function');
    expect(reorderAndSaveQuickActions).toBeTypeOf('function');
    expect(saveEditedQuickAction).toBeTypeOf('function');
    expect(toggleQuickActionStatus).toBeTypeOf('function');
    expect(updateQuickActionField).toBeTypeOf('function');
  });
});
