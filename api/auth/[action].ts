import { VercelRequest, VercelResponse } from '@vercel/node';
import { loginHandler, logoutHandler, meHandler, registerHandler } from './handlers.js';

// Consolidates what used to be 4 separate Vercel Serverless Functions
// (login.ts, logout.ts, me.ts, register.ts) into one, so they count as a
// single function against the Hobby plan's 12-function limit instead of 4.
// The URLs the frontend calls (/api/auth/login, /api/auth/register, etc.)
// are unchanged - Vercel routes them all here and puts the matched segment
// in req.query.action.
const routes: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void>> = {
  login: loginHandler,
  logout: logoutHandler,
  me: meHandler,
  register: registerHandler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const route = routes[action];

  if (!route) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({ error: 'Not found' });
  }

  return route(req, res);
}
