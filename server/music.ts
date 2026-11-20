import { createReadStream, readdirSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../music/', import.meta.url));
const mimeTypes = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'], ['.webm', 'audio/webm'],
]);

export function musicFiles() {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(file => file.isFile() && mimeTypes.has(extname(file.name).toLowerCase()))
      .map(file => file.name)
      .sort((a, b) => a.localeCompare(b, 'vi'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error(error);
    return [];
  }
}

export async function serveMusic(req: IncomingMessage, res: ServerResponse) {
  try {
    const path = req.url?.split('?')[0] ?? '';
    if (!path.startsWith('/music/') || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end();
      return;
    }

    const name = decodeURIComponent(path.slice('/music/'.length));
    const type = mimeTypes.get(extname(name).toLowerCase());
    if (!type || !musicFiles().includes(name)) {
      res.writeHead(404).end();
      return;
    }

    const file = join(directory, name);
    const info = await lstat(file);
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }

    const headers: Record<string, string | number> = {
      'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes',
    };
    let start = 0;
    let end = info.size - 1;
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(end, Number(range[2]));
      } else {
        start = Math.max(0, info.size - Number(range[2]));
      }
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      headers['Content-Length'] = end - start + 1;
    }
    res.writeHead(headers['Content-Range'] ? 206 : 200, headers);
    if (req.method === 'HEAD' || info.size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}
