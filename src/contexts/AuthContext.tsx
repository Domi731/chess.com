import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { requireSupabase, supabase } from '../lib/supabase'
import type { PlayerProfile } from '../lib/types'

type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: PlayerProfile | null
  loading: boolean
  guestError: string | null
  refreshProfile: () => Promise<void>
  updateProfile: (changes: Partial<Pick<PlayerProfile, 'username' | 'display_name' | 'country' | 'bio' | 'avatar_url'>>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
let guestSignInRequest: Promise<Session | null> | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [guestError, setGuestError] = useState<string | null>(null)

  async function loadProfile(userId: string) {
    const client = requireSupabase()
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    setProfile(data as PlayerProfile | null)
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id)
  }

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }
      window.setTimeout(() => { void loadProfile(nextSession.user.id).catch(() => setProfile(null)) }, 0)
    })

    async function connectGuest() {
      if (!supabase) return
      const client = supabase
      try {
        const { data: sessionData, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        let nextSession = sessionData.session
        if (!nextSession) {
          if (!guestSignInRequest) {
            const guestName = `gast_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
            guestSignInRequest = client.auth.signInAnonymously({
              options: { data: { username: guestName, display_name: 'Gast' } },
            }).then(({ data, error }) => {
              if (error) throw error
              return data.session
            }).finally(() => { guestSignInRequest = null })
          }
          nextSession = await guestSignInRequest
        }
        if (!active) return
        setSession(nextSession)
        setGuestError(null)
        if (nextSession?.user) {
          try { await loadProfile(nextSession.user.id) } catch { setProfile(null) }
        }
      } catch (caught) {
        if (active) setGuestError(caught instanceof Error ? caught.message : 'Gastmodus konnte nicht verbunden werden.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void connectGuest()
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    profile,
    loading,
    guestError,
    refreshProfile,
    updateProfile: async (changes) => {
      if (!session?.user) throw new Error('Das Gastprofil ist noch nicht verbunden.')
      const { error } = await requireSupabase().from('profiles').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', session.user.id)
      if (error) throw error
      await loadProfile(session.user.id)
    },
  }), [session, profile, loading, guestError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth muss innerhalb des AuthProvider verwendet werden.')
  return context
}
