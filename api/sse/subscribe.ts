import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyToken, verifyTokenVersion } from '../auth/lib/auth.js';
import { sseManager } from './events.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ error: 'غير مصرح به' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    const supabase = getSupabaseAdmin();
    const versionValid = await verifyTokenVersion(supabase, payload.userId, payload.tokenVersion);
    if (!versionValid) {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected', userId: payload.userId })}\n\n`);

    const clientId = `${payload.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client = {
      id: clientId,
      res,
      userId: payload.userId,
      connectedAt: new Date(),
    };

    sseManager.addClient(payload.userId, client);

    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(keepalive);
      sseManager.removeClient(payload.userId, client);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  } catch (error: any) {
    console.error('[SSE] Subscription error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
}
