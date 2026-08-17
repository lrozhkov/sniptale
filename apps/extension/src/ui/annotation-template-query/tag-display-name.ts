import type {
  AnnotationTemplateTag,
  SystemAnnotationTemplateTagKey,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import type { AppLocale, TranslationKey } from '../../platform/i18n';
import { translate } from '../../platform/i18n';

const systemTagNameKeys: Record<SystemAnnotationTemplateTagKey, TranslationKey> = {
  sniptale: 'highlighter.templateTags.system.sniptale',
  paper: 'highlighter.templateTags.system.paper',
  neon: 'highlighter.templateTags.system.neon',
  editorial: 'highlighter.templateTags.system.editorial',
  retro80s: 'highlighter.templateTags.system.retro80s',
};

export function getAnnotationTemplateTagDisplayName(
  tag: AnnotationTemplateTag,
  locale?: AppLocale
): string {
  return tag.origin === 'system' && tag.customized !== true && tag.systemTagKey
    ? translate(systemTagNameKeys[tag.systemTagKey], locale)
    : tag.label;
}
