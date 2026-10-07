import { readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const names = (await readdir(join(root, 'assets/music'), { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(mp3|ogg|m4a)$/i.test(entry.name))
  .map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'en'));
const tracks = names.map(name => ({
  file: `assets/music/${encodeURIComponent(name)}`,
  title: name.replace(/\.(mp3|ogg|m4a)$/i, '').replace(/[-_]+/g, ' ')
}));
await writeFile(join(root, 'assets/music-playlist.json'), `${JSON.stringify({ version: 1, tracks }, null, 2)}\n`);
