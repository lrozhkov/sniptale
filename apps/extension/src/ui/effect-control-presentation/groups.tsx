import { Fragment, useMemo, type ReactNode } from 'react';
import type { EffectControlSet } from '@sniptale/runtime-contracts/effect-controls';
import {
  resolveEffectControlGroup,
  resolveEffectControlGroupIcons,
  type EffectControlIcon,
  type ControlDefinition,
  type EffectControlGroup,
} from '@sniptale/runtime-contracts/effect-controls';

/** Render admitted metadata; editor adapters own disclosure preferences and all mutations. */
type TreeProps = {
  document: EffectControlSet;
  parentId: string;
  controls: readonly ControlDefinition[];
  renderControl(control: ControlDefinition): ReactNode;
  renderGroup(group: EffectControlGroup, children: ReactNode): ReactNode;
};

/** Resolve retained display icons without changing the saved document. */
export function EffectControlTree(props: TreeProps) {
  const icons = useMemo(
    () => resolveEffectControlGroupIcons(props.document.controlGroups, props.document.controls),
    [props.document]
  );
  return <EffectControlBranch {...props} icons={icons} />;
}

function EffectControlBranch(props: TreeProps & { icons: ReadonlyMap<number, EffectControlIcon> }) {
  const groups = props.document.controlGroups ?? [];
  const parents = new Map(groups.map((group) => [group.id, group.parentId]));
  const parent = (control: ControlDefinition) =>
    control.group && parents.has(control.group)
      ? control.group
      : (resolveEffectControlGroup(control.group, groups) ?? 'advanced');
  const contains = (groupId: string) =>
    props.controls.some((control) => {
      let id: string | undefined = parent(control);
      while (id) {
        if (id === groupId) return true;
        id = parents.get(id);
      }
      return false;
    });
  const entries = [
    ...props.controls
      .filter((control) => parent(control) === props.parentId)
      .map((control) => ({
        key: `control:${control.id}`,
        order: control.order ?? 0,
        content: () => props.renderControl(control),
      })),
    ...groups
      .filter((group) => group.parentId === props.parentId && contains(group.id))
      .map((group) => ({
        key: `group:${group.id}`,
        order: group.order ?? 0,
        content: () => {
          const presented = { ...group };
          delete presented.icon;
          const icon = props.icons.get(groups.indexOf(group));
          if (icon) presented.icon = icon;
          return props.renderGroup(
            presented,
            <EffectControlBranch {...props} parentId={group.id} />
          );
        },
      })),
  ].sort((left, right) => left.order - right.order);
  return (
    <div className="min-w-0 space-y-1" data-effect-control-group={props.parentId}>
      {entries.map((entry) => (
        <Fragment key={entry.key}>{entry.content()}</Fragment>
      ))}
    </div>
  );
}
