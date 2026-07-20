export type ScenarioStepKind = 'capture' | 'section' | 'note' | 'divider';

export type ScenarioNoteTone = 'neutral' | 'info' | 'warning' | 'error';

export type ScenarioExportFormat = 'html' | 'markdown';
export type ScenarioExportImageFormat = 'svg' | 'png';
export type ScenarioCaptureMode = 'manual' | 'by-click';
export type ScenarioCaptureSurface = 'visible' | 'full' | 'selection';
export type ScenarioCaptureSourceKind = 'manual' | 'auto-click';
export type ScenarioAnnotationRenderMode = 'overlays' | 'asset';
export type ScenarioSuggestedEventKind = 'click' | 'input' | 'change' | 'keydown' | 'scroll';
export type ScenarioSuggestedEventStatus = 'pending' | 'accepted' | 'dismissed';
