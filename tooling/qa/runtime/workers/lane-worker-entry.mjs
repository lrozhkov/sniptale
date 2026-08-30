function serializeError(error) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack ?? '' };
  }
  return { message: String(error), name: 'Error', stack: '' };
}

function isQaLaneProcess() {
  return process.env.SNIPTALE_QA_LANE_PROCESS === '1' && typeof process.send === 'function';
}

function readWorkerInput() {
  return new Promise((resolve, reject) => {
    process.once('message', resolve);
    process.once('disconnect', () => reject(new Error('QA lane IPC disconnected before input.')));
  });
}

function sendWorkerResult(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject(new Error('QA lane process requires an IPC channel.'));
      return;
    }
    process.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function postQaLaneWorkerResult(run) {
  if (!isQaLaneProcess()) return;
  try {
    const input = await readWorkerInput();
    await sendWorkerResult({ ok: true, value: await run(input) });
  } catch (error) {
    await sendWorkerResult({ ok: false, error: serializeError(error) });
  } finally {
    process.disconnect();
  }
}
