import { useVideoEditorEffectEditingPort } from '../../../../runtime/controller/store';
import { isEffectInstanceEditable } from '../../../../../features/video/project/effect-instance/editing';
import type { VideoProject } from '../../../../../features/video/project/types';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { createEffectInstanceGroups } from '../effect-instance/groups';

export function InspectFxPanel(props: { project: VideoProject; instanceId: string }) {
  const actions = useVideoEditorEffectEditingPort((port) => port);
  const instance = props.project.effectInstances?.find((item) => item.id === props.instanceId);
  if (!instance) return null;
  return (
    <InspectorGroupedPanel
      groups={[
        ...createEffectInstanceGroups({
          project: props.project,
          instanceId: instance.id,
          target: instance.target,
          disabled: !isEffectInstanceEditable(props.project, instance),
          onDeleteEffectInstance: actions.deleteEffectInstance,
          onDuplicateEffectInstance: actions.duplicateEffectInstance,
          onMoveEffectInstance: actions.moveEffectInstance,
          onUpdateEffectInstance: actions.updateEffectInstance,
          onSetEffectTargetBypassed: actions.setEffectTargetBypassed,
          onSetClipEffectsBypassed: actions.setClipEffectsBypassed,
        }),
      ]}
    />
  );
}
