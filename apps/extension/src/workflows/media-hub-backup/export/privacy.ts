import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import type { EditorDocument } from '../../../features/editor/document/types';
import type {
  ScenarioProject,
  ScenarioStep,
} from '../../../features/scenario/contracts/types/project';
import type { ScenarioPageDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioElement,
  ScenarioImageElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type {
  MediaHubBackupExportOptions,
  ScenarioBackupProjectDescriptor,
} from '../contracts/types';

export function hasBackupSourceMetadata(entry: {
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}): boolean {
  return Boolean(entry.sourceFavicon || entry.sourceTitle || entry.sourceUrl);
}

export function applyMediaEntryPrivacyOptions(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  options: MediaHubBackupExportOptions
): Omit<MediaLibraryEntry, 'blob'> {
  if (options.includeSourceMetadata) {
    return entry;
  }

  return {
    ...entry,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
  };
}

export function applyScenarioProjectPrivacyOptions(
  entry: ScenarioProjectEntry,
  options: MediaHubBackupExportOptions
): ScenarioProjectEntry {
  return {
    ...entry,
    project:
      entry.project.version === 3
        ? scrubScenarioProjectV3(entry.project, options)
        : scrubScenarioProjectV2(entry.project, options),
  };
}

export function applyScenarioStepDocumentPrivacyOptions<
  TEntry extends { document: EditorDocument },
>(entry: TEntry, options: MediaHubBackupExportOptions): TEntry {
  if (options.includeSourceMetadata) {
    return {
      ...entry,
      document: sanitizeEditorDocumentSourceUrls(entry.document),
    };
  }

  return {
    ...entry,
    document: stripEditorDocumentSourceMetadata(entry.document),
  };
}

export function countScenarioProjectSourceMetadata(
  descriptor: ScenarioBackupProjectDescriptor
): number {
  return (
    countScenarioProjectEntrySourceMetadata(descriptor.entry) +
    descriptor.stepDocuments.filter((entry) => hasEditorDocumentSourceMetadata(entry.document))
      .length
  );
}

export function countScenarioProjectEntrySourceMetadata(entry: ScenarioProjectEntry): number {
  if (entry.project.version === 3) {
    return countScenarioProjectV3SourceMetadata(entry.project);
  }

  return countScenarioProjectV2SourceMetadata(entry.project);
}

export function hasEditorDocumentSourceMetadata(
  document: Partial<EditorDocument> | undefined
): boolean {
  return Boolean(
    document?.browserFrame?.title ||
    document?.browserFrame?.url ||
    document?.browserFrame?.faviconDataUrl ||
    document?.frame?.browserTitle ||
    document?.frame?.browserUrl
  );
}

function scrubScenarioProjectV2(
  project: ScenarioProject,
  options: MediaHubBackupExportOptions
): ScenarioProject {
  return {
    ...project,
    steps: project.steps.map((step) => scrubScenarioStepV2(step, options)),
    trash: project.trash.map((item) => ({
      ...item,
      step: scrubScenarioStepV2(item.step, options),
    })),
  };
}

function scrubScenarioStepV2(
  step: ScenarioStep,
  options: MediaHubBackupExportOptions
): ScenarioStep {
  if (step.kind !== 'capture') {
    return step;
  }

  return {
    ...step,
    page: scrubScenarioPage(step.page, options),
  };
}

function scrubScenarioProjectV3(
  project: ScenarioProjectV3,
  options: MediaHubBackupExportOptions
): ScenarioProjectV3 {
  return {
    ...project,
    slides: project.slides.map((slide) => scrubScenarioSlideV3(slide, options)),
    trash: project.trash.map((item) => ({
      ...item,
      slide: scrubScenarioSlideV3(item.slide, options),
    })),
  };
}

function scrubScenarioSlideV3(
  slide: ScenarioSlide,
  options: MediaHubBackupExportOptions
): ScenarioSlide {
  return {
    ...slide,
    elements: slide.elements.map((element) => scrubScenarioElementV3(element, options)),
    source:
      slide.source.kind === 'capture'
        ? {
            ...slide.source,
            page: scrubScenarioPage(slide.source.page, options),
          }
        : slide.source,
  };
}

function scrubScenarioElementV3(
  element: ScenarioElement,
  options: MediaHubBackupExportOptions
): ScenarioElement {
  if (element.kind !== 'image') {
    return element;
  }

  const nextElement: ScenarioImageElement = {
    ...element,
    editDocumentId: options.includeEditorDrafts ? element.editDocumentId : null,
  };

  if (!nextElement.captureContext) {
    return nextElement;
  }

  return {
    ...nextElement,
    captureContext: {
      ...nextElement.captureContext,
      page: scrubScenarioPage(nextElement.captureContext.page, options),
    },
  } satisfies ScenarioImageElement;
}

function scrubScenarioPage(
  page: ScenarioPageDescriptor,
  options: MediaHubBackupExportOptions
): ScenarioPageDescriptor {
  if (!options.includeSourceMetadata) {
    return {
      ...page,
      title: null,
      url: null,
    };
  }

  return {
    ...page,
    url: sanitizeProvenanceUrl(page.url),
  };
}

function sanitizeEditorDocumentSourceUrls(document: EditorDocument): EditorDocument {
  const partialDocument = document as Partial<EditorDocument>;

  return {
    ...partialDocument,
    browserFrame:
      partialDocument.browserFrame === undefined
        ? undefined
        : {
            ...partialDocument.browserFrame,
            url: sanitizeProvenanceUrl(partialDocument.browserFrame.url) ?? '',
          },
    ...(partialDocument.frame === undefined
      ? {}
      : {
          frame: {
            ...partialDocument.frame,
            browserUrl: sanitizeProvenanceUrl(partialDocument.frame.browserUrl) ?? '',
          },
        }),
  } as EditorDocument;
}

function stripEditorDocumentSourceMetadata(document: EditorDocument): EditorDocument {
  const partialDocument = document as Partial<EditorDocument>;

  return {
    ...partialDocument,
    browserFrame:
      partialDocument.browserFrame === undefined
        ? undefined
        : {
            ...partialDocument.browserFrame,
            faviconDataUrl: null,
            title: '',
            url: '',
          },
    ...(partialDocument.frame === undefined
      ? {}
      : {
          frame: {
            ...partialDocument.frame,
            browserTitle: '',
            browserUrl: '',
          },
        }),
  } as EditorDocument;
}

function countScenarioProjectV2SourceMetadata(project: ScenarioProject): number {
  return (
    project.steps.filter(hasScenarioStepV2SourceMetadata).length +
    project.trash.filter((item) => hasScenarioStepV2SourceMetadata(item.step)).length
  );
}

function hasScenarioStepV2SourceMetadata(step: ScenarioStep): boolean {
  return step.kind === 'capture' && hasScenarioPageSourceMetadata(step.page);
}

function countScenarioProjectV3SourceMetadata(project: ScenarioProjectV3): number {
  return (
    project.slides.reduce((count, slide) => count + countScenarioSlideV3SourceMetadata(slide), 0) +
    project.trash.reduce((count, item) => count + countScenarioSlideV3SourceMetadata(item.slide), 0)
  );
}

function countScenarioSlideV3SourceMetadata(slide: ScenarioSlide): number {
  const sourceCount =
    slide.source.kind === 'capture' && hasScenarioPageSourceMetadata(slide.source.page) ? 1 : 0;
  return (
    sourceCount +
    slide.elements.filter(
      (element) =>
        element.kind === 'image' &&
        element.captureContext !== null &&
        hasScenarioPageSourceMetadata(element.captureContext.page)
    ).length
  );
}

function hasScenarioPageSourceMetadata(page: ScenarioPageDescriptor): boolean {
  return Boolean(page.title || page.url);
}
