import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { createDesignReferenceServer } from '../../../design-reference/server.mjs';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

let server: Server | undefined;
let origin: string;

test.use({ actionTimeout: 10_000 });

test.beforeAll(async () => {
  await build({
    configFile: resolve('tooling/design-reference/pickers/vite.config.ts'),
    logLevel: 'error',
  });
  server = createDesignReferenceServer();
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Reference server has no TCP port.');
  origin = `http://127.0.0.1:${address.port}/tooling/design-reference/`;
});

test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve()))
    );
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`reference control composition ${viewport.name}`, async ({ page }, info) => {
    await page.setViewportSize(viewport.size);
    await page.goto(origin);
    await expect(page.locator('body')).toHaveCSS('font-weight', '400');
    await page.goto(`${origin}examples/properties/?view=both&mode=examples&lang=ru`);
    await expect(page.locator('.reference-disclosure')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    for (const summary of await page.locator('.reference-disclosure > summary').all()) {
      await summary.scrollIntoViewIfNeeded();
      await expect(summary).toHaveCSS('min-height', '32px');
      await expect(summary).toHaveCSS('padding-left', '8px');
      await expect(summary).toHaveCSS('padding-right', '8px');
      for (const glyph of await summary.locator('svg').all()) {
        const box = (await glyph.boundingBox())!;
        expect(box.width).toBeLessThanOrEqual(16.5);
        expect(box.height).toBeLessThanOrEqual(16.5);
        await expect(glyph).toHaveCSS('fill', 'none');
      }
      await summary.click();
      await expect(summary.locator('..')).toHaveAttribute('open', '');
      await summary.press('Space');
      await expect(summary.locator('..')).not.toHaveAttribute('open');
    }
    await page.screenshot({ path: info.outputPath('properties-disclosure.png'), fullPage: false });
    await page.goto(`${origin}examples/compositions/?view=both&mode=examples&lang=ru`);
    await expect(page.locator('.theme')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    const observations = [];
    for (const theme of await page.locator('.theme').all()) {
      const input = theme.getByRole('spinbutton', { name: 'Размытие фона', exact: true });
      await input.scrollIntoViewIfNeeded();
      const unit = input.locator('..').locator('.number-unit');
      const swatch = theme.locator('.color-swatch').first();
      const edge = await swatch.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.left + (box.width + parseFloat(getComputedStyle(node, '::before').width)) / 2;
      });
      const right = () => unit.evaluate((node) => node.getBoundingClientRect().right);
      const rest = await right();
      expect.soft(Math.abs(rest - edge)).toBeLessThanOrEqual(1.5);
      const family = await unit.evaluate((node) => getComputedStyle(node).fontFamily);
      await expect.soft(input).toHaveCSS('font-family', family, { timeout: 100 });
      await theme
        .locator('.number-label')
        .filter({ hasText: /^Размытие фона$/u })
        .click();
      await expect(input).not.toBeFocused();
      await input.hover();
      expect(Math.abs((await right()) - rest)).toBeLessThanOrEqual(0.5);
      await input.click();
      await expect
        .poll(() =>
          input.evaluate(
            (node: HTMLInputElement) =>
              node.selectionStart === 0 && node.selectionEnd === node.value.length
          )
        )
        .toBe(true);
      await expect(unit).toBeVisible();
      const fiveDigits = await input.evaluate((node) => {
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = getComputedStyle(node).font;
        return context.measureText('00000').width;
      });
      const width = (await input.boundingBox())!.width;
      expect(width).toBeGreaterThanOrEqual(fiveDigits - 0.5);
      observations.push({
        theme: await theme.getAttribute('data-theme'),
        edge,
        rest,
        editing: await right(),
        width,
        fiveDigits,
      });
      expect(Math.abs((await right()) - rest)).toBeLessThanOrEqual(0.5);
      await input.press('Escape');
    }
    await writeFile(
      info.outputPath('mixed-value-edges.json'),
      JSON.stringify(observations, null, 2)
    );
    await page.screenshot({ path: info.outputPath('mixed-value-edges.png'), fullPage: false });
    await page.goto(`${origin}examples/numbers/?view=both&mode=examples&lang=ru`);
    const stepper = page.locator('[data-stepper="true"]').first();
    const radius = stepper.getByRole('spinbutton', { name: 'Радиус', exact: true });
    await expect(radius).toHaveCSS('line-height', '18px');
    await radius.hover();
    await stepper.getByRole('button', { name: 'Радиус — увеличить', exact: true }).click();
    await expect(radius).toHaveValue('25');
    await radius.press('ArrowDown');
    await expect(radius).toHaveValue('20');
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reference choice identity and lifecycle ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await page.goto(`${origin}examples/choices/?view=${theme}&mode=examples&lang=ru`);
      await expect(page.locator('.reference-case')).not.toHaveCount(0);
      const ids = await page.evaluate(async (moduleRoot) => {
        const { createDropdown } = await import(moduleRoot + 'choices.js');
        const { PropertyChoice } = await import(moduleRoot + 'property-choice.js');
        const surface = document.querySelector('.theme');
        if (!surface) throw new Error('Missing reference theme.');
        const host = document.createElement('div');
        host.className = 'case-stage';
        host.id = 'choice-proof';
        surface.prepend(host);
        const options = [
          { value: 'one', label: 'Первый' },
          { value: 'two', label: 'Второй' },
        ];
        const firstField = document.createElement('div');
        host.append(firstField);
        const first = createDropdown(firstField, 'Первый контроль', options, 'one');
        const property = PropertyChoice({ label: 'Общий параметр', options, value: 'one' });
        host.append(property.element);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const fallback = property.element.querySelector('[role="combobox"]');
        const radio = property.element.querySelector<HTMLInputElement>('input[type="radio"]');
        if (!fallback || !radio) throw new Error('Missing property choice controls.');
        const secondField = document.createElement('div');
        host.append(secondField);
        const second = createDropdown(secondField, 'Второй контроль', options, 'one');
        const associations = [
          ...host.querySelectorAll('[aria-controls],[aria-labelledby],label[for]'),
        ].flatMap((node) =>
          ['aria-controls', 'aria-labelledby', 'for'].flatMap((attribute) =>
            (node.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
          )
        );
        return {
          first: first.trigger.id,
          property: radio.name,
          fallback: fallback.id,
          second: second.trigger.id,
          associationsValid: associations.every((id) => document.getElementById(id)),
          idsUnique:
            new Set([...document.querySelectorAll('[id]')].map((node) => node.id)).size ===
            document.querySelectorAll('[id]').length,
        };
      }, `${origin}examples/shared/`);
      const firstSerial = Number(ids.first.replace('choice-', ''));
      expect(ids.property).toBe(`property-${firstSerial + 1}`);
      expect(ids.fallback).toBe(`choice-${firstSerial + 2}`);
      expect(ids.second).toBe(`choice-${firstSerial + 3}`);
      expect(ids.associationsValid).toBe(true);
      expect(ids.idsUnique).toBe(true);
      const first = page.locator(`#${ids.first}`);
      const second = page.locator(`#${ids.second}`);
      await first.click();
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await second.click();
      await expect(first).toHaveAttribute('aria-expanded', 'false');
      await expect(second).toHaveAttribute('aria-expanded', 'true');
      await page
        .getByRole('listbox', { name: 'Второй контроль' })
        .getByRole('option', { name: 'Второй', exact: true })
        .click();
      await expect(second).toHaveText('Второй');
      await second.click();
      await second.press('Escape');
      await expect(second).toBeFocused();
      await expect(second).toHaveText('Второй');
      const property = page.locator('#choice-proof .property-group');
      await property.getByRole('radio', { name: 'Второй', exact: true }).check();
      await second.focus();
      await property.evaluate((node) => {
        node.style.width = '40px';
      });
      await expect(property).toHaveAttribute('data-presentation', 'dropdown');
      await expect(property.getByRole('combobox')).toHaveText('Второй');
      await property.getByRole('combobox').click();
      await page
        .getByRole('listbox', { name: 'Общий параметр' })
        .getByRole('option', { name: 'Первый', exact: true })
        .click();
      await second.focus();
      await property.evaluate((node) => {
        node.style.width = '320px';
      });
      await expect(property).toHaveAttribute('data-presentation', 'segments');
      await expect(property.getByRole('radio', { name: 'Первый', exact: true })).toBeChecked();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#choice-proof').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('choice-lifecycle.png'), fullPage: false });
    });

    test(`reference layer identity and recovery ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await page.goto(`${origin}examples/layers/?view=${theme}&mode=examples&lang=ru`);
      await expect(page.locator('.reference-case')).not.toHaveCount(0);
      const ids = await page.evaluate(async (moduleRoot) => {
        const { AnchoredLayer } = await import(moduleRoot + 'layers.js');
        const { ModalDialog } = await import(moduleRoot + 'modal-dialog.js');
        const { InlineCurtain } = await import(moduleRoot + 'inline-curtain.js');
        const { CommandMenu } = await import(moduleRoot + 'command-menu.js');
        const surface = document.querySelector('.theme');
        if (!surface) throw new Error('Missing reference theme.');
        const host = document.createElement('div');
        host.id = 'layer-proof';
        host.className = 'case-stage';
        surface.prepend(host);
        const button = (text: string) => {
          const node = document.createElement('button');
          node.type = 'button';
          node.textContent = text;
          host.append(node);
          return node;
        };
        const anchor = button('Открыть связанный слой');
        const content = document.createElement('button');
        content.textContent = 'Внутри слоя';
        const anchored = AnchoredLayer({ trigger: anchor, content, label: 'Связанный слой' });
        const modalTrigger = button('Открыть модальную проверку');
        const output = document.createElement('output');
        output.id = 'modal-proof-result';
        output.textContent = 'Не изменено';
        host.append(output);
        const modal = ModalDialog({
          theme: surface,
          title: 'Модальная проверка',
          content: document.createElement('input'),
          onAccept: () => {
            output.textContent = 'Принято';
          },
        });
        modalTrigger.addEventListener('click', () => modal.open(modalTrigger));
        let loads = 0;
        const curtain = InlineCurtain({
          label: 'Устройство проверки',
          value: 'first',
          options: [{ value: 'first', label: 'Первый микрофон' }],
          load: async () => {
            if (++loads === 1) throw new Error('Fixture acquisition refusal.');
            return [
              { value: 'first', label: 'Первый микрофон' },
              { value: 'second', label: 'Второй микрофон' },
            ];
          },
        });
        host.append(curtain.element);
        const sibling = document.createElement('button');
        sibling.id = 'curtain-sibling';
        sibling.textContent = 'Соседнее действие';
        curtain.element.append(sibling);
        const inertSibling = document.createElement('button');
        inertSibling.id = 'curtain-originally-inert';
        inertSibling.inert = true;
        curtain.element.append(inertSibling);
        const menu = CommandMenu({
          label: 'Команда проверки',
          items: [
            {
              label: 'Выполнить проверку',
              action: () => {
                output.textContent = 'Команда выполнена';
              },
            },
          ],
        });
        host.append(menu.trigger);
        menu.mount();
        button('После команды');
        const associations = [
          anchor,
          anchored.pane,
          modal.pane,
          curtain.trigger,
          curtain.panel,
        ].flatMap((node) =>
          ['aria-controls', 'aria-labelledby', 'aria-describedby'].flatMap((attribute) =>
            (node.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
          )
        );
        return {
          anchored: anchored.pane.id,
          modalTitle: modal.pane.getAttribute('aria-labelledby'),
          curtain: curtain.panel.id,
          associationsValid: associations.every((id) => document.getElementById(id)),
        };
      }, `${origin}examples/shared/`);
      const serial = Number(ids.anchored.replace('anchored-', ''));
      expect(ids.modalTitle).toBe(`modal-title-${serial + 1}`);
      expect(ids.curtain).toBe(`reference-curtain-${serial + 2}`);
      expect(ids.associationsValid).toBe(true);
      const anchor = page.getByRole('button', { name: 'Открыть связанный слой', exact: true });
      const modalTrigger = page.getByRole('button', {
        name: 'Открыть модальную проверку',
        exact: true,
      });
      await anchor.click();
      await expect(page.getByRole('dialog', { name: 'Связанный слой' })).toBeVisible();
      await page.getByRole('button', { name: 'Внутри слоя', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(modalTrigger).toBeFocused();
      await expect(page.getByRole('dialog', { name: 'Связанный слой' })).toBeHidden();
      await modalTrigger.click();
      const modal = page.getByRole('dialog', { name: 'Модальная проверка' });
      await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
      await expect(modalTrigger).toBeFocused();
      await expect(page.locator('#modal-proof-result')).toHaveText('Не изменено');
      await modalTrigger.click();
      await modal.getByRole('button', { name: 'Применить', exact: true }).click();
      await expect(modalTrigger).toBeFocused();
      await expect(page.locator('#modal-proof-result')).toHaveText('Принято');
      const command = page.getByRole('button', { name: 'Команда проверки', exact: true });
      await command.focus();
      await command.press('ArrowDown');
      await page.getByRole('menuitem', { name: 'Выполнить проверку', exact: true }).press('Tab');
      await expect(page.getByRole('button', { name: 'После команды', exact: true })).toBeFocused();
      await command.click();
      await page.getByRole('menuitem', { name: 'Выполнить проверку', exact: true }).press('Escape');
      await expect(command).toBeFocused();
      const curtain = page.locator(`#${ids.curtain}`);
      const trigger = page.locator('#layer-proof .curtain-trigger');
      await trigger.click();
      await expect(curtain.getByRole('alert')).toContainText('Принятый выбор сохранён');
      await expect(page.locator('#curtain-sibling')).toHaveAttribute('inert', '');
      await curtain.getByRole('button', { name: 'Повторить', exact: true }).click();
      await curtain.getByRole('option', { name: 'Второй микрофон', exact: true }).click();
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText('Второй микрофон');
      await expect(page.locator('#curtain-sibling')).not.toHaveAttribute('inert', '');
      await expect(page.locator('#curtain-originally-inert')).toHaveAttribute('inert', '');
      await trigger.click();
      await curtain.getByRole('button', { name: 'Назад', exact: true }).press('Escape');
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText('Второй микрофон');
      await expect(curtain).toBeHidden();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#layer-proof').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('layer-recovery.png'), fullPage: false });
    });

    test(`reference collection restore continuity ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await page.goto(`${origin}examples/collections/?view=${theme}&mode=examples&lang=ru`);
      const rows = page.locator('[data-case="collections.rows"]');
      await rows.getByRole('checkbox', { name: 'Выбрать Вступление', exact: true }).check();
      await rows.getByRole('button', { name: 'Удалить выбранные', exact: true }).click();
      const undo = rows.getByRole('button', { name: 'Восстановить удалённые', exact: true });
      await expect(undo).toBeFocused();
      await expect(rows.getByRole('button', { name: 'Вступление', exact: true })).toHaveCount(0);
      await undo.click();
      await expect(rows.getByRole('button', { name: 'Вступление', exact: true })).toBeVisible();
      await expect(
        rows.getByRole('checkbox', { name: 'Выбрать Вступление', exact: true })
      ).toBeChecked();
      await expect(
        rows.getByRole('button', { name: 'Удалить выбранные', exact: true })
      ).toBeFocused();
      const notes = page.locator('[data-case="collections.inline-notes"]');
      await notes.getByRole('button', { name: 'Изменить комментарий', exact: true }).click();
      await notes
        .getByRole('textbox', { name: 'Комментарий', exact: true })
        .fill('Не сохранять этот черновик');
      await notes.getByRole('button', { name: 'Отменить редактирование', exact: true }).click();
      await expect(
        notes.getByRole('button', { name: 'Сделать переход короче', exact: true })
      ).toBeFocused();
      const resource = page.locator('[data-case="collections.resource"]');
      const replace = resource.getByRole('button', { name: 'Заменить изображение', exact: true });
      await replace.click();
      await page.getByRole('menuitem', { name: 'Из библиотеки', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Выбрать изображение', exact: true });
      await dialog.getByRole('radio', { name: 'Графит', exact: true }).check();
      await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
      await expect(replace).toBeFocused();
      await expect(resource.getByRole('img', { name: 'Текущий фон', exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await resource.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('collection-restore.png'), fullPage: false });
    });

    test(`reference composition module closure ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport.size);
      await page.goto(`${origin}examples/compositions/?view=${theme}&mode=examples&lang=ru`);
      await expect(page.locator('.composition-stage')).toHaveCount(11);
      for (const stage of await page.locator('.composition-stage').all()) {
        await expect(stage.locator('button,input,textarea').first()).toBeAttached();
      }
      await page.evaluate(() => document.fonts.ready);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath('composition-module-closure.png'),
        fullPage: false,
      });
    });
  }
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reference picker geometry and editing ${viewport.name} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await page.goto(`${origin}examples/layers/?view=${theme}&mode=examples&lang=ru`);
      const color = page.locator(
        '[data-picker-reference="color"] [data-ui="shared.ui.color-selector.picker"]'
      );
      await expect(color).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(color).toHaveCSS('width', '304px');
      const plane = color.locator('.sniptale-color-plane');
      const short = viewport.size.height <= 650;
      await expect(plane).toHaveCSS('height', short ? '106px' : '154px');
      const swatch = color
        .locator('[data-ui="shared.ui.color-selector.picker-palette"] button')
        .first()
        .locator('span')
        .first();
      await expect(swatch).toHaveCSS('width', '18px');
      await expect(swatch).toHaveCSS('height', '18px');
      expect(
        await swatch.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))
      ).toBeGreaterThanOrEqual(9);
      await expect(color.locator('.sniptale-color-plane-ring')).toHaveCSS(
        'border-top-color',
        'rgb(255, 255, 255)'
      );
      const initialHeight = (await color.boundingBox())!.height;
      expect(Math.abs(initialHeight - (short ? 418 : 466))).toBeLessThanOrEqual(1);
      const hex = color.getByRole('textbox', { name: 'HEX', exact: true });
      await expect(hex).toHaveValue('#FA7116');
      await expect(hex).toHaveCSS('border-top-width', '1px');
      await hex.fill('#33669980');
      await hex.press('Enter');
      await expect(
        color.getByRole('spinbutton', { name: 'Прозрачность', exact: true })
      ).toHaveValue('50');
      await color.getByRole('button', { name: 'Исходный', exact: true }).click();
      await expect(hex).toHaveValue('#FA7116');
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copy = color.getByRole('button', { name: 'Копировать цвет', exact: true });
      await copy.click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe('#FA7116A6');
      await expect(copy).toBeEnabled();
      await expect(copy).toHaveCSS('cursor', 'pointer');
      await color.getByRole('button', { name: 'RGB', exact: true }).click();
      await expect(color.locator('.sniptale-picker-number')).toHaveCount(4);
      await color.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('picker-color-full.png'), fullPage: false });
      await color.getByRole('button', { name: 'Компактный режим', exact: true }).click();
      await expect(color.getByRole('textbox', { name: 'HEX', exact: true })).toHaveCount(0);
      expect(
        Math.abs((await color.boundingBox())!.height - (short ? 290 : 338))
      ).toBeLessThanOrEqual(1);
      await color.getByRole('button', { name: 'Полный режим', exact: true }).click();
      const paint = page.locator(
        '[data-picker-reference="paint"] [data-ui="shared.ui.paint-selector.popup"]'
      );
      await paint.scrollIntoViewIfNeeded();
      await expect(paint).toHaveCSS('width', '620px');
      await expect(paint.locator('[data-ui="shared.ui.paint-selector.canvas"]')).toHaveCSS(
        'height',
        '106px'
      );
      const direction = paint.locator('[data-gradient-handle="direction"]');
      const before = Number(await direction.getAttribute('aria-valuenow'));
      await direction.focus();
      await direction.press('ArrowRight');
      await expect(direction).toHaveAttribute('aria-valuenow', String((before + 1) % 360));
      await direction.press('Control+z');
      await expect(direction).toHaveAttribute('aria-valuenow', String(before));
      await direction.press('Control+Shift+z');
      await expect(direction).toHaveAttribute('aria-valuenow', String((before + 1) % 360));
      const handle = (await direction.boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await expect
        .poll(() => direction.evaluate((element) => getComputedStyle(element).cursor))
        .toBe('none');
      await page.mouse.move(handle.x + 20, handle.y + 25);
      await page.mouse.up();
      await expect
        .poll(() => direction.evaluate((element) => getComputedStyle(element).cursor))
        .not.toBe('none');
      await paint.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('picker-gradient-full.png'), fullPage: false });
      const footerBefore = (await paint.boundingBox())!.height;
      await paint.getByRole('button', { name: 'Сохранить в шаблоны', exact: true }).click();
      const save = page.locator(
        '[data-picker-reference="paint"] [data-ui="shared.ui.paint-selector.template-save"]'
      );
      await expect(save).toBeVisible();
      await expect(save).toHaveCSS('height', '82px');
      expect(Math.abs((await paint.boundingBox())!.height - footerBefore)).toBeLessThanOrEqual(1);
      await save.getByRole('textbox').fill('Проверка миграции');
      await save.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const templates = paint.locator('[data-ui="shared.ui.paint-selector.templates"]');
      await expect(
        templates.getByRole('button', { name: 'Проверка миграции', exact: true })
      ).toBeVisible();
      await paint.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('picker-templates.png'), fullPage: false });
      await paint.getByRole('button', { name: 'Градиент', exact: true }).first().click();
      await paint.getByRole('button', { name: 'Компактный режим', exact: true }).click();
      await expect(paint.locator('[data-ui="shared.ui.paint-selector.canvas"]')).toHaveCSS(
        'height',
        '80px'
      );
      await page.screenshot({
        path: info.outputPath('picker-gradient-compact.png'),
        fullPage: false,
      });
      await page
        .locator('[data-picker-reference="paint"]')
        .getByRole('button', { name: 'Редактор шаблона', exact: true })
        .click();
      const toolbar = paint.locator('[data-ui="shared.ui.paint-selector.stop-toolbar"]');
      const name = toolbar.getByRole('textbox', { name: 'Название шаблона', exact: true });
      await name.fill('Мой градиент');
      await expect(name).toHaveValue('Мой градиент');
      await expect(name).toHaveCSS('height', '28px');
      const nameBox = (await name.boundingBox())!;
      const toolbarBox = (await toolbar.boundingBox())!;
      expect(Math.abs(nameBox.y - toolbarBox.y)).toBeLessThanOrEqual(0.5);
      expect(nameBox.x).toBeCloseTo(toolbarBox.x, 0);
      await page.screenshot({ path: info.outputPath('picker-template-name.png'), fullPage: false });
    });
  }
}
