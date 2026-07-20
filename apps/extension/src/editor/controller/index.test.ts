import { expect, it } from 'vitest';
import {
  createImageEditorController as facadeFactory,
  ImageEditorController as FacadeController,
} from './index';
import {
  createImageEditorController as ownerFactory,
  ImageEditorController as OwnerController,
} from './core/controller';

it('keeps the editor controller facade as a transparent core-owner export', () => {
  expect(facadeFactory).toBe(ownerFactory);
  expect(FacadeController).toBe(OwnerController);
});
