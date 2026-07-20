import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  type VideoAnnotationPack,
  type VideoAnnotationPackValidationError,
  type VideoAnnotationRenderNode,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationTemplateTimeline,
} from './types';

export function validateVideoAnnotationPack(
  pack: VideoAnnotationPack
): VideoAnnotationPackValidationError[] {
  const errors: VideoAnnotationPackValidationError[] = [];
  const tokenIds = new Set<string>();
  const templateIds = new Set<string>();

  pack.theme.tokens.forEach((token, index) => {
    addDuplicateError(tokenIds, token.id, ['theme', 'tokens', index, 'id'], errors);
  });
  Object.entries(pack.templates).forEach(([groupKey, templates]) => {
    templates.forEach((template, index) => {
      const path = ['templates', groupKey, index];
      addDuplicateError(templateIds, template.id, [...path, 'id'], errors);
      validateTemplate(template, path, tokenIds, errors);
      if (template.elementKind !== groupKey) {
        errors.push({
          code: 'element_kind_group_mismatch',
          message: `Template ${template.id} is in ${groupKey} but declares ${template.elementKind}.`,
          path: [...path, 'elementKind'],
        });
      }
    });
  });

  return errors;
}

function validateTemplate(
  template: VideoAnnotationTemplate,
  path: (number | string)[],
  tokenIds: ReadonlySet<string>,
  errors: VideoAnnotationPackValidationError[]
): void {
  const nodeIds = collectNodeIds(template.renderTree, [...path, 'renderTree'], errors);
  const controlIds = new Set<string>();
  const labelIds = new Set(template.timeline.labels.map((label) => label.id));
  const trackIds = new Set(template.timeline.tracks.map((track) => track.id));

  template.controls.forEach((control, index) => {
    addDuplicateError(controlIds, control.id, [...path, 'controls', index, 'id'], errors);
    validateControl(control, [...path, 'controls', index], nodeIds, tokenIds, trackIds, errors);
  });
  trackIds.clear();
  template.timeline.tracks.forEach((track, index) => {
    addDuplicateError(trackIds, track.id, [...path, 'timeline', 'tracks', index, 'id'], errors);
    if (!nodeIds.has(track.targetNodeId)) {
      errors.push({
        code: 'unknown_timeline_node',
        message: `Timeline track ${track.id} targets unknown node ${track.targetNodeId}.`,
        path: [...path, 'timeline', 'tracks', index, 'targetNodeId'],
      });
    }
    validateKeyframes(template.timeline, index, labelIds, errors, path);
  });
}

function validateControl(
  control: VideoAnnotationTemplateControl,
  path: (number | string)[],
  nodeIds: ReadonlySet<string>,
  tokenIds: ReadonlySet<string>,
  trackIds: ReadonlySet<string>,
  errors: VideoAnnotationPackValidationError[]
): void {
  if (control.type === VideoAnnotationControlType.SELECT && !control.options?.length) {
    errors.push({
      code: 'missing_select_options',
      message: `Select control ${control.id} must define at least one option.`,
      path: [...path, 'options'],
    });
  }
  if (control.binding.kind === VideoAnnotationControlBindingKind.NODE_PROPERTY) {
    validateKnownId(nodeIds, control.binding.nodeId, 'unknown_control_node', path, errors);
  }
  if (
    control.binding.kind === VideoAnnotationControlBindingKind.THEME_TOKEN &&
    !tokenIds.has(control.binding.tokenId)
  ) {
    errors.push({
      code: 'unknown_theme_token',
      message: `Control ${control.id} targets unknown token ${control.binding.tokenId}.`,
      path: [...path, 'binding', 'tokenId'],
    });
  }
  if (control.binding.kind === VideoAnnotationControlBindingKind.TIMELINE_PROPERTY) {
    control.binding.trackIds?.forEach((trackId, index) => {
      if (!trackIds.has(trackId)) {
        errors.push({
          code: 'unknown_control_timeline_track',
          message: `Unknown referenced id ${trackId}.`,
          path: [...path, 'binding', 'trackIds', index],
        });
      }
    });
  }
}

function validateKeyframes(
  timeline: VideoAnnotationTemplateTimeline,
  trackIndex: number,
  labelIds: ReadonlySet<string>,
  errors: VideoAnnotationPackValidationError[],
  path: (number | string)[]
): void {
  const track = timeline.tracks[trackIndex];
  let previousOffsetMs = -1;

  track?.keyframes.forEach((keyframe, keyframeIndex) => {
    const keyframePath = [...path, 'timeline', 'tracks', trackIndex, 'keyframes', keyframeIndex];
    if (keyframe.offsetMs > timeline.durationMs) {
      errors.push({
        code: 'keyframe_out_of_range',
        message: `Keyframe offset ${keyframe.offsetMs} exceeds timeline duration.`,
        path: [...keyframePath, 'offsetMs'],
      });
    }
    if (keyframe.offsetMs < previousOffsetMs) {
      errors.push({
        code: 'keyframe_order',
        message: 'Timeline keyframes must be sorted by offsetMs.',
        path: [...keyframePath, 'offsetMs'],
      });
    }
    if (keyframe.labelRef && !labelIds.has(keyframe.labelRef)) {
      errors.push({
        code: 'unknown_timeline_label',
        message: `Keyframe references unknown label ${keyframe.labelRef}.`,
        path: [...keyframePath, 'labelRef'],
      });
    }
    previousOffsetMs = keyframe.offsetMs;
  });
}

function collectNodeIds(
  node: VideoAnnotationRenderNode,
  path: (number | string)[],
  errors: VideoAnnotationPackValidationError[],
  ids = new Set<string>()
): Set<string> {
  addDuplicateError(ids, node.id, [...path, 'id'], errors);
  node.children?.forEach((child, index) => {
    collectNodeIds(child, [...path, 'children', index], errors, ids);
  });
  return ids;
}

function validateKnownId(
  ids: ReadonlySet<string>,
  id: string,
  code: string,
  path: (number | string)[],
  errors: VideoAnnotationPackValidationError[]
): void {
  if (!ids.has(id)) {
    errors.push({
      code,
      message: `Unknown referenced id ${id}.`,
      path: [...path, 'binding', 'nodeId'],
    });
  }
}

function addDuplicateError(
  ids: Set<string>,
  id: string,
  path: (number | string)[],
  errors: VideoAnnotationPackValidationError[]
): void {
  if (ids.has(id)) {
    errors.push({ code: 'duplicate_id', message: `Duplicate id ${id}.`, path });
    return;
  }
  ids.add(id);
}
