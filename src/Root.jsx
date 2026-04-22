import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Auth from './Auth.jsx'
import App from './App.jsx'

export default function Root() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight:'100vh', background:'#F7F5F2', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <p style={{ color:'#D4622A', fontFamily:'Georgia,serif', fontSize:'14px', letterSpacing:'0.1em' }}>Loading…</p>
    </div>
  )

  if (!session) return <Auth />

  return <App session={session} />
}
