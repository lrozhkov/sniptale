import { describe, expect, it } from 'vitest';

import { getQuickActionRowStateClassName } from './state-class';

describe('quick actions list row state-class', () => {
  it('adds drag and disabled state classes for the active row', () => {
    const className = getQuickActionRowStateClassName({
      action: { id: 'action-1', status: false } as never,
      draggedId: 'action-1',
      dragOverId: 'action-1',
    });

    expect(className).toContain('opacity-50');
    expect(className).toContain('scale-[0.98]');
    expect(className).toContain('border-t-2');
  });
});
