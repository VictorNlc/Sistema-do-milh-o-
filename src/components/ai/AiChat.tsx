import { useState, useRef, useEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { generateAILayout } from '../../services/heuristicLayoutGenerator'
import { sendChatGPTMessage, isApiKeyConfigured, generateLayoutWithGPT } from '../../services/chatGptLayoutGenerator'
import { getItemById } from '../../data/items'
import type { ChatGPTMessage } from '../../services/chatGptLayoutGenerator'
import { toast } from '../../store/toastStore'
import type { StoreType, CanvasItem } from '../../types'
import { v4 as uuidv4 } from 'uuid'
import './AiChat.css'

// Bug Fix: now() movida para fora do componente para evitar hoisting issue
// Antes: function now() declarada dentro do componente mas usada no estado inicial
function now(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function parseDimensions(text: string): { width: number; height: number } | null {
  const textClean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const match = textClean.match(/(\d+(?:[.,]\d+)?)\s*(?:m|met|metros|de\s+largura)?\s*(?:x|×|por|de|com|\*|\s+e\s+|\s+by\s+)\s*(\d+(?:[.,]\d+)?)\s*(?:m|met|metros|de\s+comp|de\s+fundo|de\s+comprimento)?/)
  
  if (match && match[1] && match[2]) {
    const w = parseFloat(match[1].replace(',', '.'))
    const h = parseFloat(match[2].replace(',', '.'))
    if (!isNaN(w) && !isNaN(h) && w >= 4 && w <= 50 && h >= 4 && h <= 50) {
      return { width: w, height: h }
    }
  }

  const wMatch = textClean.match(/(?:largura|frente)\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)/)
  const hMatch = textClean.match(/(?:comprimento|fundo|profundidade)\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)/)
  if (wMatch && hMatch && wMatch[1] && hMatch[1]) {
    const w = parseFloat(wMatch[1].replace(',', '.'))
    const h = parseFloat(hMatch[1].replace(',', '.'))
    if (!isNaN(w) && !isNaN(h) && w >= 4 && w <= 50 && h >= 4 && h <= 50) {
      return { width: w, height: h }
    }
  }
  return null
}

function parseStructuralRequirements(text: string, storeWidth: number, storeHeight: number): Partial<CanvasItem>[] {
  const textClean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const items: Partial<CanvasItem>[] = []

  const getWallForKeyword = (keyword: string): 'Top' | 'Bottom' | 'Left' | 'Right' | null => {
    const idx = textClean.indexOf(keyword)
    if (idx === -1) return null
    
    let segment = textClean.substring(idx)
    const commaIdx = segment.indexOf(',')
    const eIdx = segment.indexOf(' e ')
    const paraIdx = segment.indexOf(' para ')
    
    let endIdx = segment.length
    const limiters = [commaIdx, eIdx, paraIdx].filter(i => i !== -1)
    if (limiters.length > 0) {
      endIdx = Math.min(...limiters)
    }
    
    segment = segment.substring(0, endIdx)
    
    if (segment.includes('esquerda') || segment.includes('left')) return 'Left'
    if (segment.includes('direita') || segment.includes('right')) return 'Right'
    if (segment.includes('cima') || segment.includes('topo') || segment.includes('top') || segment.includes('fundo')) return 'Top'
    if (segment.includes('baixo') || segment.includes('frente') || segment.includes('bottom')) return 'Bottom'
    return null
  }

  const hasEntrada = textClean.includes('entrada') || (textClean.includes('porta') && !textClean.includes('saida'))
  const hasSaida = textClean.includes('saida') || textClean.includes('emergencia')

  // 1. Porta de Entrada
  if (hasEntrada) {
    const wall = getWallForKeyword('entrada') || getWallForKeyword('porta') || 'Bottom'
    let x = storeWidth / 2 - 0.6
    let y = storeHeight - 0.15
    let rot = 0

    if (wall === 'Top') {
      x = storeWidth / 2 - 0.6
      y = 0.15
      rot = 180
    } else if (wall === 'Left') {
      x = 0.15
      y = storeHeight / 2 - 0.6
      rot = 90
    } else if (wall === 'Right') {
      x = storeWidth - 0.15
      y = storeHeight / 2 - 0.6
      rot = 270
    }

    items.push({
      id: `structural_entrada_${uuidv4()}`,
      itemId: 'porta-entrada',
      name: 'Porta de Entrada',
      icon: '🚪',
      category: 'ESTRUTURA',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: 1.2,
      height: 0.15,
      rotation: rot,
      isDoor: true,
      fillColor: '#FCD34D',
      strokeColor: '#78350F',
    })
  }

  // 2. Saída de Emergência
  if (hasSaida) {
    const wall = getWallForKeyword('saida') || getWallForKeyword('emergencia') || 'Top'
    let x = storeWidth / 2 - 0.5
    let y = 0.15
    let rot = 180

    if (wall === 'Bottom') {
      x = storeWidth / 2 - 0.5
      y = storeHeight - 0.15
      rot = 0
    } else if (wall === 'Left') {
      x = 0.15
      y = storeHeight / 2 - 0.5
      rot = 90
    } else if (wall === 'Right') {
      x = storeWidth - 0.15
      y = storeHeight / 2 - 0.5
      rot = 270
    }

    items.push({
      id: `structural_saida_${uuidv4()}`,
      itemId: 'porta-saida-emergencia',
      name: 'Saída de Emergência',
      icon: '🆘',
      category: 'ESTRUTURA',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: 1.0,
      height: 0.15,
      rotation: rot,
      isDoor: true,
      isEmergency: true,
      fillColor: '#FCA5A5',
      strokeColor: '#991B1B',
    })
  }

  // 3. Pilar
  if (textClean.includes('pilar') || textClean.includes('coluna')) {
    let x = storeWidth / 2 - 0.15
    let y = storeHeight / 2 - 0.15
    
    const coordMatch = textClean.match(/(?:pilar|coluna).*?(\d+(?:[.,]\d+)?)\s*(?:,|x|\s+)\s*(\d+(?:[.,]\d+)?)/)
    if (coordMatch && coordMatch[1] && coordMatch[2]) {
      const px = parseFloat(coordMatch[1].replace(',', '.'))
      const py = parseFloat(coordMatch[2].replace(',', '.'))
      if (!isNaN(px) && !isNaN(py) && px > 0 && px < storeWidth && py > 0 && py < storeHeight) {
        x = px - 0.15
        y = py - 0.15
      }
    }

    items.push({
      id: `structural_pillar_${uuidv4()}`,
      itemId: 'pilar',
      name: 'Pilar / Coluna',
      icon: '🏛️',
      category: 'ESTRUTURA',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: 0.3,
      height: 0.3,
      rotation: 0,
      isObstacle: true,
      isPillar: true,
      fillColor: '#9CA3AF',
      strokeColor: '#374151',
    })
  }

  return items
}

const QUICK = [
  'Qual o corredor mínimo recomendado?',
  'Como posicionar pilares no layout?',
  'Gerar layout farmácia popular',
  'Quais as normas ANVISA para farmácias?',
  'Dicas para perfumaria',
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
  const hasApiKey = isApiKeyConfigured()
  const [msgs, setMsgs] = useState<Message[]>([{
    id: 1,
    role: 'ai',
    text: hasApiKey
      ? 'Olá! Sou o **Projefarma AI** com ChatGPT integrado 🧠. Posso responder perguntas sobre layout, normas ANVISA, sugerir posicionamentos e gerar layouts completos. Como posso ajudar?'
      : 'Olá! Sou o assistente de layout da **Projefarma**. Posso sugerir layouts e responder dúvidas sobre normas. Para respostas mais inteligentes, configure sua chave API da OpenAI no arquivo **.env**.',
    time: now(),
  }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatGPTMessage[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { storeWidth, storeHeight, storeType, items, pillars, entrance, emergencyExit } = useCanvasStore()
  const canvasStore = useCanvasStore

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = (text: string) => {
    if (!text.trim() || typing) return
    const userMsg = text.trim()
    setMsgs(m => [...m, { id: Date.now(), role: 'user', text: userMsg, time: now() }])
    setInput('')
    setTyping(true)

    if (!hasApiKey) {
      setTimeout(() => {
        setMsgs(m => [...m, {
          id: Date.now() + 1,
          role: 'ai',
          text: '🔑 **Chave API não configurada.** Adicione sua chave OpenAI no arquivo `.env`:\n\n`VITE_OPENAI_API_KEY=sk-...`\n\nDepois reinicie o servidor com `npm run dev`.',
          time: now()
        }])
        setTyping(false)
      }, 500)
      return
    }

    const context = {
      storeWidth,
      storeHeight,
      storeType: storeType as StoreType,
      itemCount: items.length,
      pillars: pillars || [],
      entrance: entrance ? { x: entrance.x, y: entrance.y } : null,
      emergencyExit: emergencyExit ? { x: emergencyExit.x, y: emergencyExit.y } : null,
    }

    sendChatGPTMessage(userMsg, chatHistory, context)
      .then(response => {
        if (response.success) {
          setChatHistory(prev => [
            ...prev,
            { role: 'user', content: userMsg },
            { role: 'assistant', content: response.message },
          ])
          setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: response.message, time: now() }])
        } else {
          setMsgs(m => [...m, {
            id: Date.now() + 1,
            role: 'ai',
            text: `⚠️ ${response.error}`,
            time: now()
          }])
        }
        setTyping(false)
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: `⚠️ Erro ao obter resposta da IA: ${msg}`, time: now() }])
        setTyping(false)
      })
  }

  const generate = async () => {
    setTyping(true)
    setMsgs(m => [...m, {
      id: Date.now(),
      role: 'user',
      text: `Gere um layout ${storeType} de ${storeWidth}m × ${storeHeight}m`,
      time: now(),
    }])

    // Verificar dimensões mínimas
    if (storeWidth < 4 || storeHeight < 4) {
      setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: '⚠️ A loja é muito pequena. O mínimo recomendado é 4m x 4m.', time: now() }])
      setTyping(false)
      return
    }

    setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: '🧠 Analisando espaço e gerando layout estratégico...', time: now() }])

    try {
      const current = canvasStore.getState().items
      const density = canvasStore.getState().layoutDensity || 'normal'

      // Chamar o gerador estratégico/deterministico (100% funcional, sem erros de colisão)
      const result = await generateAILayout(storeWidth, storeHeight, storeType as StoreType, current, density)

      if (!result.valid && result.items.length === 0) {
        setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: `⚠️ ${result.messages[0] || 'Dimensões insuficientes para gerar o layout.'}`, time: now() }])
        setTyping(false)
        return
      }

      // Manter os itens estruturais do usuário e aplicar o layout gerado
      const structuralItems = current.filter(i => i.isPillar || i.isObstacle || i.isDoor || i.isEmergency || i.isRoom || i.category === 'ESTRUTURA')
      canvasStore.setState(() => ({
        items: [...structuralItems, ...(result.items as typeof structuralItems)],
        isDirty: true,
      }))

      toast.success('Layout estratégico gerado!')

      // Solicitar ao ChatGPT uma análise estratégica personalizada do layout que foi gerado
      if (hasApiKey) {
        const chatPrompt = `Acabei de gerar um layout comercial 100% funcional e estratégico para uma farmácia do tipo "${storeType}" com dimensões de ${storeWidth}m x ${storeHeight}m. O layout contém ${result.items.length} itens (incluindo prateleiras, balcões, caixas e gôndolas centralizadas).
        
Por favor, escreva uma análise rápida, extremamente profissional e simpática desse layout (máximo 4 parágrafos) justificando as escolhas de distribuição e dando 3 dicas de visual merchandising aplicadas a este layout gerado. Diga que o layout já foi renderizado na tela e que o usuário pode visualizar em 3D ou mover os itens no canvas.`

        const context = {
          storeWidth,
          storeHeight,
          storeType: storeType as StoreType,
          itemCount: result.items.length,
          pillars: pillars || [],
          entrance: entrance ? { x: entrance.x, y: entrance.y } : null,
          emergencyExit: emergencyExit ? { x: emergencyExit.x, y: emergencyExit.y } : null,
        }

        const chatResponse = await sendChatGPTMessage(chatPrompt, chatHistory, context)

        if (chatResponse.success) {
          setChatHistory(prev => [
            ...prev,
            { role: 'assistant', content: chatResponse.message },
          ])
          setMsgs(m => [...m, {
            id: Date.now() + 1,
            role: 'ai',
            text: chatResponse.message,
            time: now(),
            isResult: true,
            stats: result.stats,
          }])
        } else {
          setMsgs(m => [...m, {
            id: Date.now() + 1,
            role: 'ai',
            text: `Layout gerado com sucesso!\n\n⚠️ Não foi possível obter a análise da IA: ${chatResponse.error}`,
            time: now(),
            isResult: true,
            stats: result.stats,
          }])
        }
      } else {
        const tips = result.messages.map(m => `• ${m}`).join('\n')
        setMsgs(m => [...m, {
          id: Date.now() + 1,
          role: 'ai',
          text: `✅ Layout gerado com **${result.items.length} itens**.\n\n${tips}`,
          time: now(),
          isResult: true,
          stats: result.stats,
        }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setMsgs(m => [...m, { id: Date.now() + 1, role: 'ai', text: `⚠️ Erro ao gerar layout: ${msg}`, time: now() }])
    }
    setTyping(false)
  }

  const fmt = (t: string) =>
    t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')

  return (
    <div className="aic-root">
      {/* Header */}
      <div className="aic-head">
        <div className="aic-head-left">
          <div className="aic-avatar" style={{ background: 'linear-gradient(135deg, #107C3F 0%, #062C16 100%)', boxShadow: '0 4px 10px rgba(16, 124, 63, 0.3)' }}>🤖</div>
          <div>
            <div className="aic-name">Projefarma AI Assistant</div>
            <div className="aic-status">
              <span className="aic-dot" style={{ background: hasApiKey ? '#10B981' : '#F59E0B' }} />
              {hasApiKey ? 'ChatGPT Ativo' : 'Modo Offline'}
            </div>
          </div>
        </div>
        {onClose && <button className="aic-close" onClick={onClose}>✕</button>}
      </div>

      {/* API Key Banner */}
      {!hasApiKey && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(245, 158, 11, 0.1)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          fontSize: '11px',
          color: '#F59E0B',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          lineHeight: 1.4,
        }}>
          <span style={{ fontSize: '14px' }}>🔑</span>
          <span>Configure sua chave API no arquivo <strong>.env</strong> → <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>VITE_OPENAI_API_KEY=sk-...</code></span>
        </div>
      )}

      {/* Context */}
      <div className="aic-ctx">
        <span><span className="aic-ctx-k">Loja</span> {storeWidth}×{storeHeight}m</span>
        <span className="aic-ctx-sep">·</span>
        <span><span className="aic-ctx-k">Tipo</span> {storeType}</span>
        <span className="aic-ctx-sep">·</span>
        <span><span className="aic-ctx-k">Itens</span> {items.length}</span>
        {hasApiKey && <><span className="aic-ctx-sep">·</span><span style={{ color: '#10B981' }}>🧠 GPT</span></>}
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
      <div className="aic-input-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div className="aic-input-container" style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          {/* Mockup icons on the left of input */}
          <div style={{ display: 'flex', gap: '8px', position: 'absolute', left: '12px', zIndex: 2 }}>
            {/* Attachment */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" style={{ cursor: 'pointer' }}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            {/* Camera */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" style={{ cursor: 'pointer' }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            {/* Mic */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" style={{ cursor: 'pointer' }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
          </div>
          <input
            ref={inputRef}
            id="aic-input"
            className="input aic-input"
            type="text"
            placeholder={hasApiKey ? 'Pergunte ao ChatGPT...' : 'Digite sua dúvida...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            style={{ paddingLeft: '76px', height: '40px', background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
          />
        </div>
        <button id="aic-send" className="aic-send" onClick={() => send(input)} disabled={!input.trim() || typing} style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#107C3F' }}>
          {/* Paper plane icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
