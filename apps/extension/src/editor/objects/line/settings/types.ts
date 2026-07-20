import type { EditorLineSettings } from '../../../../features/editor/document/line-types';

export type LineRoughFillSettings = Pick<
  EditorLineSettings,
  | 'roughFillStyle'
  | 'roughFillColor'
  | 'roughFillGap'
  | 'roughFillAngle'
  | 'roughFillWeight'
  | 'roughFillRoughness'
  | 'roughFillBowing'
  | 'roughFillOpacity'
>;
