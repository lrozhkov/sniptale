import { expect, it } from 'vitest';

import {
  SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID,
  SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
} from '../legacy';
import { createBuiltInAnnotationControlValues } from './legacy';

it('creates the technical family defaults for the technical built-in pack', () => {
  expect(
    createBuiltInAnnotationControlValues({
      packId: SNIPTALE_TECHNICAL_ANNOTATION_PACK_ID,
      templateId: 'technical-template',
    })
  ).toEqual({ accent: '#2563eb', headline: 'System state' });
});

it('uses editorial defaults for editorial and non-technical built-in refs', () => {
  for (const packId of [SNIPTALE_EDITORIAL_ANNOTATION_PACK_ID, 'custom-pack']) {
    expect(
      createBuiltInAnnotationControlValues({ packId, templateId: 'editorial-template' })
    ).toEqual({ accent: '#d97706', headline: 'Key moment' });
  }
});
