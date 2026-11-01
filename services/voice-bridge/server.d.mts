/** Types for the pieces of server.mjs that tests import. */
export function verifyStreamToken(secret: string, token: string, now?: number): { c: string; e: string; o: string; exp: number } | null;
