export {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from './factories';
export { applyGuideStructureOperation, type GuideStructureOperation } from './mutations';
export { resolveGuideStyle, resolveGuideTextStyle, applyGuideDefaultStyle } from './appearance';

export { resolveGuideBlockWidth, applyGuideLayout } from './layout';

export { resolveGuideNumbering, type GuideResolvedNumber } from './numbering';
export {
  selectGuideAiContent,
  prepareGuideAiProposal,
  applyGuideAiProposal,
  type GuideAiScope,
  type GuideAiChange,
} from './ai-proposal';
