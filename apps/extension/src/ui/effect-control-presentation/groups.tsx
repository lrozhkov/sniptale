import { Fragment, type ReactNode } from 'react';
import {
  resolveEffectV1ControlGroup,
  type ControlDefinition,
  type EffectV1Document,
  type EffectV1ControlGroup,
} from '@sniptale/runtime-contracts/effect-v1';

/** Render admitted metadata; editor adapters own disclosure preferences and all mutations. */
export function EffectControlTree(props: {
  document: EffectV1Document;
  parentId: string;
  controls: readonly ControlDefinition[];
  renderControl(control: ControlDefinition): ReactNode;
  renderGroup(group: EffectV1ControlGroup, children: ReactNode): ReactNode;
}) {
  const groups = props.document.controlGroups ?? [];
  const parents = new Map(groups.map((group) => [group.id, group.parentId]));
  const parent = (control: ControlDefinition) =>
    control.group && parents.has(control.group)
      ? control.group
      : (resolveEffectV1ControlGroup(control.group, groups) ?? 'advanced');
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
        content: () =>
          props.renderGroup(group, <EffectControlTree {...props} parentId={group.id} />),
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
