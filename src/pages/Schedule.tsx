import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { saveAppointment, getLayoutById } from '../services/storage'
import { supabase } from '../services/supabase'
import { toast } from '../store/toastStore'
import type { Appointment } from '../types'
import './Schedule.css'

const STORE_TYPES = ['Popular', 'Premium', 'Manipulação', 'Completa', 'Outro']
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']

const STEPS = ['Dados Pessoais', 'Sua Farmácia', 'Data e Hora', 'Confirmação']

const I = {
  User: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Store: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
  Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Clock: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Check: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12" /></svg>,
  CheckCircle: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  Email: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  Phone: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
  Layout: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>,
  Notes: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  City: (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="22" x2="9" y2="16" /><line x1="15" y1="22" x2="15" y2="16" /><line x1="9" y1="16" x2="15" y2="16" /><path d="M8 6h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2z" /></svg>
}

export default function Schedule() {
  const navigate = useNavigate()
  const { layoutId } = useParams()
  const layout = layoutId ? getLayoutById(layoutId) : null

  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState<Appointment | null>(null)
  const [form, setForm] = useState(() => {
    let clientName = ''
    let clientPhone = ''
    let clientCity = ''
    try {
      const rawDetails = sessionStorage.getItem('projefarma_client_details')
      if (rawDetails) {
        const details = JSON.parse(rawDetails)
        clientName = details.clientName || ''
        clientPhone = details.phone || ''
        if (details.city && details.state) {
          clientCity = `${details.city}, ${details.state}`
        } else {
          clientCity = details.city || ''
        }
      }
    } catch (e) {
      console.warn('Erro ao ler detalhes do cliente:', e)
    }

    let typeFromLayout = 'Popular'
    if (layout?.storeType) {
      if (layout.storeType === 'popular') typeFromLayout = 'Popular'
      else if (layout.storeType === 'premium') typeFromLayout = 'Premium'
      else if (layout.storeType === 'manipulacao') typeFromLayout = 'Manipulação'
      else if (layout.storeType === 'completa') typeFromLayout = 'Completa'
    }

    return {
      name: clientName,
      email: '',
      phone: clientPhone,
      city: clientCity,
      storeType: typeFromLayout,
      storeArea: layout ? `${layout.storeWidth}m × ${layout.storeHeight}m` : '',
      date: '',
      time: '',
      notes: '',
    }
  })

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const canNext = () => {
    if (step === 0) return form.name && form.email && form.phone
    if (step === 1) return form.city && form.storeType
    if (step === 2) return form.date && form.time
    return true
  }

  const handleNext = () => {
    if (step < 3) setStep(s => s + 1)
  }

  const handleSubmit = () => {
    const appt = saveAppointment({ ...form, layoutId })
    if (appt) {
      setSaved(appt)
      setStep(4) // success
      toast.success('Reunião agendada com sucesso!')

      // Atualizar o e-mail, nome e telefone no perfil do lead se houver um profileId
      try {
        const rawIntake = sessionStorage.getItem('projefarma_intake')
        if (rawIntake && supabase) {
          const intake = JSON.parse(rawIntake)
          if (intake.profileId) {
            supabase.from('profiles').update({
              email: form.email,
              name: form.name,
              phone: form.phone
            }).eq('id', intake.profileId).then(({ error }) => {
              if (error) {
                console.warn('⚠️ Erro ao atualizar perfil com dados do agendamento:', error.message)
              } else {
                console.log('✅ Perfil atualizado com dados do agendamento:', intake.profileId)
              }
            })
          }
        }
      } catch (err) {
        console.warn('⚠️ Erro ao ler perfil para atualizar dados de agendamento:', err)
      }

      // Disparar envio de e-mails de confirmação e alerta
      if (supabase) {
        supabase.functions.invoke('send-email', {
          body: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            city: form.city,
            storeType: form.storeType,
            date: form.date,
            time: form.time,
            notes: form.notes
          }
        }).then(({ error }) => {
          if (error) {
            console.warn('⚠️ Erro ao disparar e-mail de confirmação:', error.message)
          } else {
            console.log('✅ E-mail de confirmação disparado com sucesso.')
          }
        }).catch(err => {
          console.warn('⚠️ Falha ao se conectar à função de e-mail:', err)
        })
      }
    } else {
      toast.error('Erro ao agendar. Tente novamente.')
    }
  }

  // Get min date (tomorrow)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  if (step === 4 && saved) {
    return (
      <div className="schedule-page">
        <div className="schedule-success animate-scale-in">
          <div className="success-icon">
            <I.CheckCircle />
          </div>
          <h1 className="success-title">Reunião Agendada!</h1>
          <p className="success-desc">
            Obrigado, <strong>{form.name}</strong>! Seu agendamento foi confirmado para
            <strong> {new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            {' '}às <strong>{form.time}</strong>.
          </p>
          <div className="success-email">
            <I.Email />
            <span>Um e-mail de confirmação foi enviado para <strong>{form.email}</strong></span>
          </div>

          <div className="success-details card">
            <div className="success-detail-row">
              <span><I.User /> Nome</span>
              <span>{form.name}</span>
            </div>
            <div className="success-detail-row">
              <span><I.Calendar /> Data</span>
              <span>{new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="success-detail-row">
              <span><I.Clock /> Horário</span>
              <span>{form.time}</span>
            </div>
            <div className="success-detail-row">
              <span><I.City /> Cidade</span>
              <span>{form.city}</span>
            </div>
            {layout && (
              <div className="success-detail-row">
                <span><I.Layout /> Layout</span>
                <span>{layout.storeWidth}m × {layout.storeHeight}m</span>
              </div>
            )}
          </div>

          <div className="success-actions">
            <button
              className="btn btn-primary btn-full"
              onClick={() => navigate('/editor')}
            >
              Voltar ao Editor
            </button>
            <button
              className="btn btn-secondary btn-full"
              onClick={() => navigate('/')}
            >
              Página Inicial
            </button>
          </div>

          <p className="success-hint">
            Nossa equipe entrará em contato em até 1 hora útil para confirmar os detalhes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="schedule-page">
      {/* Header */}
      <header className="schedule-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
        <div>
          <div className="schedule-logo-icon">P</div>
        </div>
        <div style={{ width: 60 }} />
      </header>

      <div className="schedule-content">
        {/* Progress steps */}
        <div className="schedule-steps">
          {STEPS.map((s, i) => (
            <div key={i} className={`schedule-step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
              <div className="step-dot">
                {i < step ? <I.Check /> : i + 1}
              </div>
              <span className="step-label hide-mobile">{s}</span>
              {i < STEPS.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>

        <div className="schedule-form card card-elevated animate-scale-in">
          <div className="schedule-form-header">
            <h2 className="schedule-form-title">
              {step === 0 && <><I.User /> Seus Dados</>}
              {step === 1 && <><I.Store /> Sua Farmácia</>}
              {step === 2 && <><I.Calendar /> Escolha o Horário</>}
              {step === 3 && <><I.CheckCircle /> Confirmar Agendamento</>}
            </h2>
            <p className="schedule-form-desc">
              {step === 0 && 'Para o consultor entrar em contato antes da reunião'}
              {step === 1 && 'Nos conte mais sobre seu projeto'}
              {step === 2 && 'Escolha a melhor data e hora para você'}
              {step === 3 && 'Revise e confirme seu agendamento'}
            </p>
          </div>

          <div className="schedule-form-body">
            {/* Step 0: Personal Data */}
            {step === 0 && (
              <div className="form-fields">
                <div className="form-group">
                  <label className="label" htmlFor="sched-name">Nome completo *</label>
                  <input id="sched-name" className="input" type="text" placeholder="Seu nome" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="sched-email">E-mail *</label>
                  <input id="sched-email" className="input" type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="sched-phone">WhatsApp / Telefone *</label>
                  <input id="sched-phone" className="input" type="tel" placeholder="(00) 00000-0000" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </div>
            )}

            {/* Step 1: Store Info */}
            {step === 1 && (
              <div className="form-fields">
                <div className="form-group">
                  <label className="label" htmlFor="sched-city">Cidade e Estado *</label>
                  <input id="sched-city" className="input" type="text" placeholder="Ex: São Paulo, SP" value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="sched-type">Tipo de Farmácia *</label>
                  <select id="sched-type" className="input" value={form.storeType} onChange={e => set('storeType', e.target.value)}>
                    {STORE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                {layout && (
                  <div className="layout-preview-card">
                    <div className="layout-preview-info">
                      <span><I.Layout /> Layout salvo: <strong>{layout.storeWidth}m × {layout.storeHeight}m</strong></span>
                      <span className="badge badge-green">
                        <I.Check style={{ width: 10, height: 10, marginRight: 2 }} /> Vinculado
                      </span>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="label" htmlFor="sched-notes">Observações (opcional)</label>
                  <textarea
                    id="sched-notes"
                    className="input"
                    rows={3}
                    placeholder="Conte mais sobre o projeto, dúvidas específicas..."
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    style={{ resize: 'none', height: 'auto' }}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Date & Time */}
            {step === 2 && (
              <div className="form-fields">
                <div className="form-group">
                  <label className="label" htmlFor="sched-date">Data *</label>
                  <input
                    id="sched-date"
                    className="input"
                    type="date"
                    min={minDate}
                    value={form.date}
                    onChange={e => set('date', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Horário disponível *</label>
                  <div className="time-grid">
                    {TIME_SLOTS.map(t => (
                      <button
                        key={t}
                        id={`time-${t.replace(':', '')}`}
                        className={`time-slot ${form.time === t ? 'active' : ''}`}
                        onClick={() => set('time', t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <div className="confirmation-grid">
                <div className="confirm-section">
                  <h4 className="confirm-section-title"><I.User /> Dados pessoais</h4>
                  <div className="confirm-row"><span>Nome</span><span>{form.name}</span></div>
                  <div className="confirm-row"><span>E-mail</span><span>{form.email}</span></div>
                  <div className="confirm-row"><span>Telefone</span><span>{form.phone}</span></div>
                </div>
                <div className="confirm-section">
                  <h4 className="confirm-section-title"><I.Store /> Farmácia</h4>
                  <div className="confirm-row"><span>Cidade</span><span>{form.city}</span></div>
                  <div className="confirm-row"><span>Tipo</span><span>{form.storeType}</span></div>
                  {layout && <div className="confirm-row"><span>Layout</span><span>{layout.storeWidth}m × {layout.storeHeight}m</span></div>}
                </div>
                <div className="confirm-section">
                  <h4 className="confirm-section-title"><I.Calendar /> Agendamento</h4>
                  <div className="confirm-row">
                    <span>Data</span>
                    <span>{form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : '-'}</span>
                  </div>
                  <div className="confirm-row"><span>Horário</span><span>{form.time}</span></div>
                </div>
                {form.notes && (
                  <div className="confirm-section">
                    <h4 className="confirm-section-title"><I.Notes /> Observações</h4>
                    <p className="confirm-notes">{form.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="schedule-form-actions">
            {step > 0 && (
              <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
                ← Anterior
              </button>
            )}
            {step < 3 && (
              <button
                id={`btn-step-next-${step}`}
                className="btn btn-primary"
                onClick={handleNext}
                disabled={!canNext()}
              >
                Próximo →
              </button>
            )}
            {step === 3 && (
              <button
                id="btn-confirm-appointment"
                className="btn btn-primary btn-lg"
                onClick={handleSubmit}
              >
                <I.Calendar style={{ marginRight: 6 }} /> Confirmar Agendamento
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
