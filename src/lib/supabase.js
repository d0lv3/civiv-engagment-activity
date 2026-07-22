import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(
  url && anonKey && !url.includes('YOUR-PROJECT-REF') && !anonKey.includes('YOUR-ANON'),
)

// When the env vars are missing we still export a client-shaped object so the
// app can render a helpful setup screen instead of crashing on a white page.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'civic-cloud-auth',
      },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null

export const EVENT_TITLE = import.meta.env.VITE_EVENT_TITLE || 'Voices of Our Community'
