import { expect, it, vi } from 'vitest';
import { applyResolvedPickerColorChange } from './picker-change';

it('forwards resolved picker draft colors to the external change handler', () => {
  const onColorChange = vi.fn();

  applyResolvedPickerColorChange({
    onColorChange,
    resolvedColor: '#abcdef',
  });

  expect(onColorChange).toHaveBeenCalledWith('#abcdef');
});

it('skips forwarding when the picker draft did not resolve to a color', () => {
  const onColorChange = vi.fn();

  applyResolvedPickerColorChange({
    onColorChange,
    resolvedColor: null,
  });

  expect(onColorChange).not.toHaveBeenCalled();
});
