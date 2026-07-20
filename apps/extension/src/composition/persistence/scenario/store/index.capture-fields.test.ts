import { beforeEach, expect, it, vi } from 'vitest';

const {
  dataUrlToBlobMock,
  getScenarioProjectMock,
  measureImageBlobMock,
  persistScenarioCaptureArtifactsMock,
} = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  persistScenarioCaptureArtifactsMock: vi.fn(),
}));

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../projects')>();
  return {
    ...actual,
    getScenarioProject: getScenarioProjectMock,
  };
});

vi.mock('./capture-step/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./capture-step/assets')>();
  return {
    ...actual,
    persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
  };
});
import { saveScenarioCaptureStepToProject } from './capture-step';
import { createScenarioStoreProjectFixture } from './test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pixel'], { type: 'image/png' }));
  measureImageBlobMock.mockResolvedValue({ height: 900, width: 1440 });
  persistScenarioCaptureArtifactsMock.mockResolvedValue(undefined);
});

it('keeps optional capture fields omitted when the request does not provide them', async () => {
  getScenarioProjectMock.mockResolvedValueOnce(createScenarioStoreProjectFixture());

  const result = await saveScenarioCaptureStepToProject({
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,1',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });

  expect(result.step.title).toBe('');
  expect(result.step.body).toBe('');
});
