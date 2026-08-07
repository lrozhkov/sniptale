import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import {
  createFrameAnnotationFromDefaults,
  getFrameAnnotationCreationDefaults,
  setFrameAnnotationCreationDefaults,
} from './creation-defaults';

const original = getFrameAnnotationCreationDefaults();

afterEach(() => setFrameAnnotationCreationDefaults(original));

describe('frame annotation creation defaults', () => {
  it('projects the selected frame, callout, and step settings into one canonical snapshot', () => {
    const callout = createDefaultFrameCallout();
    const stepBadge = createDefaultFrameStepBadge();
    setFrameAnnotationCreationDefaults((current) => ({
      ...current,
      effectMode: 'blur',
      blurSettings: { ...current.blurSettings, amount: 27, blurType: 'pixelate' },
      borderSettings: { ...current.borderSettings, customCss: 'border-radius: 24px;' },
      callout,
      stepBadge,
    }));

    const snapshot = createFrameAnnotationFromDefaults({
      id: 'frame-1',
      ordering: 4,
      x: 12,
      y: 20,
    });

    expect(snapshot).toMatchObject({
      id: 'frame-1',
      ordering: 4,
      x: 12,
      y: 20,
      width: 0,
      height: 0,
      effectMode: 'blur',
      blurSettings: { amount: 27, blurType: 'pixelate' },
      borderSettings: { customCss: 'border-radius: 24px;' },
      callout,
      stepBadge,
    });
  });

  it('does not expose mutable owner state to a consumer', () => {
    const first = getFrameAnnotationCreationDefaults();
    first.borderSettings.color = '#000000';

    expect(getFrameAnnotationCreationDefaults().borderSettings.color).toBe(
      original.borderSettings.color
    );
  });
});
