import {
  GL_TRANSITIONS,
  createGlTransitionSelection,
  type GlTransitionSelection,
} from '../features/video/project/transition/gl-catalog';
import { glTransitionLabel } from './gl-transition-labels';

/** Checked catalogue data is supplied by composition; this projection has no storage authority. */
export type GlTransitionChoiceCatalog = {
  items: readonly ({ id: string; name: string; builtin: boolean; enabled: boolean } & (
    | { status: 'ready'; selection: GlTransitionSelection }
    | { status: 'unsupported' }
  ))[];
  loading: boolean;
  error: boolean;
};
function available(catalog: GlTransitionChoiceCatalog) {
  return catalog.loading || catalog.error
    ? []
    : catalog.items.filter((item) => item.enabled && item.status === 'ready');
}
function key(selection: GlTransitionSelection) {
  return JSON.stringify([
    selection.name,
    selection.version,
    selection.adapter,
    selection.wgslSha256,
    selection.glsl3Sha256,
    Object.entries(selection.values).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
const choiceId = (item: GlTransitionChoiceCatalog['items'][number]) =>
  item.builtin ? item.name : item.id;
export function glTransitionChoiceValue(
  catalog: GlTransitionChoiceCatalog | undefined,
  selection: GlTransitionSelection
) {
  if (!catalog) return selection.name;
  const item = available(catalog).find(
    (item) => item.status === 'ready' && key(item.selection) === key(selection)
  );
  return item ? choiceId(item) : selection.name;
}
export function glTransitionChoices(
  catalog?: GlTransitionChoiceCatalog,
  current?: GlTransitionSelection
) {
  const options: { value: string; label: string; disabled?: boolean }[] = catalog
    ? available(catalog).map((item) => ({
        value: choiceId(item),
        label:
          item.builtin && item.status === 'ready' && item.id === `builtin:${item.selection.name}`
            ? glTransitionLabel(item.selection)
            : item.name,
      }))
    : GL_TRANSITIONS.map((item) => {
        const selection = createGlTransitionSelection(item.name);
        return { value: item.name, label: selection ? glTransitionLabel(selection) : item.name };
      });
  if (current) {
    const value = glTransitionChoiceValue(catalog, current);
    if (!options.some((option) => option.value === value))
      options.push({ value, label: glTransitionLabel(current), disabled: true });
  }
  return options;
}
export function resolveGlTransitionChoice(
  catalog: GlTransitionChoiceCatalog | undefined,
  value: string
): GlTransitionSelection | null {
  if (!catalog) return createGlTransitionSelection(value);
  const item = available(catalog).find((item) => choiceId(item) === value);
  return item?.status === 'ready' ? structuredClone(item.selection) : null;
}
