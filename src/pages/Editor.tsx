import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import type Konva from 'konva'
import type { ItemCategory } from '../types'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CanvasEditor from '../components/canvas/CanvasEditor'
import ItemLibrary from '../components/canvas/ItemLibrary'
import AiChat from '../components/ai/AiChat'
import { useCanvasStore } from '../store/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import { saveLayout, getLayoutById } from '../services/storage'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { toast } from '../store/toastStore'
import TutorialOverlay from '../components/ui/TutorialOverlay'
import BudgetPanel from '../components/canvas/BudgetPanel'
import ErgonomyPanel from '../components/canvas/ErgonomyPanel'
import { exportToCSV, exportToXLSX } from '../services/excelExport'
import FloorPlanReaderModal from '../components/canvas/FloorPlanReaderModal'
import { getFullLayoutDataUrl } from '../utils/canvasExport'
import './Editor.css'

const ThreeDViewer = lazy(() => import('../components/canvas/ThreeDViewer'))

// Linha Premium — único tipo ativo

// Inline SVG icons — no emoji, clean professional
const I = {
  Layers: () => <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Bot: () => <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M10 7a2 2 0 1 1 4 0"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="7" y1="16" x2="7" y2="16" strokeWidth="3"/><line x1="12" y1="16" x2="12" y2="16" strokeWidth="3"/><line x1="17" y1="16" x2="17" y2="16" strokeWidth="3"/></svg>,
  Cog: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Cal: () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Save: () => <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Export: () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Undo: () => <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.14"/></svg>,
  Redo: () => <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.14"/></svg>,
  Rotate: () => <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.14"/></svg>,
  Copy: () => <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
}

const CAT_ICONS = {
  GONDOLAS: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>,
  BALCOES: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
  REFRIGERACAO: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H7.05a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H17a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM2 12h20" /></svg>,
  PERFUMARIA: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 6v12M6 12h12" /><circle cx="12" cy="12" r="3" /></svg>,
  SERVICOS: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  OPERACIONAL: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  ESTRUTURA: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m9 9 6 6M15 9l-6 6" /></svg>,
  ACESSIBILIDADE: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6M13 10l-2 3M8 12h4l2-3" /><path d="M17 13a4 4 0 1 1-8 0" /></svg>,
}

const getCategoryIcon = (category: ItemCategory | string) => {
  const Icon = CAT_ICONS[category as ItemCategory] ?? CAT_ICONS.GONDOLAS
  return <Icon />
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch (e) {
    return false
  }
}

function ZoomControls() {
  const scale = useCanvasStore(state => state.scale)
  const setScale = useCanvasStore(state => state.setScale)
  return (
    <div className="tb-zoom desktop-only">
      <button className="tb-zoom-btn" onClick={() => setScale(Math.max(0.2, scale / 1.2))}>−</button>
      <span className="tb-zoom-val">{Math.round(scale * 100)}%</span>
      <button className="tb-zoom-btn" onClick={() => setScale(Math.min(4, scale * 1.2))}>+</button>
    </div>
  )
}

function MobileZoomControls() {
  const scale = useCanvasStore(state => state.scale)
  const setScale = useCanvasStore(state => state.setScale)
  return (
    <div className="mobile-top-zoom">
      <button className="mt-zoom-btn" onClick={() => setScale(Math.max(0.2, scale / 1.2))}>−</button>
      <span className="mt-zoom-val">{Math.round(scale * 100)}%</span>
      <button className="mt-zoom-btn" onClick={() => setScale(Math.min(4, scale * 1.2))}>+</button>
    </div>
  )
}

export default function Editor() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stageRef = useRef<Konva.Stage | null>(null)

  const [activeMobileTab, setActiveMobileTab] = useState<'layout' | 'library' | 'ai' | 'budget'>('layout')
  const [showSettings, setShowSettings] = useState(false)
  const [rightPanel, setRightPanel] = useState<'ai' | 'budget'>('ai')
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [showAuditoria, setShowAuditoria] = useState(false)
  const [showFloorPlanReader, setShowFloorPlanReader] = useState(false)
  const [showWebGLWarning, setShowWebGLWarning] = useState(false)

  const {
    storeWidth, storeHeight, storeType, layoutDensity, items, layoutName, selectedItemId,
    entrance, emergencyExit, pillars,
    snapToGrid, showGrid, showMeasures,
    setStoreDimensions, setStoreType, setLayoutDensity, setPillars, setEntrance, setEmergencyExit,
    toggleSnapToGrid, toggleGrid, toggleMeasures,
    deleteSelected, undo, redo, canUndo, canRedo,
    getSelectedItem, getStats, duplicateItem, rotateItem, clearCanvas, loadLayout,
  } = useCanvasStore(
    useShallow(state => ({
      storeWidth: state.storeWidth,
      storeHeight: state.storeHeight,
      storeType: state.storeType,
      layoutDensity: state.layoutDensity,
      items: state.items,
      selectedItemId: state.selectedItemId,
      entrance: state.entrance,
      emergencyExit: state.emergencyExit,
      pillars: state.pillars,
      snapToGrid: state.snapToGrid,
      showGrid: state.showGrid,
      showMeasures: state.showMeasures,
      setStoreDimensions: state.setStoreDimensions,
      setStoreType: state.setStoreType,
      setLayoutDensity: state.setLayoutDensity,
      setPillars: state.setPillars,
      setEntrance: state.setEntrance,
      setEmergencyExit: state.setEmergencyExit,
      toggleSnapToGrid: state.toggleSnapToGrid,
      toggleGrid: state.toggleGrid,
      toggleMeasures: state.toggleMeasures,
      deleteSelected: state.deleteSelected,
      undo: state.undo,
      redo: state.redo,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      getSelectedItem: state.getSelectedItem,
      getStats: state.getStats,
      duplicateItem: state.duplicateItem,
      rotateItem: state.rotateItem,
      clearCanvas: state.clearCanvas,
      loadLayout: state.loadLayout,
      layoutName: state.layoutName,
    }))
  )

  const selectedItem = getSelectedItem()
  const stats = getStats()
  const totalPrice = items.reduce((sum, item) => sum + (item.price || 0), 0)

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam === 'popular' || typeParam === 'smart' || typeParam === 'premium') {
      setStoreType(typeParam)
    } else {
      setStoreType('premium')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [showTutorial, setShowTutorial] = useState(false)

  // ── Inicialização de dados (dimensões, layout salvo, intake form) ──────
  useEffect(() => {
    const id = searchParams.get('id') || routeId
    let loadedFromId = false

    async function loadInitial() {
      if (id) {
        // Tenta localmente primeiro
        const saved = getLayoutById(id)
        if (saved) {
          loadLayout(saved)
          toast.success(`Layout "${saved.layoutName || 'Salvo'}" carregado!`)
          loadedFromId = true
        } else if (isSupabaseConfigured && supabase) {
          // Se não achou localmente, busca no Supabase
          try {
            const { data } = await supabase
              .from('layouts')
              .select('*')
              .eq('id', id)
              .maybeSingle()
            
            if (data) {
              const formatted = {
                id: data.id,
                layoutName: data.layoutName,
                storeWidth: Number(data.storeWidth),
                storeHeight: Number(data.storeHeight),
                storeType: data.storeType,
                layoutDensity: data.layoutDensity,
                items: data.items,
                shareToken: data.shareToken,
                thumbnail: data.thumbnail,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                layoutId: data.layoutId
              }
              saveLayout(formatted)
              loadLayout(formatted)
              toast.success(`Layout "${formatted.layoutName || 'Salvo'}" carregado!`)
              loadedFromId = true
            } else {
              toast.error('Layout não encontrado')
            }
          } catch (e) {
            console.warn('Erro ao carregar layout do Supabase:', e)
            toast.error('Erro de conexão ao buscar layout')
          }
        } else {
          toast.error('Layout não encontrado')
        }
      }

      // 2. Se não carregou por ID, tenta carregar dados do formulário de intake
      if (!loadedFromId) {
        const raw = sessionStorage.getItem('projefarma_intake')
        if (raw) {
          try {
            const intake = JSON.parse(raw)
            sessionStorage.removeItem('projefarma_intake') // consome apenas uma vez

            if (intake.spaceMode === 'dimensions' && intake.width && intake.height) {
              setStoreDimensions(Number(intake.width), Number(intake.height))
              toast.success(`Dimensões aplicadas: ${intake.width}×${intake.height}m`)
            } else if (intake.spaceMode === 'floorplan' && intake.floorPlanDataUrl) {
              // Injeta a imagem pendente para o FloorPlanReaderModal
              sessionStorage.setItem('projefarma_floorplan_pending', intake.floorPlanDataUrl)
              setShowFloorPlanReader(true)
            }

            if (intake.pharmacyName) {
              useCanvasStore.getState().setLayoutName(intake.pharmacyName)
            }
          } catch (e) {
            console.warn('Erro ao processar dados de intake:', e)
          }
        } else {
          // 3. Fallback: verifica se há dimensões diretas na URL (?w=...&h=...)
          const w = searchParams.get('w')
          const h = searchParams.get('h')
          if (w && h) {
            const numW = Number(w)
            const numH = Number(h)
            if (!isNaN(numW) && !isNaN(numH) && numW >= 3 && numH >= 3) {
              setStoreDimensions(numW, numH)
              toast.success(`Dimensões da URL aplicadas: ${numW}×${numH}m`)
            }
          }
        }
      }

      // 4. Controla a inicialização do tutorial (apenas se for primeira visita)
      const seen = localStorage.getItem('projefarma_tutorial_seen')
      if (!seen) {
        setShowTutorial(true)
      }
    }

    loadInitial()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId])

  // Prefetch ThreeDViewer in the background when browser is idle to ensure instant opening
  useEffect(() => {
    const prefetch = () => {
      import('../components/canvas/ThreeDViewer').catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(prefetch);
    } else {
      setTimeout(prefetch, 3000);
    }
  }, []);

  const handleOpen3D = () => {
    if (!isWebGLAvailable()) {
      setShowWebGLWarning(true)
    } else {
      setShow3D(true)
    }
  }

  // The visible canvas stage. Two CanvasEditor copies (desktop + mobile) are
  // mounted at once and share stageRef, so stageRef.current may resolve to the
  // hidden one. The store tracks whichever is actually on-screen — prefer it.
  const getActiveStage = useCallback(
    (): Konva.Stage | null =>
      (useCanvasStore.getState().stageInstance as Konva.Stage | null) ?? stageRef.current,
    []
  )

  const handleSave = useCallback(() => {
    let thumbnail = null
    try {
      const stage = getActiveStage()
      if (stage) {
        thumbnail = getFullLayoutDataUrl(stage, storeWidth, storeHeight, {
          mimeType: 'image/jpeg',
          quality: 0.6,
          pixelRatio: 0.25,
        })
      }
    } catch {}
    const saved = saveLayout({ storeWidth, storeHeight, storeType, items, thumbnail })
    if (saved) toast.success('Layout salvo')
    else toast.error('Erro ao salvar')
    return saved
  }, [storeWidth, storeHeight, storeType, items, getActiveStage])

  const handleSchedule = () => {
    const saved = handleSave()
    if (saved) navigate(`/agendar/${saved.id}`)
  }

  const downloadLayoutPNG = useCallback((silent = false) => {
    try {
      const stage = getActiveStage()
      if (!stage) return false
      const uri = getFullLayoutDataUrl(stage, storeWidth, storeHeight)
      if (!uri) return false
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const a = Object.assign(document.createElement('a'), { download: `projelayout-imagem-${timestamp}.png`, href: uri })
      a.click()
      if (!silent) {
        toast.success('Imagem PNG baixada!')
      }
      return true
    } catch {
      if (!silent) {
        toast.error('Erro ao exportar imagem')
      }
      return false
    }
  }, [storeWidth, storeHeight, getActiveStage])

  const handleExportPNG = () => {
    downloadLayoutPNG(false)
    setShowExportOptions(false)
  }

  const handleExportPDF = async () => {
    try {
      // Capture image BEFORE async import so the Konva stage is guaranteed to be mounted
      let layoutImageDataUrl: string | undefined
      try {
        const stage = getActiveStage()
        if (stage) {
          layoutImageDataUrl = getFullLayoutDataUrl(stage, storeWidth, storeHeight)
        }
      } catch { /* canvas may be tainted — proceed without image */ }

      // Also download the PNG file separately
      downloadLayoutPNG(true)

      const { exportLayoutToPDF } = await import('../services/pdfExport')
      const layoutData = { storeWidth, storeHeight, storeType, items, layoutName: layoutName || 'Meu Layout' }
      const success = exportLayoutToPDF(layoutData, layoutImageDataUrl)
      if (success) {
        toast.success('Relatório PDF gerado!')
      } else {
        toast.error('Erro ao gerar PDF')
      }
      setShowExportOptions(false)
    } catch { toast.error('Erro ao exportar PDF') }
  }

  const handleExportCSV = () => {
    try {
      downloadLayoutPNG(true)
      exportToCSV(items, layoutName || 'Meu Layout')
      toast.success('Orçamento CSV baixado!')
      setShowExportOptions(false)
    } catch { toast.error('Erro ao exportar CSV') }
  }

  const handleExportXLSX = async () => {
    try {
      downloadLayoutPNG(true)
      await exportToXLSX(items, layoutName || 'Meu Layout', storeWidth, storeHeight)
      toast.success('Orçamento Excel gerado!')
      setShowExportOptions(false)
    } catch { toast.error('Erro ao exportar Excel') }
  }
  // Tab helpers

  return (
    <div className="editor-root">

      {/* ─── TOPBAR ─── */}
      <header className="tb">
        <button className="tb-brand" onClick={() => navigate('/')} aria-label="Início" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="tb-mark" style={{ background: 'transparent', boxShadow: 'none', width: 'auto', height: 'auto', display: 'flex', alignItems: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="5" fill="#107C3F" />
              <path d="M12 7v10M7 12h10" stroke="#FCD34D" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <span className="tb-name" style={{ color: '#FCD34D', fontWeight: 800 }}>Projefarma</span>
        </button>



        <div className="tb-title desktop-only" style={{ fontSize: '12px', fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>
          {layoutName || 'New Pharmacy Layout'}
        </div>

        <div className="tb-sep desktop-only" />

        {/* Store pill */}
        <button id="btn-store" className="tb-store" onClick={() => setShowSettings(s => !s)}>
          <span className="tb-store-val">{storeWidth}×{storeHeight}m</span>
          <span className="tb-store-label desktop-only">Farmácia Premium</span>
          <span className="tb-store-arrow">▾</span>
        </button>

        <div className="tb-sep desktop-only" />

        {/* Undo / Redo */}
        <div className="tb-tools desktop-only">
          <button className="tb-tool" onClick={undo} disabled={!canUndo()} title="Desfazer (Ctrl+Z)">
            <I.Undo />
          </button>
          <button className="tb-tool" onClick={redo} disabled={!canRedo()} title="Refazer">
            <I.Redo />
          </button>
        </div>

        {/* Zoom */}
        <ZoomControls />

        {/* Actions */}
        <div className="tb-right">
          <div className="tb-status desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }} />
            <span>Project status: Connected</span>
          </div>
          <div className="tb-export-wrap desktop-only" style={{ position: 'relative' }}>
            <button className="tb-btn" onClick={() => setShowExportOptions(s => !s)}>
              <I.Export /> Exportar ▾
            </button>
            {showExportOptions && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowExportOptions(false)} />
                <div className="export-pop" style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-xs)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--sh-lg)',
                  padding: 'var(--s2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--s1)',
                  zIndex: 99,
                  minWidth: 160
                }}>
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', width: '100%', display: 'flex', gap: 'var(--s1)' }}
                    onClick={handleExportPNG}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg> Imagem PNG
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', width: '100%', display: 'flex', gap: 'var(--s1)' }}
                    onClick={handleExportPDF}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg> Relatório PDF
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', width: '100%', display: 'flex', gap: 'var(--s1)' }}
                    onClick={handleExportCSV}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg> Orçamento CSV
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', width: '100%', display: 'flex', gap: 'var(--s1)' }}
                    onClick={handleExportXLSX}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg> Planilha Excel (XLSX)
                  </button>
                </div>
              </>
            )}
          </div>

          <button id="btn-3d" className="tb-btn desktop-only" onClick={handleOpen3D}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>Visualizar 3D</span>
          </button>
          <button 
            id="btn-topbar-floorplan" 
            className="tb-btn desktop-only" 
            onClick={() => setShowFloorPlanReader(true)}
            style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34d399' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Planta Baixa (IA)</span>
          </button>
          <button id="btn-save" className="tb-btn desktop-only" onClick={handleSave}>
            <I.Save />
            <span className="desktop-only">Salvar</span>
          </button>
          <button id="btn-schedule" className="tb-btn tb-btn-primary desktop-only" onClick={handleSchedule}>
            <I.Cal /> Agendar
          </button>
        </div>
      </header>

      {/* ─── SETTINGS POPOVER ─── */}
      {showSettings && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowSettings(false)} />
          <div className="settings-pop">
            <div className="settings-pop-head">Configurações da loja</div>
            <div className="settings-pop-body">
              <div className="settings-2col">
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-w">Largura (m)</label>
                  <input id="in-w" className="input input-sm" type="number" min={4} max={50} step={0.5}
                    value={storeWidth} onChange={e => setStoreDimensions(+e.target.value || 10, storeHeight)} />
                </div>
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-h">Comprimento (m)</label>
                  <input id="in-h" className="input input-sm" type="number" min={4} max={50} step={0.5}
                    value={storeHeight} onChange={e => setStoreDimensions(storeWidth, +e.target.value || 12)} />
                </div>
              </div>
              <button 
                className="btn btn-primary btn-sm btn-full" 
                style={{ background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '8px 0' }}
                onClick={() => {
                  setShowFloorPlanReader(true)
                  setShowSettings(false)
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Importar Planta Baixa (IA)
              </button>
              {/* Tipo premium fixo — não exibe selector */}
              <div className="form-group" style={{ gap: 5 }}>
                <label className="label">Linha</label>
                <div className="input input-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.9em' }}>⭐</span> Farmácia Premium
                </div>
              </div>
              <div className="form-group" style={{ gap: 5 }}>
                <label className="label" htmlFor="in-density">Fluxo / Densidade</label>
                <select id="in-density" className="input input-sm" value={layoutDensity} onChange={e => setLayoutDensity(e.target.value as any)}>
                  <option value="spacious">🍃 Livre / Amplo (1.2m)</option>
                  <option value="normal">📐 Padrão / Regulamentar (1.0m)</option>
                  <option value="compact">🛒 Compacto / Apertado (0.8m)</option>
                </select>
              </div>
              {[
                { id: 'tog-snap', label: 'Snap ao grid', checked: snapToGrid, fn: toggleSnapToGrid },
                { id: 'tog-grid', label: 'Mostrar grid', checked: showGrid, fn: toggleGrid },
                { id: 'tog-measures', label: 'Mostrar medidas', checked: showMeasures, fn: toggleMeasures },
              ].map(t => (
                <label key={t.id} className="toggle-row">
                  <span className="toggle-row-label">{t.label}</span>
                  <div className="ios-toggle">
                    <input id={t.id} type="checkbox" checked={t.checked} onChange={t.fn} />
                    <div className="ios-track" />
                  </div>
                </label>
              ))}
                {/* Pillars */}
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-pillars">Pilares (x,y por linha)</label>
                  <textarea id="in-pillars" className="input input-sm" rows={3}
                    value={pillars.map(p => `${p.x},${p.y}`).join('\n')}
                    onChange={e => {
                      const arr = e.target.value.split('\n')
                        .map(l => l.trim())
                        .filter(l => l)
                        .map(l => {
                          const [x, y] = l.split(',').map(Number)
                          return { x, y }
                        })
                      setPillars(arr)
                    }}
                  />
                </div>
                {/* Entrance */}
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-entrance-x">Entrada - X (m)</label>
                  <input id="in-entrance-x" className="input input-sm" type="number" step={0.1}
                    value={entrance?.x ?? ''}
                    onChange={e => {
                      const x = Number(e.target.value)
                      const cur = entrance || { x: 0, y: 0, orientation: 'N' as const }
                      setEntrance({ ...cur, x })
                    }}
                  />
                </div>
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-entrance-y">Entrada - Y (m)</label>
                  <input id="in-entrance-y" className="input input-sm" type="number" step={0.1}
                    value={entrance?.y ?? ''}
                    onChange={e => {
                      const y = Number(e.target.value)
                      const cur = entrance || { x: 0, y: 0, orientation: 'N' as const }
                      setEntrance({ ...cur, y })
                    }}
                  />
                </div>
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-entrance-orient">Orientação da Entrada</label>
                  <select id="in-entrance-orient" className="input input-sm"
                    value={entrance?.orientation ?? 'N'}
                    onChange={e => {
                      const orient = e.target.value as 'N' | 'S' | 'E' | 'W'
                      const cur = entrance || { x: 0, y: 0, orientation: 'N' as const }
                      setEntrance({ ...cur, orientation: orient })
                    }}
                  >
                    <option value="N">N</option>
                    <option value="S">S</option>
                    <option value="E">E</option>
                    <option value="W">W</option>
                  </select>
                </div>
                {/* Emergency Exit */}
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-exit-x">Saída de Emergência - X (m)</label>
                  <input id="in-exit-x" className="input input-sm" type="number" step={0.1}
                    value={emergencyExit?.x ?? ''}
                    onChange={e => {
                      const x = Number(e.target.value)
                      const cur = emergencyExit || { x: 0, y: 0, orientation: 'N' as const }
                      setEmergencyExit({ ...cur, x })
                    }}
                  />
                </div>
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-exit-y">Saída de Emergência - Y (m)</label>
                  <input id="in-exit-y" className="input input-sm" type="number" step={0.1}
                    value={emergencyExit?.y ?? ''}
                    onChange={e => {
                      const y = Number(e.target.value)
                      const cur = emergencyExit || { x: 0, y: 0, orientation: 'N' as const }
                      setEmergencyExit({ ...cur, y })
                    }}
                  />
                </div>
                <div className="form-group" style={{ gap: 5 }}>
                  <label className="label" htmlFor="in-exit-orient">Orientação da Saída</label>
                  <select id="in-exit-orient" className="input input-sm"
                    value={emergencyExit?.orientation ?? 'N'}
                    onChange={e => {
                      const orient = e.target.value as 'N' | 'S' | 'E' | 'W'
                      const cur = emergencyExit || { x: 0, y: 0, orientation: 'N' as const }
                      setEmergencyExit({ ...cur, orientation: orient })
                    }}
                  >
                    <option value="N">N</option>
                    <option value="S">S</option>
                    <option value="E">E</option>
                    <option value="W">W</option>
                  </select>
                </div>
              <div style={{ height: 1, background: 'var(--border-xs)', margin: '15px 0' }} />
              <div className="label" style={{ fontSize: 'var(--fs-xs)', marginBottom: 8 }}>Exportar Planta</div>
              <div className="settings-2col" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => { handleExportPNG(); setShowSettings(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg> PNG
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => { handleExportPDF(); setShowSettings(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg> PDF
                </button>
              </div>
            </div>
            <div className="settings-pop-foot">
              <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                onClick={() => { if (confirm('Limpar todo o layout?')) { clearCanvas(); setShowSettings(false) } }}>
                Limpar layout
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(false)}>
                Fechar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── EDITOR BODY ─── */}
      <div className="editor-body desktop-only">

        {/* Left Sidebar (Catalog) */}
        <aside className="editor-sidebar-left">
          <ItemLibrary onOpenFloorPlanReader={() => setShowFloorPlanReader(true)} />
        </aside>

        {/* Canvas */}
        <main className="editor-canvas">
          <CanvasEditor stageRef={stageRef} showHeatmap={showHeatmap} showSimulation={showSimulation} />
        </main>

        {/* Right Sidebar (AI Assistant & Budget) */}
        <aside className="editor-sidebar-right">
          <div className="sb-tabs-right">
            <button id="tab-ai" className={`sb-tab-right ${rightPanel === 'ai' ? 'active' : ''}`}
              onClick={() => setRightPanel('ai')}>Assistente IA</button>
            <button id="tab-budget" className={`sb-tab-right ${rightPanel === 'budget' ? 'active' : ''}`}
              onClick={() => setRightPanel('budget')}>Orçamento</button>
          </div>
          <div className="sb-body-right">
            {rightPanel === 'ai' && <AiChat />}
            {rightPanel === 'budget' && <BudgetPanel />}
          </div>
        </aside>

        {/* Desktop props panel */}
        {selectedItem && (
          <aside className="props-panel">
            <div className="props-head">
              <div className="props-head-swatch" style={{ background: selectedItem.fillColor || 'var(--surface-muted)' }}>
                {getCategoryIcon(selectedItem.category)}
              </div>
              <div className="props-head-name">{selectedItem.name}</div>
              <button className="props-head-close" onClick={() => useCanvasStore.getState().setSelectedItem(null)}>✕</button>
            </div>
            <div className="props-body">
              <div className="form-group" style={{ gap: 4, marginBottom: 12 }}>
                <label className="label" htmlFor="desk-label">Rótulo / Nome</label>
                <input
                  id="desk-label"
                  className="input input-sm"
                  type="text"
                  value={selectedItem.label || ''}
                  onChange={e => useCanvasStore.getState().updateItemLabel(selectedItem.id, e.target.value)}
                />
              </div>

              <div className="stepper-item" style={{ marginBottom: 10 }}>
                <span className="stepper-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--text-3)' }}>Largura</span>
                <div className="stepper-controls" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-sm)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--white)', marginTop: 4 }}>
                  <button className="btn btn-sq btn-xs btn-ghost" style={{ flex: 1, borderRight: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, Math.max(0.2, selectedItem.width - 0.1), selectedItem.height)}>−</button>
                  <span className="stepper-value" style={{ flex: 1.5, textAlign: 'center', fontWeight: '700', fontSize: 'var(--fs-xs)' }}>{selectedItem.width.toFixed(1)}m</span>
                  <button className="btn btn-sq btn-xs btn-ghost" style={{ flex: 1, borderLeft: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width + 0.1, selectedItem.height)}>+</button>
                </div>
              </div>

              <div className="stepper-item" style={{ marginBottom: 12 }}>
                <span className="stepper-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--text-3)' }}>Profundidade</span>
                <div className="stepper-controls" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-sm)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--white)', marginTop: 4 }}>
                  <button className="btn btn-sq btn-xs btn-ghost" style={{ flex: 1, borderRight: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width, Math.max(0.2, selectedItem.height - 0.1))}>−</button>
                  <span className="stepper-value" style={{ flex: 1.5, textAlign: 'center', fontWeight: '700', fontSize: 'var(--fs-xs)' }}>{selectedItem.height.toFixed(1)}m</span>
                  <button className="btn btn-sq btn-xs btn-ghost" style={{ flex: 1, borderLeft: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width, selectedItem.height + 0.1)}>+</button>
                </div>
              </div>

              <div className="nudge-pad-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
                <span className="label" style={{ alignSelf: 'flex-start', fontSize: 'var(--fs-xs)' }}>Ajuste de Posição</span>
                <div className="nudge-pad">
                  <div />
                  <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x, selectedItem.y - 0.1)}>▲</button>
                  <div />
                  <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x - 0.1, selectedItem.y)}>◀</button>
                  <div className="nudge-center">0.1m</div>
                  <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x + 0.1, selectedItem.y)}>▶</button>
                  <div />
                  <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x, selectedItem.y + 0.1)}>▼</button>
                  <div />
                </div>
              </div>

              <div className="props-sep" />
              
              <div className="label" style={{ fontSize: 'var(--fs-xs)' }}>Camadas</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                <button className="btn btn-secondary btn-xs" onClick={() => useCanvasStore.getState().bringToFront(selectedItem.id)}>Frente</button>
                <button className="btn btn-secondary btn-xs" onClick={() => useCanvasStore.getState().sendToBack(selectedItem.id)}>Trás</button>
              </div>

              <div className="props-sep" />

              <div className="props-actions">
                <button className="btn btn-secondary btn-sm btn-full" onClick={() => rotateItem(selectedItem.id, 90)}>Girar 90°</button>
                <button className="btn btn-secondary btn-sm btn-full" onClick={() => duplicateItem(selectedItem.id)}>Duplicar</button>
                <button className="btn btn-danger btn-sm btn-full" onClick={deleteSelected}>Remover</button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ─── MOBILE SCREEN AREA ─── */}
      <div className="mobile-content-area mobile-only">
        <div style={{ display: activeMobileTab === 'layout' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {/* Mobile zoom widget */}
          <MobileZoomControls />
          
          {/* Canvas */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <CanvasEditor stageRef={stageRef} showHeatmap={showHeatmap} showSimulation={showSimulation} />
          </div>

          {/* Mobile canvas controls row */}
          <div className="mobile-canvas-actions">
            <button className="mc-act-btn" onClick={undo} disabled={!canUndo()}>
              <div className="mc-act-icon"><I.Undo /></div>
              <span>Desfazer</span>
            </button>
            <button className="mc-act-btn" onClick={redo} disabled={!canRedo()}>
              <div className="mc-act-icon"><I.Redo /></div>
              <span>Refazer</span>
            </button>
            <button className="mc-act-btn" onClick={handleOpen3D}>
              <div className="mc-act-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <span>3D</span>
            </button>
            <button className="mc-act-btn" onClick={() => {
              if (selectedItem) {
                // selection properties drawer will open automatically
              } else {
                toast.info("Selecione um item no canvas")
              }
            }}>
              <div className="mc-act-icon"><I.Layers /></div>
              <span>Camadas</span>
            </button>
            <button className="mc-act-btn" onClick={toggleGrid}>
              <div className="mc-act-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
              </div>
              <span>Grade</span>
            </button>
          </div>

          {/* Mobile save/schedule button */}
          <div className="mobile-save-action">
            <button className="btn btn-primary btn-lg btn-full" onClick={handleSchedule} style={{ background: '#10b981' }}>
              <I.Cal />
              <span>Salvar / Agendar</span>
              <span style={{ marginLeft: 'auto' }}>▾</span>
            </button>
          </div>
        </div>
        
        {activeMobileTab === 'library' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ItemLibrary 
              onItemAdded={() => setActiveMobileTab('layout')} 
              onOpenFloorPlanReader={() => {
                setShowFloorPlanReader(true)
                setActiveMobileTab('layout')
              }} 
            />
          </div>
        )}

        {activeMobileTab === 'ai' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <AiChat onClose={() => setActiveMobileTab('layout')} />
          </div>
        )}

        {activeMobileTab === 'budget' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <BudgetPanel />
          </div>
        )}
      </div>

      {/* ─── STATUSBAR ─── */}
      <div className="statusbar desktop-only">
        <div className="statusbar-item">
          <div className="statusbar-dot" />
          <span>{storeWidth}×{storeHeight}m · {(storeWidth * storeHeight).toFixed(0)}m²</span>
        </div>
        <div className="statusbar-item">
          <span>{stats.itemCount} itens (R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) · {stats.pillars} pilares · {stats.occupancyRate}% ocupado</span>
        </div>
        <div className="statusbar-tools">
          <button className={`statusbar-btn ${showHeatmap ? 'active-heatmap' : ''}`} onClick={() => setShowHeatmap(!showHeatmap)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2c-4 0-7 3.3-7 7 0 3.3 2.7 6 6 8.5V22h2v-4.5c3.3-2.5 6-5.2 6-8.5 0-3.7-3-7-7-7z"/><path d="M12 11c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
            <span>{showHeatmap ? 'Ocultar Calor' : 'Mapa de Calor'}</span>
          </button>
          <button className={`statusbar-btn ${showSimulation ? 'active-simulation' : ''}`} onClick={() => setShowSimulation(!showSimulation)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>{showSimulation ? 'Parar Fluxo' : 'Simular Fluxo'}</span>
          </button>
          <button className={`statusbar-btn ${showAuditoria ? 'active-auditoria' : ''}`} onClick={() => setShowAuditoria(!showAuditoria)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span>Auditoria</span>
          </button>
        </div>
        <div className="statusbar-item statusbar-right">
          <span>Scroll = zoom · Arrastar canvas = mover · Del = remover</span>
        </div>
      </div>

      {/* ─── MOBILE: Selected Item Bottom Drawer ─── */}
      {selectedItem && (
        <>
          <div className="drawer-backdrop open mobile-only" onClick={() => useCanvasStore.getState().setSelectedItem(null)} />
          <div className="drawer properties-drawer open mobile-only">
            <div className="drawer-handle" />
            <div className="drawer-titlebar">
              <div className="drawer-title-swatch" style={{ background: selectedItem.fillColor || 'var(--surface-muted)', width: 24, height: 24, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                {getCategoryIcon(selectedItem.category)}
              </div>
              <span className="drawer-title">{selectedItem.name}</span>
              <button className="drawer-close" onClick={() => useCanvasStore.getState().setSelectedItem(null)}>✕</button>
            </div>
            
            <div className="drawer-content" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px' }}>
              <div className="form-group" style={{ gap: 4, marginBottom: 12 }}>
                <label className="label" htmlFor="mob-label">Rótulo / Nome</label>
                <input
                  id="mob-label"
                  className="input"
                  type="text"
                  value={selectedItem.label || ''}
                  onChange={e => useCanvasStore.getState().updateItemLabel(selectedItem.id, e.target.value)}
                />
              </div>

              <div className="steppers-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="stepper-item">
                  <label className="label">Largura</label>
                  <div className="stepper-controls" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-sm)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--white)' }}>
                    <button className="btn btn-sq btn-ghost" style={{ flex: 1, borderRight: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, Math.max(0.2, selectedItem.width - 0.1), selectedItem.height)}>−</button>
                    <span className="stepper-value" style={{ flex: 1.5, textAlign: 'center', fontWeight: '600', fontSize: 'var(--fs-sm)' }}>{selectedItem.width.toFixed(1)}m</span>
                    <button className="btn btn-sq btn-ghost" style={{ flex: 1, borderLeft: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width + 0.1, selectedItem.height)}>+</button>
                  </div>
                </div>

                <div className="stepper-item">
                  <label className="label">Profundidade</label>
                  <div className="stepper-controls" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-sm)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--white)' }}>
                    <button className="btn btn-sq btn-ghost" style={{ flex: 1, borderRight: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width, Math.max(0.2, selectedItem.height - 0.1))}>−</button>
                    <span className="stepper-value" style={{ flex: 1.5, textAlign: 'center', fontWeight: '600', fontSize: 'var(--fs-sm)' }}>{selectedItem.height.toFixed(1)}m</span>
                    <button className="btn btn-sq btn-ghost" style={{ flex: 1, borderLeft: '1px solid var(--border-sm)' }} onClick={() => useCanvasStore.getState().updateItemSize(selectedItem.id, selectedItem.width, selectedItem.height + 0.1)}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                {/* Nudge pad */}
                <div className="nudge-pad-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="label" style={{ alignSelf: 'flex-start', marginBottom: 4 }}>Ajuste de Posição</span>
                  <div className="nudge-pad">
                    <div />
                    <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x, selectedItem.y - 0.1)}>▲</button>
                    <div />
                    <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x - 0.1, selectedItem.y)}>◀</button>
                    <div className="nudge-center">0.1m</div>
                    <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x + 0.1, selectedItem.y)}>▶</button>
                    <div />
                    <button className="nudge-btn" onClick={() => useCanvasStore.getState().updateItemPosition(selectedItem.id, selectedItem.x, selectedItem.y + 0.1)}>▼</button>
                    <div />
                  </div>
                </div>

                {/* Layer order & quick actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label">Camadas</label>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => useCanvasStore.getState().bringToFront(selectedItem.id)}>
                    Trazer p/ Frente
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => useCanvasStore.getState().sendToBack(selectedItem.id)}>
                    Enviar p/ Trás
                  </button>
                </div>
              </div>

              <div className="props-sep" style={{ height: 1, background: 'var(--border-xs)', margin: '16px 0' }} />

              <div className="drawer-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => rotateItem(selectedItem.id, 90)}>
                  <I.Rotate /> Girar 90°
                </button>
                <button className="btn btn-secondary" onClick={() => duplicateItem(selectedItem.id)}>
                  <I.Copy /> Duplicar
                </button>
                <button className="btn btn-danger" onClick={deleteSelected}>
                  <I.Trash /> Excluir
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── MOBILE BOTTOM NAV ─── */}
      <nav className="mobile-nav">
        <button id="mnav-layout" className={`mnav-btn ${activeMobileTab === 'layout' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('layout')}>
          <div className="mnav-icon"><I.Layers /></div>
          <span className="mnav-label">Layout</span>
        </button>
        <button id="mnav-library" className={`mnav-btn ${activeMobileTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('library')}>
          <div className="mnav-icon"><BookIcon /></div>
          <span className="mnav-label">Biblioteca</span>
        </button>
        
        {/* Center Plus FAB */}
        <button id="mnav-plus" className="mnav-btn" onClick={() => setActiveMobileTab('library')} style={{ marginTop: '-4px' }}>
          <div className="mnav-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1.5px solid #10b981', width: '42px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </button>

        <button id="mnav-ai" className={`mnav-btn ${activeMobileTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('ai')}>
          <div className="mnav-icon"><SparklesIcon /></div>
          <span className="mnav-label">IA Assistant</span>
        </button>
        <button id="mnav-budget" className={`mnav-btn ${activeMobileTab === 'budget' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('budget')}>
          <div className="mnav-icon"><BudgetIcon /></div>
          <span className="mnav-label">Orçamento</span>
        </button>
      </nav>
      
      {show3D && (
        <Suspense fallback={
          <div className="three-lazy-loading-placeholder" style={{
            position: 'fixed',
            inset: 0,
            background: '#060f0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            color: 'var(--green-400)',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'sans-serif'
          }}>
            <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--green-400)', borderTopColor: 'transparent', borderRadius: '50%' }} />
            <span>Iniciando motor 3D...</span>
          </div>
        }>
          <ThreeDViewer onClose={() => setShow3D(false)} showSimulation={showSimulation} />
        </Suspense>
      )}
      {showAuditoria && (
        <ErgonomyPanel onClose={() => setShowAuditoria(false)} />
      )}
      <FloorPlanReaderModal isOpen={showFloorPlanReader} onClose={() => setShowFloorPlanReader(false)} />

      {/* WebGL warning modal */}
      {showWebGLWarning && (
        <div className="webgl-warning-overlay" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="webgl-warning-container" style={{
            background: 'var(--surface-card)',
            border: '1.5px solid var(--dourado)',
            borderRadius: 'var(--r-xl)',
            boxShadow: '0 20px 50px rgba(11, 61, 46, 0.06)',
            width: '460px',
            maxWidth: '90vw',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'springIn 0.3s var(--ease-spring)'
          }}>
            <div className="webgl-warning-head" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1.5px solid var(--border-sm)',
              background: 'var(--surface-subtle)'
            }}>
              <span className="webgl-warning-title" style={{
                fontSize: 'var(--fs-md)',
                fontWeight: '800',
                color: 'var(--text-1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                ⚠️ WebGL Desativado ou Indisponível
              </span>
              <button 
                onClick={() => setShowWebGLWarning(false)} 
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  color: 'var(--text-3)',
                  background: 'rgba(11, 61, 46, 0.05)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--fs-xs)'
                }}
              >✕</button>
            </div>
            <div className="webgl-warning-body" style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: 'var(--text-2)',
              fontSize: 'var(--fs-sm)'
            }}>
              <p style={{ fontWeight: '600' }}>
                Para carregar a visualização 3D do ProjeLayout, você precisa ativar o WebGL e a aceleração gráfica por hardware no seu navegador.
              </p>
              <div style={{
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border-sm)',
                borderRadius: 'var(--r-md)',
                padding: '12px',
                fontSize: '12px',
                lineHeight: '1.5',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ fontWeight: '700', color: 'var(--text-1)' }}>Como ativar no Google Chrome / Brave / Edge:</div>
                <div>1. Clique nos três pontos (canto superior direito) e abra **Configurações**.</div>
                <div>2. Vá na seção **Sistema** no menu lateral esquerdo.</div>
                <div>3. Ative a opção **"Usar aceleração gráfica quando disponível"** (ou aceleração de hardware).</div>
                <div>4. Reinicie seu navegador e tente carregar o 3D novamente.</div>
              </div>
              <div style={{
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border-sm)',
                borderRadius: 'var(--r-md)',
                padding: '12px',
                fontSize: '12px',
                lineHeight: '1.5',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ fontWeight: '700', color: 'var(--text-1)' }}>Como verificar no Firefox:</div>
                <div>1. Digite <code>about:config</code> na barra de endereços e dê enter.</div>
                <div>2. Busque pelo parâmetro <code>webgl.disabled</code>.</div>
                <div>3. Certifique-se de que o valor está definido como <code>false</code>.</div>
              </div>
            </div>
            <div className="webgl-warning-foot" style={{
              padding: '16px 20px',
              borderTop: '1.5px solid var(--border-sm)',
              background: 'var(--surface-subtle)',
              display: 'flex',
              justifyContent: 'end',
              gap: '12px'
            }}>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setShowWebGLWarning(false)}
              >
                Voltar ao 2D
              </button>
              <button 
                className="btn btn-sm"
                style={{
                  background: 'var(--dourado)',
                  color: 'var(--verde-escuro)',
                  fontWeight: '700'
                }}
                onClick={() => {
                  if (isWebGLAvailable()) {
                    setShowWebGLWarning(false);
                    setShow3D(true);
                    toast.success("WebGL detectado com sucesso! Iniciando 3D...");
                  } else {
                    toast.error("WebGL ainda está indisponível. Ative a aceleração de hardware nas configurações.");
                  }
                }}
              >
                Verificar Novamente
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Botão flutuante de ajuda */}
      <button 
        className="tut-help-trigger desktop-only"
        onClick={() => setShowTutorial(true)}
        title="Como usar o sistema"
        style={{
          position: 'fixed',
          bottom: '50px',
          right: '24px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#10B981',
          border: '1.5px solid #FCD34D',
          color: '#fff',
          fontSize: '18px',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          zIndex: 999,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.background = '#059669';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = '#10B981';
        }}
      >
        ?
      </button>

      {showTutorial && (
        <TutorialOverlay onClose={() => setShowTutorial(false)} />
      )}
    </div>
  )
}

// Inline Icons
const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const SparklesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5zM19 17l1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
  </svg>
)

const BudgetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
    <line x1="12" y1="16" x2="16" y2="16" />
  </svg>
)
