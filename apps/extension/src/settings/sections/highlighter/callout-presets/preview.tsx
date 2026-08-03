import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';

export function CalloutPresetPreview({ style }: { style: CalloutVisualStyle }) {
  const surface = style.surface;
  const connector = style.connector;
  return (
    <div className="relative flex h-12 w-16 flex-shrink-0 items-center justify-center" aria-hidden>
      {connector.kind === 'line' ? (
        <span
          className="absolute left-0 top-1/2 w-5 origin-left -rotate-[18deg] border-t"
          style={{ borderColor: connector.color, borderWidth: connector.width }}
        />
      ) : null}
      {connector.kind === 'wedge' ? (
        <span
          className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45"
          style={{ backgroundColor: surface.backgroundColor }}
        />
      ) : null}
      <span
        className="relative ml-3 flex h-8 w-12 flex-col overflow-hidden"
        style={{
          backgroundColor: surface.backgroundColor,
          borderColor: surface.borderColor,
          borderRadius: Math.min(surface.radius, 12),
          borderStyle: 'solid',
          borderWidth: surface.borderWidth,
          boxShadow: surface.shadow ? '0 3px 8px rgb(0 0 0 / 18%)' : undefined,
        }}
      >
        {style.title.enabled ? (
          <span className="h-2 w-full" style={{ backgroundColor: style.title.backgroundColor }} />
        ) : null}
        <span className="m-auto h-0.5 w-6 rounded" style={{ backgroundColor: surface.textColor }} />
      </span>
    </div>
  );
}
