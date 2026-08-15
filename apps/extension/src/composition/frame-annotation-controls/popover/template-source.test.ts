import { expect, it, vi } from 'vitest';

import { createTemplateSourceAction } from './template-source';

const copy = {
  forcedDescription: 'Switch to default',
  forcedLabel: 'Use default',
  frameDescription: 'Switch to frame',
  frameLabel: 'Use frame',
};

it('labels the template source button with the action it will perform', () => {
  const onChange = vi.fn();

  const useFrame = createTemplateSourceAction({ onChange, value: 'forced' }, copy);
  expect(useFrame).toMatchObject({ description: 'Switch to frame', label: 'Use frame' });
  useFrame.onClick();
  expect(onChange).toHaveBeenLastCalledWith('frame-default');

  const useDefault = createTemplateSourceAction({ onChange, value: 'frame-default' }, copy);
  expect(useDefault).toMatchObject({ description: 'Switch to default', label: 'Use default' });
  useDefault.onClick();
  expect(onChange).toHaveBeenLastCalledWith('forced');
});
