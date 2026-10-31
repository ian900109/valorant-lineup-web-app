import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'

const accessEmail = 'lineup-access@example.com'

type Props = { onUnlocked: () => void; setupError?: string }

export default function SiteAccessGate({ onUnlocked, setupError }: Props) {
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setErrorMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email: accessEmail, password })
    if (error) {
      setErrorMessage('密碼不正確，或網站共用帳號尚未設定。')
      setBusy(false)
      return
    }
    const { data, error: accessError } = await supabase.rpc('can_access_lineup_site')
    if (accessError || !data) {
      await supabase.auth.signOut()
      setErrorMessage(accessError ? '網站權限尚未完成設定，請聯絡管理員。' : '這個帳號沒有網站瀏覽權限。')
      setBusy(false)
      return
    }
    setPassword('')
    onUnlocked()
    setBusy(false)
  }

  return <main className="site-gate-shell">
    <section className="site-gate-card">
      <div className="site-gate-icon"><LockKeyhole size={22} /></div>
      <div className="eyebrow">PRIVATE LINEUP LIBRARY</div>
      <h1>輸入共用密碼</h1>
      <p>輸入管理員提供的密碼，進入 VALORANT 點位資料庫。</p>
      {setupError ? <div className="site-gate-error">{setupError}</div> : <form onSubmit={unlock}>
        <label htmlFor="site-password"><KeyRound size={15} /> 網站密碼</label>
        <input id="site-password" autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {errorMessage && <div className="site-gate-error">{errorMessage}</div>}
        <button className="primary" type="submit" disabled={busy || !password}>{busy ? '驗證中…' : '解鎖網站'}</button>
      </form>}
      <small>網站內容需通過 Supabase 權限驗證後才會載入。</small>
    </section>
  </main>
}
