import { expect, type Locator, type Page } from '@playwright/test';

type Surface = Locator | Page;

/** The exact field and the value shown by a closed scale share an accessible name. */
export function numericControl(surface: Surface, name: string) {
  const label = { name, exact: true };
  return surface
    .getByRole('textbox', label)
    .or(surface.getByRole('spinbutton', label))
    .or(surface.getByRole('slider', label));
}

/** Open the scale's pencil before using its exact editor. */
export async function openNumericControl(surface: Surface, name: string) {
  const field = numericControl(surface, name);
  await expect(field).toBeVisible();
  const slider = surface.getByRole('slider', { name, exact: true });
  if (await slider.isVisible()) {
    const frame = slider.locator('xpath=ancestor::*[contains(@class, "opacity-field")]');
    await frame.getByRole('button', { name, exact: true }).click();
  }
  return field;
}
