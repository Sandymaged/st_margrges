import { VercelRequest, VercelResponse } from '@vercel/node';
import { statusHandler, createAccountHandler, deleteUserHandler, updatePasswordHandler, updatePhoneHandler } from './handlers.js';

// Consolidates what used to be 5 separate Vercel Serverless Functions
// (status.ts, create-account.ts, delete-user.ts, update-password.ts, update-phone.ts)
// into one, so they count as a single function against the Hobby plan's
// 12-function limit instead of 5. The URLs the frontend calls
// (/api/admin/update-phone, /api/admin/delete-user, etc.) are unchanged -
// Vercel routes them all here and puts the matched segment in req.query.action.
const routes: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void>> = {
  status: statusHandler,
  'create-account': createAccountHandler,
  'delete-user': deleteUserHandler,
  'update-password': updatePasswordHandler,
  'update-phone': updatePhoneHandler,
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
