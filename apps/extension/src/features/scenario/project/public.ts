export {
  createGuideImageBlock,
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
