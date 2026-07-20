import { getSettingsCountLabel } from '../../section-surface/text.helpers';

export function getTemplateCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'templates.section.countOne',
    few: 'templates.section.countFew',
    many: 'templates.section.countMany',
  });
}
