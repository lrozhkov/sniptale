export {
  createGuideImageBlock,
  createTourDocument,
  createTourImageSlide,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from './factories';
export { applyGuideStructureOperation, type GuideStructureOperation } from './mutations';
export { resolveGuideStyle, resolveGuideTextStyle, applyGuideDefaultStyle } from './appearance';

export { resolveGuideBlockWidth, applyGuideLayout, splitGuideBlockRows } from './layout';

export { resolveGuideNumbering, type GuideResolvedNumber } from './numbering';
export {
  selectGuideAiContent,
  prepareGuideAiProposal,
  applyGuideAiProposal,
  type GuideAiScope,
  type GuideAiChange,
} from './ai-proposal';

export { classifyGuideStepContent, applyGuideTemplateAppearance } from './templates';

export { fitGuideRowInsertion, type GuideBlockPlacement } from './spatial-placement';

export {
  getTourImages,
  getTourAudioResources,
  getTourNarrationTargets,
  getTourNarrationTarget,
  getTourNarrationCues,
  getScenarioResourceReferences,
  remapTourIdentities,
} from './tour-resources';

export {
  applyTourCommands,
  getTourIncomingReferences,
  type TourCommand,
  type TourResourceCatalog,
} from './tour-commands';
export {
  generateTourFromMaterials,
  generateTourFromGuide,
  type TourMaterial,
  type TourGenerationProposal,
  type TourGenerationIssue,
} from './tour-generation';
export { mapTourCapturePoint, mapTourCaptureRect, type TourCaptureMapping } from './tour-geometry';

export { remapTourImageGeometry, type TourImageTransform } from './tour-edit-geometry';
