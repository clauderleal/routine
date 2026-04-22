import { useState } from 'react'
import { supabase } from './lib/supabase'

const C = {
  bg: '#F7F5F2', surface: '#FFFFFF', border: '#E2DDD8',
  textHi: '#1A1714', textMd: '#4A4540', textLo: '#8C857D',
  accent: '#D4622A', accentLt: '#FBE9E0', green: '#2A7A4B', greenLt: '#D6F0E2',
}

export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'sent'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) setError(error.message)
        else setMode('sent')
      }
    } catch (e) {
      setError('Something went wrong. Try again.')
    }
    setLoading(false)
  }

  const s = {
    wrap: { minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:"'Inter',-apple-system,sans-serif" },
    card: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:'20px', padding:'36px 32px', width:'100%', maxWidth:'380px', boxShadow:'0 4px 24px rgba(0,0,0,0.06)' },
    title: { fontFamily:"'Lora',serif", fontSize:'28px', fontWeight:700, color:C.textHi, marginBottom:'6px' },
    sub: { fontSize:'13px', color:C.textLo, marginBottom:'28px', lineHeight:1.5 },
    label: { fontSize:'11px', fontWeight:700, color:C.textLo, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'6px', display:'block' },
    input: { width:'100%', padding:'12px 14px', border:`1.5px solid ${C.border}`, borderRadius:'10px', fontSize:'14px', fontFamily:'inherit', outline:'none', color:C.textHi, background:C.surface, boxSizing:'border-box', marginBottom:'14px', WebkitAppearance:'none' },
    btn: { width:'100%', padding:'13px', background:C.accent, color:'#fff', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' },
    link: { background:'none', border:'none', color:C.accent, fontSize:'13px', cursor:'pointer', fontFamily:'inherit', fontWeight:600, textDecoration:'underline' },
    error: { fontSize:'12px', color:'#C0321A', background:'#FCE4DE', padding:'10px 12px', borderRadius:'8px', marginBottom:'14px', lineHeight:1.5 },
  }

  if (mode === 'sent') return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={s.title}>Check your email ✉️</p>
        <p style={{ ...s.sub, marginBottom:0 }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and log in.</p>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Lora:wght@700&display=swap')`}</style>
      <div style={s.card}>
        <p style={s.title}>Routine<span style={{ color:C.accent }}>.</span></p>
        <p style={s.sub}>{mode === 'login' ? 'Welcome back. Sign in to your account.' : 'Create an account to get started.'}</p>

        {error && <div style={s.error}>{error}</div>}

        <label style={s.label}>Email</label>
        <input style={s.input} type="email" placeholder="you@email.com" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border} />

        <label style={s.label}>Password</label>
        <input style={{ ...s.input, marginBottom:'20px' }} type="password" placeholder="••••••••" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border} />

        <button style={s.btn} onClick={handle} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <p style={{ textAlign:'center', marginTop:'18px', fontSize:'13px', color:C.textLo }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={s.link} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
