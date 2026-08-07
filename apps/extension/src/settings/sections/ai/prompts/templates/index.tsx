import { TemplatesSectionContent } from './content';
import { useTemplatesSection } from './controller';

export function TemplatesSection() {
  const templatesSection = useTemplatesSection();
  const { editingTemplate, ...contentProps } = templatesSection;

  return (
    <TemplatesSectionContent
      {...contentProps}
      {...(editingTemplate === undefined ? {} : { editingTemplate })}
    />
  );
}
