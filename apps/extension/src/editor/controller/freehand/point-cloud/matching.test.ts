import { expect, it } from 'vitest';
import { FREEHAND_RECOGNITION_TEMPLATES } from '../templates';
import { pickBestPointCloudTemplate } from './matching';
import { normalizePointCloud } from './normalize';

it('matches normalized strokes only against templates with the same closed state', () => {
  expect(
    pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.line), false)
  ).toMatchObject({ kind: 'line' });
  expect(
    pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.rectangle), true)
  ).toMatchObject({ kind: 'rectangle' });
  expect(
    pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.line), true)
  ).not.toMatchObject({ kind: 'line' });
});
