// api/create-user.js — crea usuario usando service key server-side (nunca expuesta)
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Verify the requesting user is admin via their JWT
  const authHeader = req.headers.authorization || '';
  const userJwt = authHeader.replace('Bearer ', '');
  if (!userJwt) return res.status(401).json({ error: 'Unauthorized' });

  // Validate JWT belongs to an admin
  const verifyResp = await fetch(`${supabaseUrl}/rest/v1/users?select=role`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${userJwt}`,
      'Content-Type': 'application/json'
    }
  });
  if (!verifyResp.ok) return res.status(401).json({ error: 'Invalid token' });
  const userData = await verifyResp.json();
  if (!userData?.[0] || !['admin'].includes(userData[0].role)) {
    return res.status(403).json({ error: 'Admin role required' });
  }

  const { email, password, name, role, advisor_code } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // Create auth user
    const authResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role } })
    });
    const authData = await authResp.json();
    if (!authResp.ok) throw new Error(authData.message || authData.error || 'Auth error');

    // Create profile
    await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: authData.id, email, name, role: role||'advisor', advisor_code: advisor_code||null, active: true })
    });

    return res.status(200).json({ success: true, id: authData.id });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
