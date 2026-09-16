import { TemplatesSectionContent } from './content';
import { useTemplatesSection } from './controller';

export function TemplatesSection({ scope = 'page' }: { scope?: 'page' | 'scenario' }) {
  const templatesSection = useTemplatesSection(scope);
  const { editingTemplate, ...contentProps } = templatesSection;

  return (
    <TemplatesSectionContent
      {...contentProps}
      {...(editingTemplate === undefined ? {} : { editingTemplate })}
    />
  );
}
