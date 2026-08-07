import type { SavePresetsRowShellProps } from '../../state/types';

export function PresetRowShell(props: SavePresetsRowShellProps) {
  return (
    <div
      draggable
      onDragStart={(event) => props.onDragStart(event, props.presetId)}
      onDragOver={(event) => props.onDragOver(event, props.presetId)}
      onDragLeave={props.onDragLeave}
      onDrop={(event) => props.onDrop(event, props.presetId)}
      onDragEnd={props.onDragEnd}
      onMouseEnter={() => props.onHoverChange(props.presetId)}
      onMouseLeave={() => props.onHoverChange(null)}
      className={props.className}
    >
      {props.children}
    </div>
  );
}
