// Vercel entry: the whole Express app as one function. Static files are served from public/.
// With DATABASE_URL (Supabase) + MURSHIDAK_SECRET set, all data is persistent. Without them it
// falls back to SQLite in /tmp, which is wiped on cold starts (demo only).
import { createApp } from '../server.js';

export default createApp({ dataDir: process.env.DATA_DIR || '/tmp/murshidak' });
