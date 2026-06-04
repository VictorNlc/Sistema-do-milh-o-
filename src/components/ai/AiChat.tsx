import { useState, useRef, useEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { getAIResponse, generateAILayout } from '../../services/ai'
import { toast } from '../../store/toastStore'
import type { StoreType } from '../../types'
import './AiChat.css'

// Bug Fix: now() movida para fora do componente para evitar hoisting issue
// Antes: function now() declarada dentro do componente mas usada no estado inicial
function now(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const QUICK = [
  'Corredor mínimo?',
  'Onde colocar pilares?',
  'Layout farmácia popular?',
  'Normas ANVISA?',
]

interface Message {
  id: number
  role: 'ai' | 'user'
  text: string
  time: string
  isResult?: boolean
  stats?: {
    usedArea: string
    totalArea: string
    corridorMin: number
  }
}

interface AiChatProps {
  onClose?: () => void
}

export default function AiChat({ onClose }: AiChatProps) {
  const [msgs, setMsgs] = useState<Message[]>([{
    id: 1,
    role: 'ai',
    text: 'Olá! Sou o assistente de layout da **Projefarma**. Posso sugerir layouts, responder dúvidas sobre normas e ajudar a otimizar o espaço. Como posso ajudar?',
    time: now(),
  }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { storeWidth, storeHeight, storeType, items } = useCanvasStore()
  const canvasStore = useCanvasStore

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = (text: string) => {
    if (!text.trim() || typing) return
    setMsgs(m => [...m, { id: Date.now(), role: 'user', text: text.trim(), time: now() }])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      const reply = getAIResponse(text, { storeWidth, storeHeight, storeType: storeType as StoreType, itemCount: items.length })
      setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: reply, time: now() }])
      setTyping(false)
    }, 700 + Math.random() * 600)
  }

  const generate = () => {
    setTyping(true)
    setMsgs(m => [...m, {
      id: Date.now(),
      role: 'user',
      text: `Gere um layout ${storeType} de ${storeWidth}m × ${storeHeight}m`,
      time: now(),
    }])
    setTimeout(() => {
      const current = canvasStore.getState().items
      const pillars = current.filter(i => i.isPillar)
      const result = generateAILayout(storeWidth, storeHeight, storeType as StoreType, pillars)

      if (!result.valid && result.items.length === 0) {
        setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: result.messages[0] || 'Dimensões insuficientes.', time: now() }])
        setTyping(false)
        return
      }

      const existing = current.filter(i => i.isPillar || i.isObstacle)
      // Merge AI items into store (cast is safe: AI items satisfy CanvasItem shape)
      canvasStore.setState(s => ({
        items: [...existing, ...(result.items as typeof existing)],
        isDirty: true,
      }))

      const tips = result.messages.slice(0, 3).map(m => `• ${m}`).join('\n')
      setMsgs(m => [...m, {
        id: Date.now() + 1,
        role: 'ai',
        text: `Layout gerado com **${result.items.length} itens** para farmácia ${storeType} de ${storeWidth}×${storeHeight}m.\n\n${tips}\n\nMova os itens arrastando no canvas.`,
        time: now(),
        isResult: true,
        stats: result.stats,
      }])
      toast.success('Layout gerado!')
      setTyping(false)
    }, 1400)
  }

  const fmt = (t: string) =>
    t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')

  return (
    <div className="aic-root">
      {/* Header */}
      <div className="aic-head">
        <div className="aic-head-left">
          <div className="aic-avatar">AI</div>
          <div>
            <div className="aic-name">Assistente Projefarma</div>
            <div className="aic-status"><span className="aic-dot" /> Online</div>
          </div>
        </div>
        {onClose && <button className="aic-close" onClick={onClose}>✕</button>}
      </div>

      {/* Context */}
      <div className="aic-ctx">
        <span><span className="aic-ctx-k">Loja</span> {storeWidth}×{storeHeight}m</span>
        <span className="aic-ctx-sep">·</span>
        <span><span className="aic-ctx-k">Tipo</span> {storeType}</span>
        <span className="aic-ctx-sep">·</span>
        <span><span className="aic-ctx-k">Itens</span> {items.length}</span>
      </div>

      {/* Messages */}
      <div className="aic-msgs">
        {msgs.map(msg => (
          <div key={msg.id} className={`aic-msg aic-msg-${msg.role}`}>
            {msg.role === 'ai' && <div className="aic-msg-avatar">AI</div>}
            <div className="aic-bubble">
              <div className="aic-bubble-text" dangerouslySetInnerHTML={{ __html: fmt(msg.text) }} />
              {msg.isResult && msg.stats && (
                <div className="aic-stats">
                  {([
                    [msg.stats.usedArea + 'm²', 'ocupado'],
                    [msg.stats.totalArea + 'm²', 'total'],
                    [msg.stats.corridorMin + 'm', 'corredor'],
                  ] as [string, string][]).map(([v, l]) => (
                    <div key={l} className="aic-stat">
                      <span className="aic-stat-val">{v}</span>
                      <span className="aic-stat-label">{l}</span>
                    </div>
                  ))}
                </div>
              )}
              <span className="aic-time">{msg.time}</span>
            </div>
          </div>
        ))}
        {typing && (
          <div className="aic-msg aic-msg-ai">
            <div className="aic-msg-avatar">AI</div>
            <div className="aic-bubble aic-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick questions */}
      <div className="aic-quick">
        {QUICK.map((q, i) => (
          <button key={i} className="aic-quick-btn" onClick={() => send(q)}>{q}</button>
        ))}
      </div>

      {/* Generate button */}
      <div className="aic-gen">
        <button id="btn-gen-layout" className="btn btn-primary btn-sm btn-full" onClick={generate} disabled={typing}>
          Gerar Layout com IA
        </button>
      </div>

      {/* Input */}
      <div className="aic-input-row">
        <input
          ref={inputRef}
          id="aic-input"
          className="input aic-input"
          type="text"
          placeholder="Pergunte sobre layout, normas..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
        />
        <button id="aic-send" className="aic-send" onClick={() => send(input)} disabled={!input.trim() || typing}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
