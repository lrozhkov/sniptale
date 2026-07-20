import { expect, it } from 'vitest';
import { pickNumericWebcamActualSettings } from './webcam-actual-settings';

it('picks only numeric webcam track settings', () => {
  expect(
    pickNumericWebcamActualSettings({
      frameRate: 30,
      height: 720,
      width: 1280,
    })
  ).toEqual({ frameRate: 30, height: 720, width: 1280 });
  expect(pickNumericWebcamActualSettings({ aspectRatio: 1.7 })).toEqual({});
});
