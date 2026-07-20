import { expect, it } from 'vitest';
import { createProjectAndClip, createSceneTemplate } from './resolver.test-support';
import { resolveAnnotationControlValues } from './control-values';

it('applies defaults, snapshot values, and live values in precedence order', () => {
  const template = createSceneTemplate();
  const { clip } = createProjectAndClip();
  clip.templateControlValues = { headline: 'live-headline' };
  clip.templateSnapshot = {
    capturedAtSchemaVersion: 1,
    controls: { accent: '#ffffff', headline: 'snapshot-headline' },
    templateRef: { packId: 'test', templateId: 'scene' },
  };

  expect(resolveAnnotationControlValues(template, clip)).toEqual({
    accent: '#ffffff',
    headline: 'live-headline',
  });
});
