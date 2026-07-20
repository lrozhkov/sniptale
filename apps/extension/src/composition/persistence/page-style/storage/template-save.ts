import type { PageStyleRegistry, PageStyleTemplate } from '@sniptale/runtime-contracts/page-style';
import { cloneTemplate } from './clone';
import { preparePageStyleTemplateSave } from './records';
import type { SavePageStyleTemplateInput } from './types';

export async function saveTemplateRecord(args: {
  createId: () => string;
  input: SavePageStyleTemplateInput;
  loadRegistry: () => Promise<PageStyleRegistry>;
  now: number;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}): Promise<PageStyleTemplate> {
  const registry = await args.loadRegistry();
  const prepared = preparePageStyleTemplateSave({
    createId: args.createId,
    input: args.input,
    now: args.now,
    registry,
  });

  await args.writeRegistry(prepared.registry);
  return cloneTemplate(prepared.template);
}
