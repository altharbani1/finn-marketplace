import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const allowedOrigins = new Set([
  'https://fann1.netlify.app',
  'https://thner.netlify.app',
  'http://localhost:3000',
  'http://localhost:8080',
])

function json(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://fann1.netlify.app',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  })
}

function storagePath(url: string, bucket: string) {
  try {
    const marker = `/storage/v1/object/public/${bucket}/`
    const pathname = new URL(url).pathname
    return pathname.includes(marker) ? decodeURIComponent(pathname.split(marker)[1]) : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || ''
  if (req.method === 'OPTIONS') return json(origin, { ok: true })
  if (req.method !== 'POST' || (origin && !allowedOrigins.has(origin))) {
    return json(origin, { error: 'Request not allowed' }, 403)
  }

  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) return json(origin, { error: 'Authentication required' }, 401)

  const url = Deno.env.get('SUPABASE_URL') || ''
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const userClient = createClient(url, publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || '')
  const adminClient = createClient(url, secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser(token)
  if (authError || !authData.user) return json(origin, { error: 'Invalid session' }, 401)

  const { data: caller } = await adminClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
  if (caller?.role !== 'admin') return json(origin, { error: 'Administrator access required' }, 403)

  let payload: { request_id?: string }
  try { payload = await req.json() } catch { return json(origin, { error: 'Invalid JSON' }, 400) }
  if (!payload.request_id || !/^[0-9a-f-]{36}$/i.test(payload.request_id)) {
    return json(origin, { error: 'Valid request_id is required' }, 400)
  }

  // The database claims the job with a conditional UPDATE. Exactly one worker
  // can move a pending/failed request into processing.
  const { data: claimedRows, error: claimError } = await adminClient.rpc('claim_account_deletion_request', {
    p_request_id: payload.request_id,
    p_admin_id: authData.user.id,
  })
  const deletionRequest = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows
  if (claimError) {
    console.error('Deletion claim failed', claimError.message)
    return json(origin, { error: 'Unable to claim deletion request' }, 500)
  }
  if (!deletionRequest?.user_id) {
    return json(origin, { error: 'Deletion request is already processing or unavailable' }, 409)
  }

  const targetUserId = deletionRequest.user_id

  try {
    const { data: listings, error: listingsError } = await adminClient.from('listings').select('images').eq('user_id', targetUserId)
    if (listingsError) throw listingsError
    const listingPaths = (listings || []).flatMap((row) => Array.isArray(row.images) ? row.images : [])
      .map((image) => storagePath(String(image), 'listing-images')).filter(Boolean) as string[]
    if (listingPaths.length) {
      const { error: listingStorageError } = await adminClient.storage.from('listing-images').remove(listingPaths)
      if (listingStorageError) throw listingStorageError
    }

    const { data: profile, error: profileError } = await adminClient.from('profiles').select('avatar_url').eq('id', targetUserId).maybeSingle()
    if (profileError) throw profileError
    const avatarPath = storagePath(String(profile?.avatar_url || ''), 'profile-avatars')
    if (avatarPath) {
      const { error: avatarStorageError } = await adminClient.storage.from('profile-avatars').remove([avatarPath])
      if (avatarStorageError) throw avatarStorageError
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)
    if (deleteError) throw deleteError

    const { data: completed, error: completionError } = await adminClient.rpc('complete_account_deletion_request', {
      p_request_id: deletionRequest.request_id,
      p_admin_id: authData.user.id,
    })
    if (completionError || completed !== true) {
      throw completionError || new Error('Deletion completion was not persisted')
    }
    return json(origin, { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const { data: failed, error: failureError } = await adminClient.rpc('fail_account_deletion_request', {
      p_request_id: deletionRequest.request_id,
      p_admin_id: authData.user.id,
      p_failure_reason: message,
    })
    console.error('Account deletion failed', message, failureError?.message || '', failed)
    return json(origin, { error: 'Account deletion failed; the request is marked for safe retry' }, 500)
  }
})
