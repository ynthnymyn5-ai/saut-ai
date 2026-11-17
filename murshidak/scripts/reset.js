// Wipe the local database and encrypted uploads, then re-seed sample data on next start.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['murshidak.db', 'murshidak.db-wal', 'murshidak.db-shm']) fs.rmSync(path.join(dir, f), { force: true });
fs.rmSync(path.join(dir, 'uploads'), { recursive: true, force: true });
console.log('Reset done:', dir);
