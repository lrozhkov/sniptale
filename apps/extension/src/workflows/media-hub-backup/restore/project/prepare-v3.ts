import type { ScenarioProjectEntry } from '../../../../composition/persistence/scenario/contracts';
import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';

interface PreparedScenarioProjectV3Remap {
  descriptor: { entry: ScenarioProjectEntry };
  idChanged: boolean;
  projectId: string;
  scenarioAssetIdMap: ReadonlyMap<string, string>;
  stepIdMap: ReadonlyMap<string, string>;
}

function remapId(ids: ReadonlyMap<string, string>, id: string): string {
  return ids.get(id) ?? id;
}

function remapScenarioProjectV3Element(
  element: ScenarioElement,
  prepared: PreparedScenarioProjectV3Remap
): ScenarioElement {
  if (element.kind !== 'image') {
    return element;
  }

  return {
    ...element,
    assetRef: {
      ...element.assetRef,
      assetId: element.assetRef.assetId
        ? remapId(prepared.scenarioAssetIdMap, element.assetRef.assetId)
        : element.assetRef.assetId,
    },
    editDocumentId: element.editDocumentId
      ? remapId(prepared.stepIdMap, element.editDocumentId)
      : element.editDocumentId,
  };
}

function remapScenarioProjectV3Slide(
  slide: ScenarioSlide,
  prepared: PreparedScenarioProjectV3Remap
): ScenarioSlide {
  return {
    ...slide,
    elements: slide.elements.map((element) => remapScenarioProjectV3Element(element, prepared)),
    source:
      slide.source.kind === 'capture'
        ? {
            ...slide.source,
            assetId: remapId(prepared.scenarioAssetIdMap, slide.source.assetId),
          }
        : slide.source,
  };
}

export function remapScenarioProjectV3Entry(
  prepared: PreparedScenarioProjectV3Remap
): ScenarioProjectEntry {
  const entry = prepared.descriptor.entry;
  if (
    !isScenarioProjectV3(entry.project) ||
    (!prepared.idChanged && prepared.scenarioAssetIdMap.size === 0 && prepared.stepIdMap.size === 0)
  ) {
    return entry;
  }

  return {
    ...entry,
    id: prepared.idChanged ? prepared.projectId : entry.id,
    project: {
      ...entry.project,
      id: prepared.idChanged ? prepared.projectId : entry.project.id,
      name: prepared.idChanged ? `${entry.project.name} Copy` : entry.project.name,
      slides: entry.project.slides.map((slide) => remapScenarioProjectV3Slide(slide, prepared)),
      trash: entry.project.trash.map((trashEntry) => ({
        ...trashEntry,
        slide: remapScenarioProjectV3Slide(trashEntry.slide, prepared),
      })),
    },
  };
}
