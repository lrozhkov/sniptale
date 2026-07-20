import { describe, expect, it } from 'vitest';
import { normalizePointCloud, pickBestPointCloudTemplate, resamplePointCloud } from './point-cloud';
import { FREEHAND_RECOGNITION_TEMPLATES } from './templates';

function registerResampleTest() {
  it('resamples empty and non-empty point clouds deterministically', () => {
    expect(resamplePointCloud([], 4)).toEqual([]);
    expect(
      resamplePointCloud(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        3
      )
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
  });
}

function registerNormalizeTest() {
  it('normalizes point clouds around a zero-centered scale', () => {
    expect(
      normalizePointCloud(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        3
      )
    ).toEqual([
      { x: -0.5, y: 0 },
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ]);
  });
}

function registerTemplateSelectionTest() {
  it('picks the best open and closed templates for canonical strokes', () => {
    expect(
      pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.line), false)
    ).toMatchObject({ kind: 'line' });
    expect(
      pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.arrow), false)
    ).toMatchObject({ kind: 'arrow' });
    expect(
      pickBestPointCloudTemplate(
        normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.rectangle),
        true
      )
    ).toMatchObject({ kind: 'rectangle' });
    expect(
      pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.diamond), true)
    ).toMatchObject({ kind: 'diamond' });
    expect(
      pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.ellipse), true)
    ).toMatchObject({ kind: 'ellipse' });
    expect(
      pickBestPointCloudTemplate(normalizePointCloud(FREEHAND_RECOGNITION_TEMPLATES.polygon3), true)
    ).toMatchObject({ kind: 'triangle' });
  });
}

describe('editor-controller freehand point-cloud seam', () => {
  registerResampleTest();
  registerNormalizeTest();
  registerTemplateSelectionTest();
});
