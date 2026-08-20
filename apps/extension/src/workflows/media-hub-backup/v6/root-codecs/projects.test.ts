import { describe, expect, it } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../../features/scenario/project/v3';
import { assertPortableJson } from '../codec';
import { encodePortableScenarioProjectEntry } from './projects';

describe('portable project codecs', () => {
  it('renames scenario domain asset references without leaking local assetId fields', () => {
    const base = createScenarioProjectV3('Portable');
    const project = {
      ...base,
      id: 'scenario',
      slides: [
        createScenarioSlide({
          elements: [
            createScenarioImageElement({
              assetRef: { assetId: 'scenario-asset', galleryAssetId: null },
              editDocumentId: 'step',
            }),
          ],
          source: {
            assetId: 'scenario-asset',
            captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
            captureSurface: null,
            cursorPoint: null,
            galleryAssetId: null,
            interactionPoint: null,
            kind: 'capture',
            page: {
              devicePixelRatio: 1,
              scrollX: 0,
              scrollY: 0,
              title: 'Page',
              url: null,
              viewport: { height: 1, width: 1, x: 0, y: 0 },
            },
            sourceKind: null,
            target: null,
          },
        }),
      ],
    };
    const portable = encodePortableScenarioProjectEntry({
      createdAt: 1,
      id: 'scenario',
      project,
      updatedAt: 2,
    });
    expect(() => assertPortableJson(portable)).not.toThrow();
    expect(JSON.stringify(portable)).not.toContain('"assetId"');
    expect(JSON.stringify(portable)).toContain('"scenarioAssetId":"scenario-asset"');
  });
});
