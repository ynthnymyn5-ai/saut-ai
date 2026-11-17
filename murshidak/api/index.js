// Vercel entry: the whole Express app as one function. Static files are served from public/.
// Serverless disk is temporary: /tmp is wiped on cold starts, so this is a demo deployment
// (sample data re-seeds itself). Use a persistent host or a hosted database for real users.
import { createApp } from '../server.js';

process.env.DATA_DIR ||= '/tmp/murshidak';
export default createApp({ dataDir: process.env.DATA_DIR });
