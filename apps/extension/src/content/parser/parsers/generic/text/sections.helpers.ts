import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { generateId } from '../../../dom-utils/id-generator';
import type { TraversalContext } from '../../types';

export function ensureTitledSection(args: {
  ctx: TraversalContext;
  reuseExisting?: boolean;
  title: string;
}): SectionNode {
  if (args.ctx.currentSection?.title === args.title) {
    return args.ctx.currentSection;
  }

  if (args.reuseExisting) {
    const existingSection = args.ctx.result.structure.find(
      (section) => section.title === args.title
    );
    if (existingSection) {
      args.ctx.currentSection = existingSection;
      return existingSection;
    }
  }

  const section: SectionNode = {
    type: 'section',
    id: generateId('section'),
    title: args.title,
    children: [],
    selected: true,
  };

  args.ctx.result.structure.push(section);
  args.ctx.currentSection = section;
  return section;
}

export function appendFieldsToTitledSection(args: {
  ctx: TraversalContext;
  fields: SectionNode['children'];
  reuseExisting?: boolean;
  title: string;
}): SectionNode {
  const section = ensureTitledSection({
    ctx: args.ctx,
    ...(args.reuseExisting === undefined ? {} : { reuseExisting: args.reuseExisting }),
    title: args.title,
  });
  section.children.push(...args.fields);
  return section;
}
