import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyToken, verifyTokenVersion } from './auth/lib/auth.js';
import { notifyProfileChanged } from './sse/profileNotifier.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح به' });
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { table, columns, filters, order, method = 'select', data: insertData } = body;

    if (!table || typeof table !== 'string') {
      return res.status(400).json({ error: 'Table name is required' });
    }

    const supabase = getSupabaseAdmin();

    const versionValid = await verifyTokenVersion(supabase, payload.userId, payload.tokenVersion);
    if (!versionValid) {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    let query: any;

    switch (method) {
      case 'select': {
        query = supabase.from(table).select(columns || '*');
        if (filters) {
          for (const filter of filters) {
            if (filter.method === 'eq') query = query.eq(filter.column, filter.value);
            else if (filter.method === 'neq') query = query.neq(filter.column, filter.value);
            else if (filter.method === 'in') query = query.in(filter.column, filter.value);
            else if (filter.method === 'maybeSingle') query = query.maybeSingle();
            else if (filter.method === 'single') query = query.single();
            else if (filter.method === 'order') {
              query = query.order(filter.column, { ascending: filter.ascending ?? false });
            }
          }
        }
        break;
      }
      case 'insert': {
        if (!insertData) return res.status(400).json({ error: 'Insert data is required' });
        query = supabase.from(table).insert(insertData as any).select();
        break;
      }
      case 'update': {
        if (!insertData || !filters) return res.status(400).json({ error: 'Update data and filters are required' });
        query = (supabase as any).from(table).update(insertData);
        for (const filter of filters) {
          if (filter.method === 'eq') query = query.eq(filter.column, filter.value);
        }
        break;
      }
      case 'delete': {
        if (!filters) return res.status(400).json({ error: 'Delete filters are required' });
        query = supabase.from(table).delete();
        for (const filter of filters) {
          if (filter.method === 'eq') query = query.eq(filter.column, filter.value);
        }
        break;
      }
      default:
        return res.status(400).json({ error: `Unsupported method: ${method}` });
    }

    const { data, error } = await (query as any);

    if (error) {
      console.error(`Query error (${table}):`, error);
      return res.status(400).json({ error: error.message });
    }

    if (table === 'profiles' && (method === 'update' || method === 'insert')) {
      const userId = filters?.find((f: any) => f.method === 'eq' && f.column === 'id')?.value;
      if (userId) {
        notifyProfileChanged(userId);
      }
    }

    return res.status(200).json({ data });
  } catch (error: any) {
    console.error('Query proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
