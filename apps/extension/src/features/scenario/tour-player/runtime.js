import { createTourPlayer } from './controller.js';

const data = globalThis.document.getElementById('tour-data');
const root = globalThis.document.getElementById('tour-player');
if (!data || !root) throw new Error('Missing tour player document');
createTourPlayer(root, JSON.parse(data.textContent));
