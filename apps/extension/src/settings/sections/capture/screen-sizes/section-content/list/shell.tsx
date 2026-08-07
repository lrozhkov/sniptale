import type { ReactNode } from 'react';

export function PresetRowShell(props: {
  children: ReactNode;
  className: string;
  onHoverChange: (id: string | null) => void;
  presetId: string;
}) {
  return (
    <div
      onMouseEnter={() => props.onHoverChange(props.presetId)}
      onMouseLeave={() => props.onHoverChange(null)}
      className={props.className}
    >
      {props.children}
    </div>
  );
}
