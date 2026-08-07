import { describe, expect, it, vi } from 'vitest';

import { createTemplateSourceAction } from './template-source';

const copy = {
  forcedDescription: 'Always use the selected template',
  forcedLabel: 'Selected',
  frameDescription: 'Use the template linked to the frame',
  frameLabel: 'From frame',
};

describe('createTemplateSourceAction', () => {
  it('describes the frame-linked mode and switches to the forced template', () => {
    const onChange = vi.fn();

    const action = createTemplateSourceAction({ onChange, value: 'frame-default' }, copy);

    expect(action).toMatchObject({
      description: copy.frameDescription,
      label: copy.frameLabel,
    });

    action.onClick();

    expect(onChange).toHaveBeenCalledWith('forced');
  });

  it('describes the forced mode and switches back to the frame default', () => {
    const onChange = vi.fn();

    const action = createTemplateSourceAction({ onChange, value: 'forced' }, copy);

    expect(action).toMatchObject({
      description: copy.forcedDescription,
      label: copy.forcedLabel,
    });

    action.onClick();

    expect(onChange).toHaveBeenCalledWith('frame-default');
  });
});
