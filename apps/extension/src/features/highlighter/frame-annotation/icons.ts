import { createElement, type ComponentPropsWithoutRef } from 'react';
import { Icon } from '@iconify/react';
import circleNumber1 from '@iconify-icons/tabler/circle-number-1';
import message2 from '@iconify-icons/tabler/message-2';
import message2Plus from '@iconify-icons/tabler/message-2-plus';

type FrameIconProps = Pick<
  ComponentPropsWithoutRef<'svg'>,
  'className' | 'style' | 'aria-hidden' | 'strokeWidth'
> & { size?: number | string };

function inheritStroke(icon: typeof circleNumber1) {
  // Tabler embeds stroke width on descendants; let the toolbar's SVG styling own it.
  return { ...icon, body: icon.body.replaceAll(' stroke-width="2"', '') };
}
const numberIcon = inheritStroke(circleNumber1);
const commentIcon = inheritStroke(message2);
const addCommentIcon = inheritStroke(message2Plus);

function renderIcon(
  icon: typeof circleNumber1,
  name: string,
  { size = 24, strokeWidth = 2, className, ...props }: FrameIconProps
) {
  return createElement(Icon, {
    ...props,
    'aria-hidden': props['aria-hidden'] ?? true,
    icon,
    ssr: true,
    width: size,
    height: size,
    strokeWidth,
    className: `tabler-icon tabler-icon-${name}${className ? ` ${className}` : ''}`,
  });
}

export function FrameNumberIcon(props: FrameIconProps) {
  return renderIcon(numberIcon, 'circle-number-1', props);
}
export function FrameCommentIcon(props: FrameIconProps) {
  return renderIcon(commentIcon, 'message-2', props);
}
export function AddFrameCommentIcon(props: FrameIconProps) {
  return renderIcon(addCommentIcon, 'message-2-plus', props);
}
