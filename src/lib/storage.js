import { supabase } from './supabase'

// Drop-in replacement for window.storage used in the Claude artifact.
// Values are stored as JSONB in Supabase — no JSON.stringify/parse needed.

export const sGet = async (key) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('store')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', key)
      .maybeSingle()
    return data?.value ?? null
  } catch {
    return null
  }
}

export const sSet = async (key, value) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('store').upsert(
      { user_id: user.id, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
  } catch {}
}
