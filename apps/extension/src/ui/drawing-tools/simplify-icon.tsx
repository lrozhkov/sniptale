import mistIcon from '@iconify-icons/tabler/mist';
import { Icon } from '@iconify/react';
import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/** Uses local Tabler data through the existing drawing-toolbar icon contract. */
export const SimplifyIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  function SimplifyIcon({ size = 18, className, color, style, strokeWidth = 2 }, ref) {
    return (
      <Icon
        aria-hidden="true"
        ssr
        icon={mistIcon}
        ref={ref}
        width={size}
        height={size}
        strokeWidth={strokeWidth}
        {...(className === undefined ? {} : { className })}
        {...(color === undefined ? {} : { color })}
        {...(style === undefined ? {} : { style })}
      />
    );
  }
);
