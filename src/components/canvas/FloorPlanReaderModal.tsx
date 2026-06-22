import React, { useState, useRef } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { toast } from '../../store/toastStore'
import { readFloorPlanImage, fileToBase64, FloorPlanData } from '../../services/floorPlanReader'
import { PHARMACY_ITEMS } from '../../data/items'
import { v4 as uuidv4 } from 'uuid'
import { generateAILayout } from '../../services/heuristicLayoutGenerator'
import './FloorPlanReaderModal.css'

interface FloorPlanReaderModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function FloorPlanReaderModal({ isOpen, onClose }: FloorPlanReaderModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultData, setResultData] = useState<FloorPlanData | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const store = useCanvasStore()
  const { setStoreDimensions, setEntrance, setPillars, clearCanvas, addItem, rotateItem } = store

  if (!isOpen) return null

  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      toast.error('Por favor, envie um arquivo de imagem válido (PNG, JPEG ou JPG).')
      return
    }
    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
    setResultData(null)
    setError(null)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0])
    }
  }

  const handleSelectClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileChange(e.target.files[0])
    }
  }

  const handleAnalyze = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setResultData(null)

    try {
      const base64 = await fileToBase64(file)
      const res = await readFloorPlanImage(base64, file.type)

      if (res.success && res.data) {
        setResultData(res.data)
        toast.success('Planta baixa analisada com sucesso!')
      } else {
        setError(res.error || 'Erro desconhecido ao processar a imagem.')
        toast.error('Falha na análise da imagem.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na requisição'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (!resultData) return

    // 1. Limpar o canvas antes de aplicar as novas dimensões e obstáculos
    clearCanvas()

    // 2. Definir as novas dimensões de largura e comprimento
    setStoreDimensions(resultData.storeWidth, resultData.storeHeight)

    // 3. Adicionar porta de entrada principal
    if (resultData.entrance) {
      const doorTemplate = PHARMACY_ITEMS.find(i => i.id === 'porta-entrada')
      if (doorTemplate) {
        // Mapeia orientação para rotação correspondente
        let rotation = 0
        if (resultData.entrance.orientation === 'E') rotation = 90
        else if (resultData.entrance.orientation === 'N') rotation = 180
        else if (resultData.entrance.orientation === 'W') rotation = 270

        // Corrige o offset da porta em relação ao tamanho da porta
        const doorX = Math.max(0, resultData.entrance.x - doorTemplate.width / 2)
        const doorY = Math.max(0, resultData.entrance.y - doorTemplate.height / 2)

        const addedDoorId = addItem(doorTemplate, doorX, doorY)
        if (rotation !== 0) {
          rotateItem(addedDoorId, rotation)
        }

        // Atualiza no estado de entrada estrutural
        setEntrance({
          x: resultData.entrance.x,
          y: resultData.entrance.y,
          orientation: resultData.entrance.orientation
        })
      }
    }

    // 4. Configurar pilares
    if (resultData.pillars && resultData.pillars.length > 0) {
      // Sincroniza no array do store
      setPillars(resultData.pillars)

      const pilarTemplate = PHARMACY_ITEMS.find(i => i.id === 'pilar')
      if (pilarTemplate) {
        resultData.pillars.forEach(p => {
          const px = Math.max(0, p.x - pilarTemplate.width / 2)
          const py = Math.max(0, p.y - pilarTemplate.height / 2)
          addItem(pilarTemplate, px, py)
        })
      }
    }

    // 5. Adicionar obstáculos e salas divisórias como itens de Estrutura customizados
    if (resultData.obstacles && resultData.obstacles.length > 0) {
      resultData.obstacles.forEach(obs => {
        const customTemplate = {
          id: `obstacle-${uuidv4()}`,
          category: 'ESTRUTURA' as const,
          name: obs.name || 'Sala Interna',
          icon: '🧱',
          description: 'Sala ou parede divisória identificada via IA',
          width: obs.width || 2.0,
          height: obs.height || 2.0,
          color: '#4B5563',
          fillColor: '#9CA3AF',
          strokeColor: '#374151',
          rotatable: true,
          isObstacle: true,
          price: 0,
          height3d: 2.8
        }
        
        const addedObstacleId = addItem(customTemplate, obs.x, obs.y)
        if (obs.rotation) {
          rotateItem(addedObstacleId, obs.rotation)
        }
      })
    }

    toast.success('Configurações e estruturas da planta aplicadas com sucesso!')
    onClose()

    // 6. Gerar layout otimizado da IA automaticamente baseado na nova planta
    setTimeout(async () => {
      try {
        const currentItems = useCanvasStore.getState().items
        const density = useCanvasStore.getState().layoutDensity || 'normal'
        const storeType = useCanvasStore.getState().storeType || 'premium'
        const w = useCanvasStore.getState().storeWidth
        const h = useCanvasStore.getState().storeHeight

        const result = await generateAILayout(w, h, storeType, currentItems, density)
        if (result.valid || result.items.length > 0) {
          const structural = currentItems.filter(i => 
            i.isPillar || i.isObstacle || i.isDoor || i.isEmergency || i.isRoom || i.category === 'ESTRUTURA'
          )
          useCanvasStore.setState({ items: [...structural, ...result.items], isDirty: true })
          toast.success('Layout otimizado gerado automaticamente pela IA!')
        }
      } catch (err) {
        console.error('Erro ao gerar layout automático:', err)
      }
    }, 50)
  }

  const handleClearFile = () => {
    setFile(null)
    setPreviewUrl(null)
    setResultData(null)
    setError(null)
  }

  return (
    <div className="fplan-overlay" onClick={onClose}>
      <div className="fplan-container" onClick={e => e.stopPropagation()}>
        
        <div className="fplan-head">
          <span className="fplan-title">Leitor de Planta Baixa com IA</span>
          <button className="fplan-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="fplan-body">
          <p className="fplan-desc">
            Envie uma foto de um desenho feito à mão livre (croqui) ou um desenho técnico da sua farmácia. A nossa IA identificará as dimensões físicas, pilares, salas e a porta de entrada para configurar seu espaço de trabalho.
          </p>

          {!file && !loading && (
            <div 
              className="fplan-dropzone"
              onDragOver={onDragOver}
              onDrop={onDrop}
              onClick={handleSelectClick}
            >
              <svg 
                className="fplan-upload-icon" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="fplan-upload-text">Arraste a imagem ou clique para selecionar</span>
              <span className="fplan-upload-subtext">Suporta PNG, JPEG, JPG de até 10MB</span>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileInputChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
            </div>
          )}

          {file && !loading && !resultData && (
            <div className="fplan-preview-box">
              {previewUrl && <img src={previewUrl} alt="Planta baixa carregada" className="fplan-img-preview" />}
              <span className="fplan-filename">{file.name}</span>
            </div>
          )}

          {loading && (
            <div className="fplan-loading-box">
              <div className="fplan-spinner" />
              <span className="fplan-loading-text">Analisando sua planta baixa...</span>
              <p className="fplan-desc" style={{ textAlign: 'center' }}>
                Extraindo dimensões gerais, pilares, portas e salas. Isso pode levar alguns segundos.
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="fplan-result-warning" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
              <strong>Falha na Leitura:</strong> {error}
            </div>
          )}

          {resultData && !loading && (
            <div className="fplan-results-box">
              <div className="fplan-results-title">Estrutura Identificada</div>
              
              <div className="fplan-results-grid">
                <div className="fplan-result-card">
                  <span className="fplan-result-label">Largura</span>
                  <span className="fplan-result-value">{resultData.storeWidth.toFixed(1)} m</span>
                </div>
                <div className="fplan-result-card">
                  <span className="fplan-result-label">Comprimento</span>
                  <span className="fplan-result-value">{resultData.storeHeight.toFixed(1)} m</span>
                </div>
                <div className="fplan-result-card">
                  <span className="fplan-result-label">Porta de Entrada</span>
                  <span className="fplan-result-value">
                    {resultData.entrance 
                      ? `(${resultData.entrance.x.toFixed(1)}m, ${resultData.entrance.y.toFixed(1)}m) [Parede ${resultData.entrance.orientation}]`
                      : 'Não identificada'}
                  </span>
                </div>
                <div className="fplan-result-card">
                  <span className="fplan-result-label">Pilares</span>
                  <span className="fplan-result-value">
                    {resultData.pillars.length > 0 
                      ? `${resultData.pillars.length} pilar(es)`
                      : 'Nenhum'}
                  </span>
                </div>
                <div className="fplan-result-card" style={{ gridColumn: '1 / -1' }}>
                  <span className="fplan-result-label">Salas e Paredes Divisórias</span>
                  <span className="fplan-result-value">
                    {resultData.obstacles.length > 0
                      ? resultData.obstacles.map(o => `${o.name} (${o.width.toFixed(1)}x${o.height.toFixed(1)}m)`).join(', ')
                      : 'Nenhuma'}
                  </span>
                </div>
              </div>

              <div className="fplan-result-warning">
                <strong>Atenção:</strong> Ao aplicar a nova planta, todos os itens atuais do canvas serão removidos para dar lugar às novas delimitações estruturais.
              </div>
            </div>
          )}
        </div>

        <div className="fplan-foot">
          {!resultData && !loading && file && (
            <button className="btn btn-secondary btn-sm" onClick={handleClearFile} style={{ marginRight: 'auto' }}>
              Substituir Imagem
            </button>
          )}
          
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>

          {!resultData && file && !loading && (
            <button className="btn btn-primary btn-sm" onClick={handleAnalyze} style={{ background: '#10b981' }}>
              Analisar Planta
            </button>
          )}

          {resultData && !loading && (
            <button className="btn btn-primary btn-sm" onClick={handleApply} style={{ background: '#10b981' }}>
              Aplicar no Canvas
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
