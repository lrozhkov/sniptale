import { logEditorOpenTrace } from '../../../../../core/debug';

export function traceEditorImageOpenStart(options: {
  dataUrl: string;
  sourceName: string | null;
}): void {
  logEditorOpenTrace('controller:start', {
    dataUrlLength: options.dataUrl.length,
    sourceName: options.sourceName,
  });
}
