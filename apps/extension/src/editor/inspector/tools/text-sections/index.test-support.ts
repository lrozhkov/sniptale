import { expect } from 'vitest';

type PatchSpy = ((patch: Record<string, unknown>) => void) & {
  mock: { calls: unknown[][] };
};

type StyleSpy = (style: string) => void;

export function assertTextControlsLabels(container: HTMLDivElement | null) {
  expect(container?.innerHTML).toContain('editor.compact.textShort');
  expect(container?.innerHTML).toContain('editor.compact.backgroundShort');
  expect(container?.innerHTML).toContain('highlighter.editor.shadowLabel');
  expect(container?.innerHTML).toContain('editor.compact.textAlign');
  expect(container?.innerHTML).toContain('editor.compact.verticalAlign');
  expect(container?.innerHTML).toContain('editor.compact.textColor');
  expect(container?.innerHTML).toContain('editor.compact.backgroundColor');
  expect(container?.innerHTML).toContain('editor.compact.font');
  expect(container?.innerHTML).toContain('editor.compact.fontSize');
  expect(container?.innerHTML).toContain('editor.compact.typography');
  expect(container?.innerHTML).toContain('editor.compact.shadowSize');
  expect(container?.innerHTML).toContain('editor.compact.shadowAngle');
  expect(container?.innerHTML).toContain('editor.compact.shadowDistance');
  expect(container?.innerHTML).toContain('editor.compact.shadowBlur');
  expect(container?.innerHTML).not.toContain('editor.compact.maxWidth');
  expect(container?.innerHTML).not.toContain('editor.compact.calloutFormat');
  expect(container?.innerHTML).not.toContain('editor.compact.layoutMode');
}

export function assertTextSectionPatchCalls(args: {
  applyTextPatch: PatchSpy;
  applyTextStyle: StyleSpy;
  props: {
    commitPendingSelectionSettings: () => void;
    previewTextPatch: PatchSpy;
  };
}) {
  const getPatch = (call: unknown[]): Record<string, unknown> | null => {
    const patch = call[0];
    return patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : null;
  };
  const hasStringPatch = (key: string) =>
    args.applyTextPatch.mock.calls.some((call) => typeof getPatch(call)?.[key] === 'string');

  expect(hasStringPatch('calloutFormat')).toBe(false);
  expect(hasStringPatch('layoutMode')).toBe(false);
  expect(args.applyTextPatch).toHaveBeenCalledWith({ textAlign: 'center' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ verticalAlign: 'bottom' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ fontFamily: 'mono' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ textColor: '#654321' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#654321' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ shadowColor: '#654321' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ textColor: '#345678' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ backgroundColor: '#345678' });
  expect(args.applyTextPatch).toHaveBeenCalledWith({ shadowColor: '#345678' });
  expect(args.applyTextPatch).not.toHaveBeenCalledWith({ shadow: 30 });
  expect(args.applyTextStyle).toHaveBeenCalledWith('bold');
  expect(args.applyTextPatch).not.toHaveBeenCalledWith({ fontSize: 42 });
  expect(args.applyTextPatch).not.toHaveBeenCalledWith({ backgroundOpacity: 0.45 });
  expect(args.applyTextPatch).not.toHaveBeenCalledWith({ textOpacity: 0.5 });
  expect(
    args.applyTextPatch.mock.calls.some((call) => typeof getPatch(call)?.['opacity'] === 'number')
  ).toBe(false);
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ shadow: 30 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ shadowAngle: 135 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ shadowDistance: 18 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ shadowBlur: 24 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ fontSize: 42 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ textOpacity: 0.5 });
  expect(args.props.previewTextPatch).toHaveBeenCalledWith({ backgroundOpacity: 0.45 });
  expect(args.props.commitPendingSelectionSettings).toHaveBeenCalledTimes(7);
}
