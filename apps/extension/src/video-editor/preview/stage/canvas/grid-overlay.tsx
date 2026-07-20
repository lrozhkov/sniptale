import type { PreviewStageGridSettings } from '../types';
import type { PreviewStageGuide } from './snap';
import type { VideoProject } from '../../../../features/video/project/types/index';

function getGridBackgroundSize(project: VideoProject, gridSize: number): string {
  const size = Math.max(1, gridSize);
  return `${(size / project.width) * 100}% ${(size / project.height) * 100}%`;
}

export function PreviewStageGridOverlay(props: {
  grid?: PreviewStageGridSettings;
  project: VideoProject;
}) {
  if (!props.grid?.enabled) {
    return null;
  }

  const color = props.grid.color || '#94a3b8';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[2] opacity-45"
      style={{
        backgroundImage: [
          `linear-gradient(to right, ${color} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
        ].join(','),
        backgroundSize: getGridBackgroundSize(props.project, props.grid.size),
      }}
    />
  );
}

export function PreviewStageGuideOverlay(props: {
  guides: readonly PreviewStageGuide[];
  project: VideoProject;
}) {
  if (props.guides.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]">
      {props.guides.map((guide) => (
        <span
          key={`${guide.axis}-${guide.position}`}
          className="absolute bg-[var(--sniptale-color-accent-emphasis)] shadow-[0_0_0_1px_rgba(255,255,255,0.55)]"
          style={getGuideStyle(guide, props.project)}
        />
      ))}
    </div>
  );
}

function getGuideStyle(guide: PreviewStageGuide, project: VideoProject) {
  if (guide.axis === 'x') {
    return {
      bottom: 0,
      left: `${(guide.position / project.width) * 100}%`,
      top: 0,
      width: 1,
    };
  }

  return {
    height: 1,
    left: 0,
    right: 0,
    top: `${(guide.position / project.height) * 100}%`,
  };
}
