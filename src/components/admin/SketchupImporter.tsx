// ============================================
// SketchupImporter — Importa prints de cima do SketchUp
// e usa IA para detectar móveis e gerar layout de referência
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  analyzeSketchupImage,
  detectedItemsToCanvasItems,
  saveReferenceLayout,
  getReferenceLayouts,
  deleteReferenceLayout,
} from '../../services/sketchupVision'
import { toast } from '../../store/toastStore'
import type { DetectedItem, ReferenceLayout, StoreType } from '../../types'
import './SketchupImporter.css'

// Sufixo de catálogo baseado no tipo de loja
function lineSuffix(storeType: StoreType) {
  return storeType === 'premium' ? '-premium' : '-especial'
}

const STORE_TYPE_LABELS: Record<StoreType, string> = {
  popular: 'Popular',
  premium: 'Premium',
  manipulacao: 'Manipulação',
  completa: 'Completa',
}

// ─── Ícones inline ─────────────────────────────────────────────────────────

const Icons = {
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
  Scan: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 7 4" /><polyline points="4 17 4 20 7 20" />
      <polyline points="17 4 20 4 20 7" /><polyline points="17 20 20 20 20 17" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  Reload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Database: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
}

type LoadingStep = 'idle' | 'reading' | 'sending' | 'analyzing' | 'mapping' | 'done'

// ─── Preview do canvas miniatura ────────────────────────────────────────────

function LayoutPreviewCanvas({
  items,
  storeWidth,
  storeHeight,
}: {
  items: DetectedItem[]
  storeWidth: number
  storeHeight: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const SCALE = 40 // pixels por metro para o preview

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = storeWidth * SCALE
    const H = storeHeight * SCALE

    canvas.width = W
    canvas.height = H

    // Fundo
    ctx.fillStyle = '#f0f9ff'
    ctx.fillRect(0, 0, W, H)

    // Grade
    ctx.strokeStyle = '#e0f2fe'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= storeWidth; x++) {
      ctx.beginPath()
      ctx.moveTo(x * SCALE, 0)
      ctx.lineTo(x * SCALE, H)
      ctx.stroke()
    }
    for (let y = 0; y <= storeHeight; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * SCALE)
      ctx.lineTo(W, y * SCALE)
      ctx.stroke()
    }

    // Borda da loja
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, W, H)

    // Itens detectados
    items.forEach(item => {
      ctx.save()
      const cx = (item.x + item.width / 2) * SCALE
      const cy = (item.y + item.height / 2) * SCALE
      ctx.translate(cx, cy)
      ctx.rotate((item.rotation * Math.PI) / 180)

      const iw = item.width * SCALE
      const ih = item.height * SCALE

      // Cor por tipo
      let fill = '#bfdbfe'
      let stroke = '#3b82f6'
      const id = item.catalogId
      if (id.includes('catalog-3')) { fill = '#fde68a'; stroke = '#d97706' }
      else if (id.includes('catalog-2')) { fill = '#bbf7d0'; stroke = '#16a34a' }
      else if (id.includes('catalog-1') && !id.includes('catalog-13')) { fill = '#fbcfe8'; stroke = '#db2777' }
      else if (id.includes('catalog-4')) { fill = '#c7d2fe'; stroke = '#4338ca' }
      else if (id.includes('catalog-5')) { fill = '#bfdbfe'; stroke = '#2563eb' }
      else if (id.includes('catalog-6')) { fill = '#a7f3d0'; stroke = '#059669' }

      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.fillRect(-iw / 2, -ih / 2, iw, ih)
      ctx.strokeRect(-iw / 2, -ih / 2, iw, ih)

      ctx.restore()
    })
  }, [items, storeWidth, storeHeight])

  return (
    <canvas
      ref={canvasRef}
      className="sketchup-preview-canvas"
      style={{ maxHeight: '280px', objectFit: 'contain' }}
    />
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function SketchupImporter() {
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [storeWidth, setStoreWidth] = useState(10)
  const [storeHeight, setStoreHeight] = useState(12)
  const storeType: StoreType = 'premium' // Único tipo ativo
  const [layoutName, setLayoutName] = useState('')
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle')
  const [detectedItems, setDetectedItems] = useState<DetectedItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [referenceLayouts, setReferenceLayouts] = useState<ReferenceLayout[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carregar layouts de referência salvos
  useEffect(() => {
    setReferenceLayouts(getReferenceLayouts())
    // Sincronizar em segundo plano com o Supabase e atualizar a lista
    import('../../services/storage').then(({ syncAllWithSupabase }) => {
      syncAllWithSupabase().then(() => {
        setReferenceLayouts(getReferenceLayouts())
      }).catch(err => console.warn('Erro ao sincronizar referências:', err))
    })
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem PNG ou JPG.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo: 20MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      // Separar o base64 puro do cabeçalho data:image/...;base64,
      setImageBase64(dataUrl)
      setDetectedItems(null)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleAnalyze = async () => {
    if (!imageBase64) {
      toast.error('Faça upload de uma imagem primeiro.')
      return
    }

    setError(null)
    setDetectedItems(null)
    setLoadingStep('reading')

    // Simular passos de loading para feedback visual
    setTimeout(() => setLoadingStep('sending'), 500)
    setTimeout(() => setLoadingStep('analyzing'), 1500)

    const result = await analyzeSketchupImage(imageBase64, storeWidth, storeHeight, storeType)

    if (!result.success) {
      setError(result.error ?? 'Erro ao analisar imagem.')
      setLoadingStep('idle')
      return
    }

    setLoadingStep('mapping')
    setTimeout(() => {
      setDetectedItems(result.items)
      setLoadingStep('idle')
      toast.success(`✅ ${result.items.length} itens detectados!`)
    }, 600)
  }

  const handleRemoveItem = (index: number) => {
    setDetectedItems(prev => prev?.filter((_, i) => i !== index) ?? null)
  }

  const handleSaveReference = () => {
    if (!detectedItems || detectedItems.length === 0) {
      toast.error('Nenhum item para salvar.')
      return
    }

    const canvasItems = detectedItemsToCanvasItems(detectedItems, storeType)
    const name = layoutName.trim() || `Layout ${storeType} ${storeWidth}×${storeHeight}m — ${new Date().toLocaleDateString('pt-BR')}`

    saveReferenceLayout({
      name,
      storeType,
      storeWidth,
      storeHeight,
      items: canvasItems,
      sourceImageBase64: imagePreview ?? undefined,
      approved: true,
    })

    setReferenceLayouts(getReferenceLayouts())
    setDetectedItems(null)
    setImageBase64(null)
    setImagePreview(null)
    setLayoutName('')
    setLoadingStep('idle')

    toast.success('🎉 Layout de referência salvo! A IA usará esse modelo nos próximos projetos.')
  }

  const handleDeleteReference = (id: string) => {
    if (!confirm('Tem certeza que quer remover este layout de referência?')) return
    deleteReferenceLayout(id)
    setReferenceLayouts(getReferenceLayouts())
    toast.success('Layout de referência removido.')
  }

  const isAnalyzing = ['reading', 'sending', 'analyzing', 'mapping'].includes(loadingStep)

  const loadingSteps = [
    { key: 'reading',  label: 'Lendo a imagem…' },
    { key: 'sending',  label: 'Enviando para análise com IA…' },
    { key: 'analyzing', label: 'Detectando móveis e posições…' },
    { key: 'mapping',  label: 'Mapeando para o catálogo…' },
  ]

  const stepIndex = loadingSteps.findIndex(s => s.key === loadingStep)

  function getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.85) return 'Alta'
    if (confidence >= 0.6) return 'Média'
    return 'Baixa'
  }
  function getConfidenceClass(confidence: number): string {
    if (confidence >= 0.85) return 'confidence-high'
    if (confidence >= 0.6) return 'confidence-mid'
    return 'confidence-low'
  }

  return (
    <div className="sketchup-importer">
      {/* ─── Upload Section ─────────────────────────────────────────────── */}
      <div
        className={`sketchup-upload-zone ${isDragOver ? 'dragover' : ''} ${imagePreview ? 'has-image' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {imagePreview ? (
          <>
            <img src={imagePreview} alt="Preview do layout" className="upload-preview" />
            <p className="upload-change-hint">Clique para trocar a imagem</p>
          </>
        ) : (
          <>
            <div className="upload-icon"><Icons.Upload /></div>
            <div className="upload-title">Arraste o print do SketchUp aqui</div>
            <div className="upload-subtitle">ou clique para selecionar — PNG, JPG até 20MB</div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* ─── Configuração ───────────────────────────────────────────────── */}
      <div className="sketchup-form">
        <div className="form-group">
          <label className="label">Largura da loja (metros)</label>
          <input
            className="input"
            type="number"
            min={4} max={50} step={0.5}
            value={storeWidth}
            onChange={e => setStoreWidth(Number(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label className="label">Comprimento da loja (metros)</label>
          <input
            className="input"
            type="number"
            min={4} max={80} step={0.5}
            value={storeHeight}
            onChange={e => setStoreHeight(Number(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label className="label">Linha</label>
          <div className="input" style={{ background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⭐ Farmácia Premium
          </div>
        </div>
        <div className="form-group">
          <label className="label">Nome deste layout (opcional)</label>
          <input
            className="input"
            type="text"
            placeholder={`Layout Premium ${storeWidth}×${storeHeight}m`}
            value={layoutName}
            onChange={e => setLayoutName(e.target.value)}
          />
        </div>
      </div>

      {/* ─── Botão analisar ─────────────────────────────────────────────── */}
      {!isAnalyzing && (
        <button
          className="btn btn-primary sketchup-analyze-btn"
          onClick={handleAnalyze}
          disabled={!imageBase64}
        >
          <span style={{ width: '1.25rem', height: '1.25rem', display: 'flex' }}><Icons.Scan /></span>
          Analisar com Inteligência Artificial
        </button>
      )}

      {/* ─── Loading ────────────────────────────────────────────────────── */}
      {isAnalyzing && (
        <div className="sketchup-loading">
          <div className="sketchup-loading-spinner" />
          <div className="sketchup-loading-text">A IA está analisando o layout…</div>
          <div className="sketchup-loading-steps">
            {loadingSteps.map((step, i) => (
              <div
                key={step.key}
                className={`loading-step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
              >
                <span className="loading-step-icon">
                  {i < stepIndex ? '✅' : i === stepIndex ? '⏳' : '○'}
                </span>
                {step.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Erro ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="card" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b', padding: '1rem' }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* ─── Resultados ─────────────────────────────────────────────────── */}
      {detectedItems && detectedItems.length > 0 && (
        <div className="sketchup-results">
          <div className="sketchup-results-header">
            <div className="sketchup-results-title">
              🔍 Itens Detectados
            </div>
            <span className="sketchup-results-count">{detectedItems.length} itens</span>
          </div>

          {/* Preview do canvas */}
          <div className="sketchup-preview-section">
            <div className="sketchup-preview-title">📐 Pré-visualização</div>
            <div className="sketchup-preview-container">
              <LayoutPreviewCanvas
                items={detectedItems}
                storeWidth={storeWidth}
                storeHeight={storeHeight}
              />
            </div>
          </div>

          {/* Lista de itens */}
          <div className="sketchup-items-grid">
            {detectedItems.map((item, idx) => (
              <div key={idx} className="sketchup-item-row">
                <div className="sketchup-item-icon">
                  {item.catalogId.includes('catalog-3') ? '📦' :
                   item.catalogId.includes('catalog-2') ? '💊' :
                   item.catalogId.includes('catalog-1') && !item.catalogId.includes('catalog-13') ? '🌸' :
                   item.catalogId.includes('catalog-4') ? '💊' :
                   item.catalogId.includes('catalog-5') ? '🏪' :
                   item.catalogId.includes('catalog-6') ? '💳' :
                   item.catalogId.includes('catalog-7') ? '🧺' :
                   item.catalogId.includes('catalog-8') ? '📥' :
                   item.catalogId.includes('catalog-13') ? '💳' :
                   item.catalogId.includes('porta') ? '🚪' : '📦'}
                </div>
                <div className="sketchup-item-info">
                  <div className="sketchup-item-name">{item.detectedName}</div>
                  <div className="sketchup-item-meta">
                    x:{item.x}m y:{item.y}m · {item.width}×{item.height}m · rot:{item.rotation}°
                  </div>
                  <div className="sketchup-item-meta" style={{ color: '#6366f1' }}>
                    → {item.catalogId}
                  </div>
                </div>
                <span className={`sketchup-item-confidence ${getConfidenceClass(item.confidence)}`}>
                  {getConfidenceLabel(item.confidence)}
                </span>
                <div className="sketchup-item-actions">
                  <button
                    className="btn-icon-sm danger"
                    title="Remover item"
                    onClick={() => handleRemoveItem(idx)}
                  >
                    <Icons.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Ações finais */}
          <div className="sketchup-final-actions">
            <button
              className="btn btn-ghost"
              onClick={() => { setDetectedItems(null); setError(null) }}
            >
              ↩ Refazer análise
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveReference}
            >
              ✅ Aprovar e Salvar como Referência
            </button>
          </div>
        </div>
      )}

      {detectedItems?.length === 0 && (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤔</div>
          A IA não detectou móveis nesta imagem. Tente com uma imagem mais clara ou de maior resolução.
        </div>
      )}

      {/* ─── Layouts de referência salvos ───────────────────────────────── */}
      <div className="reference-layouts-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <div className="reference-layouts-title">
          <span style={{ width: '1.25rem', height: '1.25rem', display: 'flex' }}><Icons.Database /></span>
          Layouts de Referência Salvos ({referenceLayouts.length})
        </div>

        {referenceLayouts.length === 0 ? (
          <div className="reference-empty">
            <div className="reference-empty-icon">📂</div>
            Nenhum layout de referência ainda.<br />
            Importe um print do SketchUp acima para começar!
          </div>
        ) : (
          <div className="reference-layouts-grid">
            {referenceLayouts.map(layout => (
              <div key={layout.id} className="reference-layout-card">
                {layout.sourceImageBase64 ? (
                  <img
                    className="reference-layout-thumb"
                    src={layout.sourceImageBase64}
                    alt={layout.name}
                  />
                ) : (
                  <div className="reference-layout-thumb-placeholder">🏪</div>
                )}
                <div className="reference-layout-info">
                  <div className="reference-layout-name">{layout.name}</div>
                  <div className="reference-layout-meta">
                    <span className={`store-type-badge ${layout.storeType}`}>
                      {STORE_TYPE_LABELS[layout.storeType]}
                    </span>
                    <span>{layout.storeWidth}m × {layout.storeHeight}m</span>
                    <span>· {layout.items.length} itens</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {new Date(layout.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="reference-layout-actions">
                  <button
                    className="btn btn-ghost btn-sm danger"
                    onClick={() => handleDeleteReference(layout.id)}
                    style={{ color: '#ef4444' }}
                  >
                    🗑 Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
