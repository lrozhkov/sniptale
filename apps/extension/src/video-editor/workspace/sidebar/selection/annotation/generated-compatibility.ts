import {
  VideoAnnotationControlBindingKind,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplateControl,
} from '../../../../../features/video/project/annotation-engine';
import type { WorkspaceSidebarProps } from '../../contracts/props';

type SelectedAnnotationClip = Extract<
  NonNullable<WorkspaceSidebarProps['selectedClip']>,
  { type: 'ANNOTATION' }
>;

export function createGeneratedControlCompatibilityPatch(
  clip: SelectedAnnotationClip,
  control: VideoAnnotationTemplateControl,
  value: VideoAnnotationPrimitiveValue
) {
  if (control.binding.kind !== VideoAnnotationControlBindingKind.TEMPLATE_FIELD) {
    return {};
  }

  if (control.binding.field === 'content.headline' && typeof value === 'string') {
    return { content: { ...clip.content, headline: value } };
  }
  if (control.binding.field === 'content.subline' && typeof value === 'string') {
    return { content: { ...clip.content, subline: value } };
  }
  if (control.binding.field === 'content.badge') {
    return { content: { ...clip.content, badge: typeof value === 'string' ? value : null } };
  }
  if (control.binding.field === 'style.accentColor' && typeof value === 'string') {
    return { style: { ...clip.style, accentColor: value } };
  }
  if (control.binding.field === 'style.backgroundColor' && typeof value === 'string') {
    return { style: { ...clip.style, backgroundColor: value } };
  }
  if (control.binding.field === 'style.badgeTextColor' && typeof value === 'string') {
    return { style: { ...clip.style, badgeTextColor: value } };
  }
  if (control.binding.field === 'style.headlineColor' && typeof value === 'string') {
    return { style: { ...clip.style, headlineColor: value } };
  }
  if (control.binding.field === 'style.sublineColor' && typeof value === 'string') {
    return { style: { ...clip.style, sublineColor: value } };
  }
  if (control.binding.field === 'style.borderRadius' && typeof value === 'number') {
    return { style: { ...clip.style, borderRadius: value } };
  }
  if (control.binding.field === 'style.padding' && typeof value === 'number') {
    return { style: { ...clip.style, padding: value } };
  }

  return {};
}
