import { compute } from '/generated/adapter.mjs';
const $ = (id) => globalThis.document.getElementById(id);
const config = await (await fetch('/config.json')).json();
let source = null,
  result = null,
  generation = 0,
  sourceId = null,
  sourceProvenance = null;
const records = [];
const judgments = {
  roles: 'Роли элементов',
  integrity: 'Целостность',
  textResidue: 'Остатки текста',
  style: 'Стиль',
};
for (const [key, title] of Object.entries(judgments)) {
  const label = globalThis.document.createElement('label');
  label.textContent = title;
  const select = globalThis.document.createElement('select');
  select.id = `judge-${key}`;
  for (const [value, text] of [
    ['unreviewed', 'Не проверено'],
    ['pass', 'Принято'],
    ['fail', 'Есть дефект'],
    ['not-applicable', 'Не применимо'],
  ]) {
    const option = globalThis.document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  label.append(select);
  globalThis.document.querySelector('.judgments').append(label);
}
for (const entry of config.cases) {
  const option = globalThis.document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.title;
  $('case').append(option);
}
$('stamp').textContent = `Исходники ${config.stamp.sourceDigest.slice(0, 12)}`;
function busy(value) {
  $('run').disabled = value || !source;
  $('cancel').disabled = !value;
}
function invalidate() {
  generation++;
  compute.cancel();
  result = null;
  $('downloadPng').disabled = true;
  $('saveReview').disabled = true;
  $('timing').textContent = '';
  for (const key of Object.keys(judgments)) $(`judge-${key}`).value = 'unreviewed';
  $('notes').value = '';
}
function settings() {
  return {
    automatic: $('automatic').checked,
    content: $('content').value,
    manualKind: $('manualKind').value,
    sensitivity: Number($('sensitivity').value),
    thickness: Number($('thickness').value),
    color: $('customColor').checked ? $('color').value : null,
  };
}
function region() {
  return Object.fromEntries(
    ['x', 'y', 'width', 'height'].map((key) => [key, Number($(key).value)])
  );
}
function draw(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
}
async function imageFrom(url) {
  const image = new globalThis.Image();
  image.src = url;
  await image.decode();
  return image;
}
async function digest(data) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
async function load(url, id, annotations = [], site = null) {
  invalidate();
  source = null;
  sourceProvenance = null;
  busy(false);
  const own = generation;
  try {
    let provenance = null;
    if (site) {
      $('status').textContent = 'Создаётся снимок выбранного сайта…';
      const response = await fetch(site.captureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error(`FAIL: HTTP ${response.status}`);
      const captured = await response.json();
      if (captured.status !== 'PASS') throw new Error(`${captured.status}: ${captured.reason}`);
      url = captured.dataUrl;
      provenance = captured.provenance;
    }
    if (own !== generation) return;
    const image = await imageFrom(url);
    if (own !== generation) return;
    if (image.width * image.height > 16_777_216)
      throw new Error('Изображение превышает 16 777 216 пикселей');
    draw($('before'), image);
    draw($('after'), image);
    source = {
      dataUrl: $('before').toDataURL('image/png'),
      width: image.width,
      height: image.height,
    };
    sourceId = id;
    sourceProvenance = provenance;
    $('width').value = image.width;
    $('height').value = image.height;
    $('x').value = 0;
    $('y').value = 0;
    $('dimensions').textContent = `${image.width} × ${image.height}`;
    $('roles').textContent = annotations.length
      ? `Эталонные роли: ${annotations.map((role) => `${role.role} [${role.box.join(', ')}]`).join('; ')}`
      : 'Нет разметки ролей. Оцените источник вручную.';
    $('status').textContent = 'Источник готов. Выберите область и параметры.';
    return { status: 'PASS' };
  } catch (error) {
    if (own === generation) {
      $('status').textContent =
        `Источник не открыт: ${error.message}. Выберите другой сайт или загрузите изображение.`;
      return { status: error.message.startsWith('SKIP:') ? 'SKIP' : 'FAIL', reason: error.message };
    }
  } finally {
    if (own === generation) busy(false);
  }
}
async function selectCase(id) {
  const entry = config.cases.find((item) => item.id === id);
  if (!entry) throw new Error('Unknown case');
  $('case').value = id;
  return load(entry.url, entry.id, entry.roles, entry.captureUrl ? entry : null);
}
async function run() {
  if (!source) throw new Error('Источник не выбран');
  const own = ++generation;
  busy(true);
  $('status').textContent = 'Worker обрабатывает область…';
  const input = { source, region: region(), settings: settings() };
  const start = performance.now();
  try {
    const output = await compute.render(input);
    const image = await imageFrom(output.dataUrl);
    if (own !== generation) return null;
    const canvas = $('after');
    draw(canvas, await imageFrom(source.dataUrl));
    canvas.getContext('2d').drawImage(image, input.region.x, input.region.y);
    const sourceHash = await digest(await (await fetch(source.dataUrl)).arrayBuffer());
    if (own !== generation) return null;
    result = {
      caseId: sourceId,
      sourceHash,
      provenance: sourceProvenance,
      settings: input.settings,
      region: input.region,
      version: output.version,
      durationMs: performance.now() - start,
      assessment: Object.fromEntries(Object.keys(judgments).map((key) => [key, 'unreviewed'])),
      notes: '',
      png: canvas.toDataURL('image/png'),
    };
    for (const key of Object.keys(judgments)) $(`judge-${key}`).value = 'unreviewed';
    $('notes').value = '';
    records.push(result);
    $('timing').textContent = `${Math.round(result.durationMs)} мс`;
    $('status').textContent = 'Готово. Проверьте роли, целостность, текст и стиль.';
    $('downloadPng').disabled = false;
    $('saveReview').disabled = false;
    return { ...result, png: undefined };
  } catch (error) {
    if (own === generation) {
      $('status').textContent =
        `Обработка не завершена: ${error.message}. Измените параметры и повторите.`;
      throw error;
    }
    return null;
  } finally {
    if (own === generation) busy(false);
  }
}
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('case').addEventListener('change', () => void selectCase($('case').value));
$('upload').addEventListener('change', async () => {
  const file = $('upload').files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    await load(url, `upload:${file.name}`);
  } finally {
    URL.revokeObjectURL(url);
  }
});
$('run').addEventListener('click', () => void run().catch(() => undefined));
$('cancel').addEventListener('click', () => {
  generation++;
  compute.cancel();
  busy(false);
  $('status').textContent = 'Отменено. Предыдущий результат сохранён.';
});
$('saveReview').addEventListener('click', () => {
  if (!result) return;
  result.assessment = Object.fromEntries(
    Object.keys(judgments).map((key) => [key, $(`judge-${key}`).value])
  );
  result.notes = $('notes').value;
  $('status').textContent = 'Оценка записана в отчёт этой сессии. Скачайте JSON для сохранения.';
});
$('downloadPng').addEventListener('click', async () => {
  if (result) download(`${sourceId}-simplify.png`, await (await fetch(result.png)).blob());
});
function report() {
  return {
    stamp: config.stamp,
    generatedAt: new Date().toISOString(),
    platform: navigator.userAgent,
    results: records.map(({ png: _png, ...record }) => record),
  };
}
$('downloadReport').addEventListener('click', () =>
  download(
    'simplify-report.json',
    new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' })
  )
);
globalThis.window.simplifyLab = {
  selectCase,
  run,
  report,
  configure(value) {
    for (const [key, next] of Object.entries(value)) {
      if (key === 'automatic') $(key).checked = next;
      else if (key === 'color') {
        $('customColor').checked = next !== null;
        if (next) $('color').value = next;
      } else $(key).value = next;
    }
  },
  ready: true,
};
if (config.cases.length) await selectCase(config.cases[0].id);
else $('status').textContent = 'Загрузите изображение для проверки.';
