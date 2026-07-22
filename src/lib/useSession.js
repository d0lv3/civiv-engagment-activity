import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, isConfigured } from './supabase'

const POLL_MS = 4000

/**
 * Live view of the whole activity: every submitted word plus the two switches
 * the admin controls.
 *
 * Realtime gives the instant update. A slow poll runs alongside it as a safety
 * net — if Realtime is not enabled on the tables, or the room's wifi drops the
 * websocket, the projector still catches up within a few seconds instead of
 * silently freezing in front of a class.
 */
export function useSession() {
  const [words, setWords] = useState([])
  const [settings, setSettings] = useState({
    submissions_open: true,
    speaking_enabled: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [live, setLive] = useState(false)

  const mounted = useRef(true)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!isConfigured || inFlight.current) return
    inFlight.current = true
    try {
      const [wordsRes, settingsRes] = await Promise.all([
        supabase.from('words').select('*').order('created_at', { ascending: true }),
        supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      ])

      if (!mounted.current) return

      if (wordsRes.error) throw wordsRes.error
      setWords(wordsRes.data || [])

      if (settingsRes.data) setSettings(settingsRes.data)
      setError(null)
    } catch (err) {
      if (mounted.current) setError(err.message || String(err))
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true

    if (!isConfigured) {
      setLoading(false)
      return
    }

    refresh()

    const channel = supabase
      .channel('civic-cloud-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'words' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, refresh)
      .subscribe((status) => {
        if (!mounted.current) return
        setLive(status === 'SUBSCRIBED')
        // Anything written between the first fetch and the socket going live
        // would otherwise wait for the next poll, so catch up on connect.
        if (status === 'SUBSCRIBED') refresh()
      })

    const poll = setInterval(refresh, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)

    return () => {
      mounted.current = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      supabase.removeChannel(channel)
    }
  }, [refresh])

  return { words, settings, loading, error, live, refresh, setWords, setSettings }
}
