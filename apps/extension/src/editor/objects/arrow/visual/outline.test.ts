import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildArrowCenterlineMock,
  buildArrowHeadPathMock,
  getArrowHeadAttachmentInsetMock,
  buildDynamicShaftOutlinePathMock,
  buildShaftOutlinePathMock,
  trimPolylineMock,
} = vi.hoisted(() => ({
  buildArrowCenterlineMock: vi.fn(),
  buildArrowHeadPathMock: vi.fn(),
  getArrowHeadAttachmentInsetMock: vi.fn(),
  buildDynamicShaftOutlinePathMock: vi.fn(),
  buildShaftOutlinePathMock: vi.fn(),
  trimPolylineMock: vi.fn(),
}));

vi.mock('./centerline/build', () => ({
  buildArrowCenterline: buildArrowCenterlineMock,
}));

vi.mock('./heads', () => ({
  buildArrowHeadPath: buildArrowHeadPathMock,
  buildArrowHeadStrokePath: vi.fn(),
  getArrowHeadAttachmentInset: getArrowHeadAttachmentInsetMock,
}));

vi.mock('./styles', () => ({
  buildDynamicShaftOutlinePath: buildDynamicShaftOutlinePathMock,
  buildShaftOutlinePath: buildShaftOutlinePathMock,
}));

vi.mock('./primitives', () => ({
  buildDynamicShaftOutlinePath: buildDynamicShaftOutlinePathMock,
  buildShaftOutlinePath: buildShaftOutlinePathMock,
  trimPolyline: trimPolylineMock,
}));

import { buildFilledArrowPathData } from './outline';

function createSettings() {
  return {
    color: '#f60',
    endHead: 'triangle',
    mode: 'straight',
    opacity: 1,
    startHead: 'none',
    width: 6,
  } as const;
}

function registerEmptyCenterlineTest() {
  it('returns an empty path when the centerline has no endpoints', () => {
    buildArrowCenterlineMock.mockReturnValue({
      endAngle: 0,
      points: [],
      startAngle: 0,
    });

    expect(buildFilledArrowPathData([], createSettings() as never)).toBe('');
    expect(buildShaftOutlinePathMock).not.toHaveBeenCalled();
  });
}

function registerSinglePointCenterlineTest() {
  it('skips trimming for one-point centerlines and filters missing head paths', () => {
    buildArrowCenterlineMock.mockReturnValue({
      endAngle: 0.5,
      points: [{ x: 12, y: 8 }],
      startAngle: 0,
    });
    buildArrowHeadPathMock.mockReturnValueOnce('').mockReturnValueOnce('end-head');

    expect(
      buildFilledArrowPathData([{ x: 12, y: 8 }], {
        ...createSettings(),
        endHead: 'open',
      } as never)
    ).toBe('shaft end-head');
    expect(trimPolylineMock).not.toHaveBeenCalled();
  });
}

function registerTrimmedCenterlineTest() {
  it('trims multi-point centerlines using the start and end head insets', () => {
    const centerline = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ];
    const trimmedCenterline = [
      { x: 4, y: 0 },
      { x: 24, y: 0 },
    ];

    buildArrowCenterlineMock.mockReturnValue({
      endAngle: 0,
      points: centerline,
      startAngle: Math.PI,
    });
    getArrowHeadAttachmentInsetMock.mockReturnValueOnce(4).mockReturnValueOnce(6);
    trimPolylineMock.mockReturnValue(trimmedCenterline);
    buildArrowHeadPathMock.mockReturnValue('head');

    expect(
      buildFilledArrowPathData(centerline, {
        ...createSettings(),
        startHead: 'block',
        startHeadSize: 2,
        endHeadSize: 3,
      } as never)
    ).toBe('shaft head head');
    expect(getArrowHeadAttachmentInsetMock).toHaveBeenCalledWith('block', 6, 2);
    expect(getArrowHeadAttachmentInsetMock).toHaveBeenCalledWith('triangle', 6, 3);
    expect(trimPolylineMock).toHaveBeenCalledWith(centerline, 4, 6);
    expect(buildShaftOutlinePathMock).toHaveBeenCalledWith(trimmedCenterline, 6);
    expect(buildArrowHeadPathMock).toHaveBeenCalledWith('block', centerline[0], Math.PI * 2, 6, 2);
    expect(buildArrowHeadPathMock).toHaveBeenCalledWith('triangle', centerline[1], 0, 6, 3);
  });
}

function registerDynamicShaftTest() {
  it('uses the dynamic shaft builder for standard arrows with dynamic width', () => {
    const centerline = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ];

    buildArrowCenterlineMock.mockReturnValue({
      endAngle: 0,
      points: centerline,
      startAngle: 0,
    });
    buildDynamicShaftOutlinePathMock.mockReturnValue('dynamic-shaft');
    buildArrowHeadPathMock.mockReturnValue('');

    expect(
      buildFilledArrowPathData(centerline, { ...createSettings(), dynamicWidth: true } as never)
    ).toBe('dynamic-shaft');
    expect(buildShaftOutlinePathMock).not.toHaveBeenCalled();
  });
}

describe('arrow visual outline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArrowHeadAttachmentInsetMock.mockReturnValue(0);
    buildShaftOutlinePathMock.mockReturnValue('shaft');
    buildDynamicShaftOutlinePathMock.mockReturnValue('dynamic-shaft');
    trimPolylineMock.mockImplementation((points) => points);
  });

  registerEmptyCenterlineTest();
  registerSinglePointCenterlineTest();
  registerTrimmedCenterlineTest();
  registerDynamicShaftTest();
});
