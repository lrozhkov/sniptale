import { describe, expect, it, vi } from 'vitest';
import { selectOrClosePopoverPreset } from './preset-selection';

describe('selectOrClosePopoverPreset', () => {
  it('closes without reapplying an active preset', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const preset = { id: 'active' };

    selectOrClosePopoverPreset({ isActive: true, onApply, onClose, preset });

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies a different preset without closing the menu', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const preset = { id: 'next' };

    selectOrClosePopoverPreset({ isActive: false, onApply, onClose, preset });

    expect(onApply).toHaveBeenCalledWith(preset);
    expect(onClose).not.toHaveBeenCalled();
  });
});
