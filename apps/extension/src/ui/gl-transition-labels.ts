import {
  GL_TRANSITIONS,
  resolveGlTransition,
  type GlTransitionSelection,
} from '../features/video/project/transition/gl-catalog';
import { translate, type AppLocale, type TranslationDictionary } from '../platform/i18n';

type Labels = TranslationDictionary['videoEditor']['glTransitions'];
const names: readonly string[] = GL_TRANSITIONS.map((transition) => transition.name);
const parameters = GL_TRANSITIONS.flatMap((transition) => Object.keys(transition.params));
function isBuiltinName(name: string): name is keyof Labels['names'] {
  return names.includes(name);
}
function isBuiltinParameter(id: string): id is keyof Labels['parameters'] {
  return parameters.includes(id);
}

/** Translate pinned built-in identities only; imported display names belong to their source. */
export function glTransitionLabel(selection: GlTransitionSelection, locale?: AppLocale): string {
  const descriptor = resolveGlTransition(selection);
  return descriptor && isBuiltinName(descriptor.name)
    ? translate(`videoEditor.glTransitions.names.${descriptor.name}`, locale)
    : selection.name;
}

/** Vector suffixes retain the canonical axis while the authored parameter name is localized. */
export function glTransitionParameterLabel(id: string, locale: AppLocale): string {
  const [parameter = id, axis] = id.split('.');
  const label = isBuiltinParameter(parameter)
    ? translate(`videoEditor.glTransitions.parameters.${parameter}`, locale)
    : parameter;
  return axis ? `${label} · ${axis.toUpperCase()}` : label;
}
