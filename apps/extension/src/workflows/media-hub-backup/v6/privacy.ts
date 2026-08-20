import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { StoredImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces/contracts';
import type { PersistedEditorDocumentV3 } from '../../../composition/persistence/document-assets';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import type {
  ScenarioProject,
  ScenarioStep,
} from '../../../features/scenario/contracts/types/project';
import type { ScenarioPageDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { MediaHubBackupExportOptions } from './contracts';

export function projectMediaEntryPrivacy(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  options: MediaHubBackupExportOptions
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    ...entry,
    sourceFavicon: options.includeSourceMetadata
      ? sanitizeProvenanceUrl(entry.sourceFavicon)
      : null,
    sourceTitle: options.includeSourceMetadata ? entry.sourceTitle : null,
    sourceUrl: options.includeSourceMetadata ? sanitizeProvenanceUrl(entry.sourceUrl) : null,
  };
}

export function projectStoredEditorDocumentPrivacy(
  document: PersistedEditorDocumentV3,
  options: MediaHubBackupExportOptions
): PersistedEditorDocumentV3 {
  const browserFrame = document.browserFrame
    ? {
        ...document.browserFrame,
        favicon: options.includeSourceMetadata ? document.browserFrame.favicon : null,
        title: options.includeSourceMetadata ? document.browserFrame.title : '',
        url: options.includeSourceMetadata
          ? (sanitizeProvenanceUrl(document.browserFrame.url) ?? '')
          : '',
      }
    : undefined;
  const excludedFaviconAssetId =
    options.includeSourceMetadata || !document.browserFrame?.favicon
      ? null
      : document.browserFrame.favicon.assetId;
  return {
    ...document,
    assets: document.assets.filter(
      (asset) =>
        excludedFaviconAssetId === null ||
        asset.role !== 'browser-favicon' ||
        asset.assetId !== excludedFaviconAssetId
    ),
    ...(browserFrame ? { browserFrame } : {}),
    frame: {
      ...document.frame,
      browserTitle: options.includeSourceMetadata ? document.frame.browserTitle : '',
      browserUrl: options.includeSourceMetadata
        ? (sanitizeProvenanceUrl(document.frame.browserUrl) ?? '')
        : '',
    },
  };
}

export function projectImageWorkspacePrivacy(
  workspace: StoredImageWorkspaceEntry,
  options: MediaHubBackupExportOptions
): StoredImageWorkspaceEntry {
  return {
    ...workspace,
    document: projectStoredEditorDocumentPrivacy(workspace.document, options),
    sourceTitle: options.includeSourceMetadata ? workspace.sourceTitle : null,
    sourceUrl: options.includeSourceMetadata ? sanitizeProvenanceUrl(workspace.sourceUrl) : null,
  };
}

export function projectScenarioPrivacy(
  entry: ScenarioProjectEntry,
  options: MediaHubBackupExportOptions
): ScenarioProjectEntry {
  return {
    ...entry,
    project:
      entry.project.version === 3
        ? projectScenarioV3Privacy(entry.project, options)
        : projectScenarioV2Privacy(entry.project, options),
  };
}

function projectScenarioV2Privacy(
  project: ScenarioProject,
  options: MediaHubBackupExportOptions
): ScenarioProject {
  const projectStep = (step: ScenarioStep): ScenarioStep =>
    step.kind === 'capture'
      ? { ...step, page: projectScenarioPagePrivacy(step.page, options) }
      : step;
  return {
    ...project,
    steps: project.steps.map(projectStep),
    trash: project.trash.map((item) => ({ ...item, step: projectStep(item.step) })),
  };
}

function projectScenarioV3Privacy(
  project: ScenarioProjectV3,
  options: MediaHubBackupExportOptions
): ScenarioProjectV3 {
  const projectSlide = (slide: ScenarioSlide): ScenarioSlide => ({
    ...slide,
    elements: slide.elements.map((element) => projectScenarioElementPrivacy(element, options)),
    source:
      slide.source.kind === 'capture'
        ? { ...slide.source, page: projectScenarioPagePrivacy(slide.source.page, options) }
        : slide.source,
  });
  return {
    ...project,
    slides: project.slides.map(projectSlide),
    trash: project.trash.map((item) => ({ ...item, slide: projectSlide(item.slide) })),
  };
}

function projectScenarioElementPrivacy(
  element: ScenarioElement,
  options: MediaHubBackupExportOptions
): ScenarioElement {
  if (element.kind !== 'image' || element.captureContext === null) return element;
  return {
    ...element,
    captureContext: {
      ...element.captureContext,
      page: projectScenarioPagePrivacy(element.captureContext.page, options),
    },
  };
}

function projectScenarioPagePrivacy(
  page: ScenarioPageDescriptor,
  options: MediaHubBackupExportOptions
): ScenarioPageDescriptor {
  return {
    ...page,
    title: options.includeSourceMetadata ? page.title : null,
    url: options.includeSourceMetadata ? sanitizeProvenanceUrl(page.url) : null,
  };
}
