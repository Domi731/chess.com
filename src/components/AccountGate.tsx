import { ShieldCheck, UserRound } from 'lucide-react'
import { supabaseConfigured } from '../lib/supabase'

export default function AccountGate({ title = 'Gastverbindung wird benötigt.' }: { title?: string }) {
  return <div className="account-gate"><div className="account-gate-icon"><UserRound size={22} /></div><span className="panel-kicker">GASTMODUS</span><h2>{title}</h2><p>{supabaseConfigured ? 'Die anonyme Gastverbindung wird vorbereitet. Dafür ist kein Konto und keine Anmeldung nötig.' : 'Dieses Online-Feature benötigt ein Supabase-Backend. Lokale Partien bleiben ohne Anmeldung spielbar.'}</p><small><ShieldCheck size={13} /> Kostenlos und ohne Login</small></div>
}
