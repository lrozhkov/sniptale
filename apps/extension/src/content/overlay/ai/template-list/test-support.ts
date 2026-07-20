import type { PromptTemplate } from '../../../../contracts/settings';

export function createPromptTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    content: 'one',
    id: 'template-1',
    name: 'One',
    ...overrides,
  };
}

export function createPromptTemplates(): PromptTemplate[] {
  return [
    createPromptTemplate(),
    createPromptTemplate({
      content: 'two',
      id: 'template-2',
      name: 'Two',
    }),
  ];
}
