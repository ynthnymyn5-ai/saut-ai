// Vercel serverless entry: handles every /api/* request with the same code as server.js.
'use strict';
const { createHandler } = require('../lib/server');

let handler;
module.exports = (req, res) => {
  handler ||= createHandler();
  // vercel.json rewrites /api/<path> to /api/index?__p=<path>; restore the original path.
  const u = new URL(req.url, 'http://localhost');
  const p = u.searchParams.get('__p');
  if (u.pathname === '/api/index' && p !== null) {
    u.searchParams.delete('__p');
    req.url = '/api/' + p + u.search;
  }
  return handler(req, res);
};
