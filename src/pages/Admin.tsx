import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllLayoutsList, getAllAppointmentsList, updateAppointmentStatus, syncAllWithSupabase } from '../services/storage'
import { supabase } from '../services/supabase'
import { toast } from '../store/toastStore'
import type { SavedLayout, Appointment, AppointmentStatus } from '../types'
import SketchupImporter from '../components/admin/SketchupImporter'
import './Admin.css'

const STATUS_OPTIONS: AppointmentStatus[] = ['novo', 'em_analise', 'confirmado', 'proposta_enviada', 'concluido']
const STATUS_LABELS = {
  novo: { label: 'Novo', cls: 'badge-green' },
  em_analise: { label: 'Em análise', cls: 'badge-amber' },
  confirmado: { label: 'Confirmado', cls: 'badge-blue' },
  proposta_enviada: { label: 'Proposta enviada', cls: 'badge-blue' },
  concluido: { label: 'Concluído', cls: 'badge-gray' },
}

const I = {
  Lock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  Calendar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Map: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></svg>,
  City: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="22" x2="9" y2="16" /><line x1="15" y1="22" x2="15" y2="16" /><line x1="9" y1="16" x2="15" y2="16" /><path d="M8 6h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2z" /></svg>,
  Store: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
  Layout: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>,
  Notes: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  Sketchup: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /><path d="m7 6 2-2 2 2" /></svg>,
}

export default function Admin() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('appointments')
  const [layouts, setLayouts] = useState<SavedLayout[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    const checkSession = async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
          if (profile?.role === 'admin') {
            setAuthed(true)
          } else {
            await supabase.auth.signOut()
          }
        }
      } catch (err) {
        console.warn('Erro ao checar sessão ativa:', err)
      } finally {
        setLoading(false)
      }
    }
    checkSession()
  }, [])

  useEffect(() => {
    if (authed) {
      setLoading(true)
      syncAllWithSupabase().then(() => {
        setLayouts(getAllLayoutsList())
        setAppointments(getAllAppointmentsList())
        setLoading(false)
      }).catch((err) => {
        console.warn('Erro ao sincronizar dados:', err)
        setLayouts(getAllLayoutsList())
        setAppointments(getAllAppointmentsList())
        setLoading(false)
      })
    }
  }, [authed])

  const handleLogin = async () => {
    if (!supabase) {
      toast.error('Erro: Supabase não está configurado.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'admin@projefarma.com.br',
        password: password
      })
      if (error) {
        toast.error('Senha incorreta ou erro de acesso.')
        setLoading(false)
        return
      }
      if (data?.user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
        if (profile?.role === 'admin') {
          setAuthed(true)
          toast.success('Bem-vindo ao painel administrativo!')
        } else {
          await supabase.auth.signOut()
          toast.error('Acesso negado. Apenas administradores.')
        }
      }
    } catch (err) {
      toast.error('Erro ao efetuar login.')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = (id: string, status: AppointmentStatus) => {
    updateAppointmentStatus(id, status)
    setAppointments(getAllAppointmentsList())
    toast.success('Status atualizado!')
  }

  const filteredAppointments = filterStatus
    ? appointments.filter(a => a.status === filterStatus)
    : appointments

  if (loading && !authed) {
    return (
      <div className="admin-login">
        <div className="admin-login-card animate-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <div className="admin-login-icon" style={{ animation: 'pulse 1.5s infinite' }}>
            <I.Lock />
          </div>
          <h1 className="admin-login-title">Carregando...</h1>
          <p className="admin-login-desc">Verificando sessão e sincronizando dados...</p>
        </div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="admin-login">
        <div className="admin-login-card animate-scale-in">
          <div className="admin-login-icon">
            <I.Lock />
          </div>
          <h1 className="admin-login-title">Painel Administrativo</h1>
          <p className="admin-login-desc">Projefarma — Acesso restrito a consultores</p>
          <div className="form-group" style={{ width: '100%' }}>
            <label className="label" htmlFor="admin-pass">Senha de acesso</label>
            <input
              id="admin-pass"
              className="input"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <button id="btn-admin-login" className="btn btn-primary btn-full" onClick={handleLogin}>
            Entrar
          </button>
          <button className="btn btn-ghost btn-sm btn-full" onClick={() => navigate('/')}>
            ← Voltar ao site
          </button>
          <p className="admin-hint">Senha padrão: projefarma2025</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-logo">
            <div className="admin-logo-icon">P</div>
            <div>
              <div className="admin-logo-title">Painel Admin</div>
              <div className="admin-logo-sub">Projefarma</div>
            </div>
          </div>
          <div className="admin-header-stats">
            <div className="admin-stat">
              <div className="admin-stat-val">{appointments.length}</div>
              <div className="admin-stat-label">Agendamentos</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-val">{layouts.length}</div>
              <div className="admin-stat-label">Layouts</div>
            </div>
            <div className="admin-stat">
              <div className="admin-stat-val">{appointments.filter(a => a.status === 'novo').length}</div>
              <div className="admin-stat-label">Novos</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (supabase) await supabase.auth.signOut()
              setAuthed(false)
              navigate('/')
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="admin-tabs">
        <div className="admin-tabs-inner">
          <button
            id="admin-tab-appointments"
            className={`admin-tab ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            <I.Calendar /> Agendamentos ({appointments.length})
          </button>
          <button
            id="admin-tab-layouts"
            className={`admin-tab ${activeTab === 'layouts' ? 'active' : ''}`}
            onClick={() => setActiveTab('layouts')}
          >
            <I.Map /> Layouts ({layouts.length})
          </button>
          <button
            id="admin-tab-sketchup"
            className={`admin-tab ${activeTab === 'sketchup' ? 'active' : ''}`}
            onClick={() => setActiveTab('sketchup')}
          >
            <I.Sketchup /> Modelos SketchUp
          </button>
        </div>
      </div>

      <div className="admin-content">
        {/* APPOINTMENTS TAB */}
        {activeTab === 'appointments' && (
          <div className="admin-section">
            {/* Filter */}
            <div className="admin-filters">
              <button
                className={`filter-chip ${!filterStatus ? 'active' : ''}`}
                onClick={() => setFilterStatus('')}
              >
                Todos
              </button>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`filter-chip ${filterStatus === s ? 'active' : ''}`}
                  onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                >
                  {STATUS_LABELS[s]?.label}
                </button>
              ))}
            </div>

            {filteredAppointments.length === 0 ? (
              <div className="admin-empty">
                <div className="admin-empty-icon">
                  <I.Calendar />
                </div>
                <p>Nenhum agendamento encontrado</p>
              </div>
            ) : (
              <div className="appointments-list">
                {filteredAppointments.map(appt => (
                  <div key={appt.id} className="appointment-card card">
                    <div className="appt-header">
                      <div className="appt-client">
                        <div className="appt-avatar">{appt.name?.[0] || '?'}</div>
                        <div>
                          <div className="appt-name">{appt.name}</div>
                          <div className="appt-contact">{appt.email} · {appt.phone}</div>
                        </div>
                      </div>
                      <span className={`badge ${STATUS_LABELS[appt.status]?.cls || 'badge-gray'}`}>
                        {STATUS_LABELS[appt.status]?.label || appt.status}
                      </span>
                    </div>

                    <div className="appt-details">
                      <div className="appt-detail">
                        <I.Calendar /> {appt.date ? new Date(appt.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'} às {appt.time}
                      </div>
                      <div className="appt-detail">
                        <I.City /> {appt.city}
                      </div>
                      <div className="appt-detail">
                        <I.Store /> {appt.storeType}
                      </div>
                      {appt.layoutId && (
                        <div className="appt-detail">
                          <I.Layout /> Layout vinculado
                        </div>
                      )}
                      {appt.notes && (
                        <div className="appt-detail appt-notes">
                          <I.Notes /> {appt.notes}
                        </div>
                      )}
                    </div>

                    <div className="appt-actions">
                      <select
                        className="input input-sm"
                        value={appt.status}
                        onChange={e => handleStatusChange(appt.id, e.target.value as AppointmentStatus)}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]?.label}</option>
                        ))}
                      </select>
                      {appt.layoutId && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/editor/${appt.layoutId}`)}
                        >
                          Ver Layout
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LAYOUTS TAB */}
        {activeTab === 'layouts' && (
          <div className="admin-section">
            {layouts.length === 0 ? (
              <div className="admin-empty">
                <div className="admin-empty-icon">
                  <I.Map />
                </div>
                <p>Nenhum layout criado ainda</p>
              </div>
            ) : (
              <div className="layouts-grid">
                {layouts.map(layout => (
                  <div key={layout.id} className="layout-admin-card card">
                    {layout.thumbnail ? (
                      <img className="layout-thumb" src={layout.thumbnail} alt="Layout thumbnail" />
                    ) : (
                      <div className="layout-thumb-placeholder">
                        <I.Map />
                      </div>
                    )}
                    <div className="layout-admin-info">
                      <div className="layout-admin-name">{layout.layoutName || 'Layout sem nome'}</div>
                      <div className="layout-admin-size">{layout.storeWidth}m × {layout.storeHeight}m · {layout.storeType}</div>
                      <div className="layout-admin-date">
                        {layout.items?.length || 0} itens · {new Date(layout.updatedAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className="layout-admin-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/editor/${layout.id}`)}
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* SKETCHUP TAB */}
        {activeTab === 'sketchup' && (
          <div className="admin-section">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.5rem' }}>
                📥 Importar Modelos do SketchUp
              </h2>
              <p style={{ color: 'var(--text-3)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                Faça upload do print de cima dos layouts criados pelos seus projetistas no SketchUp.
                A IA analisará a imagem, detectará os móveis e aprenderá os padrões para usar nos próximos projetos.
              </p>
            </div>
            <SketchupImporter />
          </div>
        )}
      </div>
    </div>
  )
}
