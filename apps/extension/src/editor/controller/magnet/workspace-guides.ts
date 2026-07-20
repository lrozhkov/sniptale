import { Rect } from 'fabric';

export function createWorkspaceGuideTarget(size: { width: number; height: number }) {
  const workspace = new Rect({
    left: size.width / 2,
    top: size.height / 2,
    width: size.width,
    height: size.height,
    fill: 'transparent',
    strokeWidth: 0,
    evented: false,
    selectable: false,
  });
  workspace.setCoords();
  return workspace;
}
