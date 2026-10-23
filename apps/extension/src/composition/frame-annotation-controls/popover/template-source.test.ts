import { expect, it, vi } from 'vitest';

import { createTemplateSourceHeaderControl } from './template-source';

const copy = {
  forcedDescription: 'Switch to default',
  forcedLabel: 'Default',
  frameDescription: 'Switch to frame',
  frameLabel: 'Frame',
};

it('exposes both template sources and preserves the accepted source', () => {
  const onChange = vi.fn();

  const control = createTemplateSourceHeaderControl({ onChange, value: 'forced' }, copy);
  expect(control.value).toBe('forced');
  expect(control.options).toEqual([
    { value: 'frame-default', description: 'Switch to frame', label: 'Frame' },
    { value: 'forced', description: 'Switch to default', label: 'Default' },
  ]);
  control.onChange('frame-default');
  expect(onChange).toHaveBeenLastCalledWith('frame-default');

  const fromFrame = createTemplateSourceHeaderControl({ onChange, value: 'frame-default' }, copy);
  expect(fromFrame.value).toBe('frame-default');
  fromFrame.onChange('forced');
  expect(onChange).toHaveBeenLastCalledWith('forced');
});
