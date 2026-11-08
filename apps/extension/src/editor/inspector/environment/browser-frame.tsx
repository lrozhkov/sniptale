import React from 'react';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { translate, useAppLocale } from '../../../platform/i18n';
import { WindowHeaderSettings } from '../../../workflows/browser-frame/settings';
import { useEditorStore } from '../../state/useEditorStore';
import { resolveEditorWindowHeader } from '../../../features/editor/document/constants';
import { EditorInspectorDetails } from '../grouped';
import { BrowserFrameBehaviorSections } from './browser-frame-sections';

/** Layer presence owns activation; document identity owns pending favicon acquisition. */
export function EditorWindowHeaderSettings(props: {
  browserFrame: BrowserFrameState;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}) {
  const hasHeader = useEditorStore((state) => state.browserFrame.enabled === true);
  const identity = useEditorStore(
    (state) =>
      `${state.sessionId ?? ''}:${state.layers.find((layer) => layer.type === 'source-image')?.id ?? ''}`
  );
  return (
    <WindowHeaderSettings
      key={identity}
      renderGroup={(kind, children) => (
        <EditorInspectorDetails
          preferenceId={`browser-frame:${kind}`}
          label={translate(
            kind === 'appearance' ? 'windowHeader.appearance' : 'windowHeader.content'
          )}
          level="section"
          initiallyOpen
        >
          {children}
        </EditorInspectorDetails>
      )}
      header={hasHeader ? resolveEditorWindowHeader(props.browserFrame) : undefined}
      onChange={(header) =>
        props.syncBrowserFrame(
          header
            ? {
                ...header,
                faviconDataUrl: header.faviconDataUrl ?? null,
                faviconSource: header.faviconSource ?? null,
                ...(!hasHeader ? { enabled: true } : {}),
              }
            : { enabled: false }
        )
      }
    />
  );
}

export const EditorInspectorBrowserFramePanelContent: React.FC<{
  browserCanvasModeOptions: { label: string; value: 'resize' | 'keep-size' }[];
  browserFrame: BrowserFrameState;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
}> = ({ browserCanvasModeOptions, browserFrame, syncBrowserFrame }) => {
  useAppLocale();

  return (
    <div className="sniptale-parameter-stack">
      <EditorWindowHeaderSettings browserFrame={browserFrame} syncBrowserFrame={syncBrowserFrame} />
      {browserFrame.enabled && (
        <EditorInspectorDetails
          preferenceId="browser-frame:layout"
          label={translate('editor.scene.placementSection')}
        >
          <BrowserFrameBehaviorSections
            browserCanvasModeOptions={browserCanvasModeOptions}
            browserFrame={browserFrame}
            syncBrowserFrame={syncBrowserFrame}
          />
        </EditorInspectorDetails>
      )}
    </div>
  );
};
