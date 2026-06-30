import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import type Konva from 'konva'
import type { ItemCategory, CanvasItem, StoreType, LayoutDensity } from '../types'
import { generateAILayout } from '../services/heuristicLayoutGenerator'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CanvasEditor from '../components/canvas/CanvasEditor'
import ItemLibrary from '../components/canvas/ItemLibrary'
import AiChat from '../components/ai/AiChat'
import { useCanvasStore } from '../store/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import { saveLayout, getLayoutById, syncLayoutToSupabase } from '../services/storage'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { toast } from '../store/toastStore'
import TutorialOverlay from '../components/ui/TutorialOverlay'
import BudgetPanel from '../components/canvas/BudgetPanel'
import ErgonomyPanel from '../components/canvas/ErgonomyPanel'
import { exportToCSV, exportToXLSX } from '../services/excelExport'
import FloorPlanReaderModal from '../components/canvas/FloorPlanReaderModal'
import { getFullLayoutDataUrl } from '../utils/canvasExport'
import { PHARMACY_ITEMS } from '../data/items'
import { getRotatedBounds } from '../utils/geometry'
import DownloadBlockModal from '../components/canvas/DownloadBlockModal'
import './Editor.css'
import '../components/canvas/ThreeDViewer.css'

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
  Center: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" /><line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" /></svg>,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const stageRef = useRef<Konva.Stage | null>(null)

  const [activeMobileTab, setActiveMobileTab] = useState<'layout' | 'library' | 'ai' | 'budget'>('layout')
  const [showSettings, setShowSettings] = useState(false)
  const [rightPanel, setRightPanel] = useState<'ai' | 'budget'>('budget')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [show3D, setShow3D] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('view3d') === 'aerial' && isWebGLAvailable()
  })
  const [initialCameraView, setInitialCameraView] = useState<'normal' | 'aerial'>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('view3d') === 'aerial' ? 'aerial' : 'normal'
  })
  const [warningVisible, setWarningVisible] = useState(false)
  const [downloadBlocked, setDownloadBlocked] = useState(false)
  const [pdfExportModule, setPdfExportModule] = useState<any>(null)
  const downloadTimeoutRef = useRef<number | null>(null)
  const exportAttemptIdRef = useRef(0)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [showAuditoria, setShowAuditoria] = useState(false)
  const [showFloorPlanReader, setShowFloorPlanReader] = useState(false)
  const [showWebGLWarning, setShowWebGLWarning] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  const {
    storeWidth, storeHeight, storeType, layoutDensity, items, layoutName, selectedItemId,
    entrance, emergencyExit, pillars,
    snapToGrid, showGrid, showMeasures,
    setStoreDimensions, setStoreType, setLayoutDensity, setPillars, setEntrance, setEmergencyExit,
    toggleSnapToGrid, toggleGrid, toggleMeasures,
    deleteSelected, undo, redo, canUndo, canRedo,
    getSelectedItem, getStats, duplicateItem, rotateItem, clearCanvas, loadLayout,
    freightData, recenter, isDirty, lastSavedAt, markSaved,
    profileId, setProfileId, shareToken, isReadOnly, setReadOnly,
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
      setFreightData: state.setFreightData,
      freightData: state.freightData,
      recenter: state.recenter,
      isDirty: state.isDirty,
      lastSavedAt: state.lastSavedAt,
      markSaved: state.markSaved,
      profileId: state.profileId,
      setProfileId: state.setProfileId,
      shareToken: state.shareToken,
      isReadOnly: state.isReadOnly,
      setReadOnly: state.setReadOnly,
    }))
  )

  const selectedItem = getSelectedItem()
  const stats = getStats()
  const totalPrice = items.reduce((sum, item) => sum + (item.price || 0), 0)

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam === 'popular' || typeParam === 'premium' || typeParam === 'manipulacao' || typeParam === 'completa') {
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

    const isShared = searchParams.get('shared') === '1'
    setReadOnly(isShared)

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

            if (intake.profileId) {
              setProfileId(intake.profileId)
            }

            if (intake.spaceMode === 'dimensions' && intake.width && intake.height) {
              useCanvasStore.getState().clearCanvas()
              setStoreDimensions(Number(intake.width), Number(intake.height))
              toast.success(`Dimensões aplicadas: ${intake.width}×${intake.height}m`)

              // Instanciar porta de entrada se configurada
              if (intake.door) {
                const hasDoor = useCanvasStore.getState().items.some(i => i.itemId === 'porta-entrada' || i.isDoor)
                if (!hasDoor) {
                  const doorTemplate = PHARMACY_ITEMS.find(i => i.id === 'porta-entrada')
                  if (doorTemplate) {
                    const doorWidth = Number(intake.door.width) || 2.0
                    const orient = intake.door.orientation || 'S'
                    const offset = Number(intake.door.offset) || 0.0
                    const storeW = Number(intake.width)
                    const storeH = Number(intake.height)

                    let rotation = 0
                    if (orient === 'E') rotation = 90
                    else if (orient === 'N') rotation = 180
                    else if (orient === 'W') rotation = 270

                    let x = 0
                    let y = 0
                    if (orient === 'S') {
                      x = offset
                      y = storeH - 0.15
                    } else if (orient === 'N') {
                      x = offset + doorWidth
                      y = 0.15
                    } else if (orient === 'W') {
                      x = 0
                      y = offset + doorWidth
                    } else if (orient === 'E') {
                      x = storeW
                      y = offset
                    }

                    const addedDoorId = useCanvasStore.getState().addItem(doorTemplate, x, y)
                    if (rotation !== 0) {
                      useCanvasStore.getState().rotateItem(addedDoorId, rotation)
                    }
                    useCanvasStore.getState().updateItemSize(addedDoorId, doorWidth, 0.15)
                    
                    const bounds = getRotatedBounds(x, y, doorWidth, 0.15, rotation)
                    useCanvasStore.getState().setEntrance({
                      x: bounds.x + bounds.width / 2,
                      y: bounds.y + bounds.height / 2,
                      orientation: orient
                    })
                  }
                }
              }

              // Instanciar segunda porta (farmácia de esquina)
              if (intake.door2) {
                const door2Template = PHARMACY_ITEMS.find(i => i.id === 'porta-entrada') ||
                                     PHARMACY_ITEMS.find(i => i.isDoor)
                if (door2Template) {
                  const d2Width = Number(intake.door2.width) || 2.0
                  const d2Orient = intake.door2.orientation || 'E'
                  const d2Offset = Number(intake.door2.offset) || 0.0
                  const storeW2 = Number(intake.width)
                  const storeH2 = Number(intake.height)

                  let d2Rot = 0
                  if (d2Orient === 'E') d2Rot = 90
                  else if (d2Orient === 'N') d2Rot = 180
                  else if (d2Orient === 'W') d2Rot = 270

                  let d2X = 0, d2Y = 0
                  if (d2Orient === 'S') { d2X = d2Offset; d2Y = storeH2 - 0.15 }
                  else if (d2Orient === 'N') { d2X = d2Offset + d2Width; d2Y = 0.15 }
                  else if (d2Orient === 'W') { d2X = 0; d2Y = d2Offset + d2Width }
                  else { d2X = storeW2; d2Y = d2Offset }

                  const addedDoor2Id = useCanvasStore.getState().addItem(door2Template, d2X, d2Y)
                  if (d2Rot !== 0) useCanvasStore.getState().rotateItem(addedDoor2Id, d2Rot)
                  useCanvasStore.getState().updateItemSize(addedDoor2Id, d2Width, 0.15)

                  // Store isCorner flag in sessionStorage for ThreeDViewer
                  if (intake.isCorner) {
                    sessionStorage.setItem('projefarma_corner', JSON.stringify({ isCorner: true, door2: intake.door2 }))
                  }
                }
              }


              // Gerar layout otimizado automaticamente
              setTimeout(async () => {
                try {
                  const w = Number(intake.width)
                  const h = Number(intake.height)
                  const currentItems = useCanvasStore.getState().items
                  const density = useCanvasStore.getState().layoutDensity || 'normal'
                  const storeType = useCanvasStore.getState().storeType || 'premium'

                  const result = await generateAILayout(w, h, storeType, currentItems, density)
                  if (result.valid || result.items.length > 0) {
                    const structural = currentItems.filter(i => 
                      i.isPillar || i.isObstacle || i.isDoor || i.isEmergency || i.isRoom || i.category === 'ESTRUTURA'
                    )
                    useCanvasStore.setState({ 
                      items: [...structural, ...result.items] as CanvasItem[], 
                      isDirty: true 
                    })
                    useCanvasStore.getState().saveToHistory()
                    toast.success('Layout otimizado gerado automaticamente pela IA!')
                  }
                } catch (err) {
                  console.error('Erro ao gerar layout automático pós-intake:', err)
                }
              }, 50)
            } else if (intake.spaceMode === 'floorplan' && intake.floorPlanDataUrl) {
              // Injeta a imagem pendente para o FloorPlanReaderModal
              sessionStorage.setItem('projefarma_floorplan_pending', intake.floorPlanDataUrl)
              setShowFloorPlanReader(true)
            }

            if (intake.pharmacyName) {
              useCanvasStore.getState().setLayoutName(intake.pharmacyName)
            }
            if (intake.freightData) {
              useCanvasStore.getState().setFreightData(intake.freightData)
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
              if (numW * numH <= 700) {
                setStoreDimensions(numW, numH)
                toast.success(`Dimensões da URL aplicadas: ${numW}×${numH}m`)
              } else {
                toast.error('As dimensões na URL excedem o limite permitido de 700m².')
              }
            }
          }
        }
      }

      // 4. Controla a inicialização do tutorial (apenas se for primeira visita)
      const seen = localStorage.getItem('projefarma_tutorial_seen')
      if (!seen) {
        setShowTutorial(true)
      }

      // 5. Verifica se deve abrir o 3D diretamente
      const view3dParam = searchParams.get('view3d')
      if (view3dParam) {
        if (view3dParam === 'aerial') {
          setInitialCameraView('aerial')
        }
        
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('view3d')
        setSearchParams(newParams, { replace: true })

        if (isWebGLAvailable()) {
          setShow3D(true)
        } else {
          setShowWebGLWarning(true)
        }
      }
    }

    loadInitial()
    return () => {
      setReadOnly(false)
    }
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

  // Preload PDF export module to avoid async delay during user-initiated click
  useEffect(() => {
    import('../services/pdfExport')
      .then(module => {
        setPdfExportModule(module)
      })
      .catch(err => {
        console.warn('Failed to preload pdfExport:', err)
      })

    return () => {
      if (downloadTimeoutRef.current) {
        window.clearTimeout(downloadTimeoutRef.current)
      }
    }
  }, [])

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

  const handleSave = useCallback(async (silent = false) => {
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
    const currentId = useCanvasStore.getState().layoutId || routeId || undefined
    const nameToSave = useCanvasStore.getState().layoutName || 'Layout'
    const saved = saveLayout({
      id: currentId,
      layoutName: nameToSave,
      storeWidth,
      storeHeight,
      storeType,
      items,
      thumbnail
    })
    if (saved) {
      const syncResult = await syncLayoutToSupabase(saved)
      if (syncResult.success) {
        if (!silent) toast.success('Layout salvo e sincronizado na nuvem!')
        markSaved()
        if (saved.id) {
          useCanvasStore.setState({ layoutId: saved.id, shareToken: saved.shareToken, profileId: saved.profileId })
        }
      } else {
        if (!silent) {
          toast.error(`Salvo localmente. Erro ao salvar na nuvem: ${syncResult.error?.message || 'Erro de conexão'}`)
        } else {
          throw new Error(syncResult.error?.message || 'Erro ao sincronizar com o banco de dados do Supabase.')
        }
      }
    } else if (!silent) {
      toast.error('Erro ao salvar localmente')
    }
    return saved
  }, [storeWidth, storeHeight, storeType, items, getActiveStage, routeId, markSaved])

  const handleShareClick = useCallback(async () => {
    const currentId = useCanvasStore.getState().layoutId || routeId
    const currentShareToken = useCanvasStore.getState().shareToken || shareToken
    if (!currentId || !currentShareToken) {
      toast.info("Salvando e publicando o projeto antes de compartilhar...")
      try {
        const saved = await handleSave(true)
        if (saved && saved.shareToken) {
          setShowShareModal(true)
        } else {
          toast.error("Erro ao salvar projeto para compartilhar.")
        }
      } catch (err: any) {
        toast.error(`Falha ao compartilhar: ${err.message || 'Erro de conexão com a nuvem'}`)
      }
    } else {
      setShowShareModal(true)
    }
  }, [routeId, shareToken, handleSave])


  const [showEmailModal, setShowEmailModal] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  const handleSendEmail = async (recipientName: string, recipientEmail: string, recipientPhone: string) => {
    setSendingEmail(true)
    try {
      // 1. Salva o layout na nuvem antes para garantir que temos o shareToken atualizado
      const saved = await handleSave(true)
      if (!saved || !saved.shareToken) {
        throw new Error('Não foi possível salvar o layout na nuvem para obter o link de compartilhamento.')
      }

      // 2. Agrupar os itens do orçamento para a tabela do e-mail (ignorando pilares, obstáculos e portas)
      const groupedItems = items.reduce((acc: any[], item) => {
        if (item.isPillar || item.isObstacle || item.isDoor) return acc
        const existing = acc.find(i => i.name === item.name)
        if (existing) {
          existing.quantity += 1
          existing.total += item.price || 0
        } else {
          acc.push({
            name: item.name,
            quantity: 1,
            price: item.price || 0,
            total: item.price || 0
          })
        }
        return acc
      }, [])

      // Calcula o preço total sem contar portas e pilares
      const totalPrice = items
        .filter(item => !item.isPillar && !item.isDoor)
        .reduce((acc, item) => acc + (item.price || 0), 0)

      const shareUrl = `${window.location.origin}/layout/${saved.shareToken}`

      // 3. Captura a imagem do layout (canvas)
      let layoutImageDataUrl: string | undefined
      try {
        const stage = getActiveStage()
        if (stage) {
          layoutImageDataUrl = getFullLayoutDataUrl(stage, storeWidth, storeHeight)
        }
      } catch { /* prossegue sem imagem se canvas estiver bloqueado */ }

      // 4. Invocar a Edge Function do Supabase
      if (!supabase) throw new Error("Supabase não está configurado.")
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          action: 'send-proposal',
          name: recipientName,
          email: recipientEmail,
          phone: recipientPhone,
          layoutName: saved.layoutName || 'Layout sem nome',
          storeWidth,
          storeHeight,
          shareUrl,
          items: groupedItems,
          totalBudget: totalPrice,
          layoutImage: saved.thumbnail // Passamos a imagem do layout
        }
      })

      if (error) throw error

      toast.success('Proposta enviada por e-mail com sucesso!')
      setShowEmailModal(false)

      // 5. Envia webhook para o n8n (WhatsApp) — fire and forget, não bloqueia o fluxo
      try {
        const { exportLayoutToPDFBase64 } = await import('../services/pdfExport')
        const pdfBase64 = exportLayoutToPDFBase64(
          { storeWidth, storeHeight, storeType, items, layoutName: saved.layoutName || 'Meu Layout', freightData },
          layoutImageDataUrl
        )

        const webhookPayload = {
          phone: recipientPhone,
          clientName: recipientName,
          layoutName: saved.layoutName || 'Meu Layout',
          shareUrl,
          layoutImage: layoutImageDataUrl || saved.thumbnail || null,
          pdfBase64: pdfBase64 || null,
        }

        fetch('https://n8n.projefarma.online/webhook/happy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': import.meta.env.VITE_WEBHOOK_SECRET || 'projefarma-happy-2025',
          },
          body: JSON.stringify(webhookPayload),
        }).catch(err => console.warn('[Webhook] Falha ao notificar n8n:', err))
      } catch (webhookErr) {
        console.warn('[Webhook] Erro ao preparar payload:', webhookErr)
      }

    } catch (err: any) {
      console.error('Erro ao enviar e-mail de proposta:', err)
      toast.error(`Erro ao enviar e-mail: ${err.message || 'Falha de comunicação'}`)
    } finally {
      setSendingEmail(false)
    }
  }


  // Autosave: salva silenciosamente ~2,5s após a última alteração (apenas layouts já salvos,
  // para não criar registros órfãos de layouts novos que o usuário ainda não nomeou/salvou).
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!isDirty) return
    if (!(useCanvasStore.getState().layoutId || routeId)) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => handleSave(true), 2500)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [items, storeWidth, storeHeight, storeType, layoutName, isDirty, routeId, handleSave])

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

  const startSmartTimeout = (attemptId: number) => {
    if (downloadTimeoutRef.current) {
      window.clearTimeout(downloadTimeoutRef.current)
    }
    const alreadyAllowed = localStorage.getItem('multiple_downloads_allowed') === 'true'
    if (alreadyAllowed) return

    downloadTimeoutRef.current = window.setTimeout(() => {
      if (attemptId === exportAttemptIdRef.current) {

        setDownloadBlocked(true)
        setWarningVisible(true)
      }
    }, 2500)
  }

  const handleExportPDF = async () => {
    const currentAttemptId = ++exportAttemptIdRef.current


    // Reset state for the new export attempt
    if (downloadTimeoutRef.current) {
      window.clearTimeout(downloadTimeoutRef.current)
    }
    setWarningVisible(false)
    setDownloadBlocked(false)


    try {
      if (freightData?.freightCost === undefined || freightData?.freightCost === null) {
        toast.error('Não foi possível gerar o orçamento porque o frete ainda não foi calculado.')
        setShowExportOptions(false)
        return
      }

      // Capture image BEFORE any potentially async path
      let layoutImageDataUrl: string | undefined
      try {
        const stage = getActiveStage()
        if (stage) {
          layoutImageDataUrl = getFullLayoutDataUrl(stage, storeWidth, storeHeight)
        }
      } catch { /* canvas may be tainted — proceed without image */ }

      const runDownloads = (exportFn: any) => {
        // Download PNG file
        const pngSuccess = downloadLayoutPNG(true)
        if (pngSuccess) {

        }

        // Download PDF file
        const layoutData = { storeWidth, storeHeight, storeType, items, layoutName: layoutName || 'Meu Layout', freightData }
        const pdfSuccess = exportFn(layoutData, layoutImageDataUrl)
        if (pdfSuccess) {

        }

        if (pngSuccess && pdfSuccess) {

          // Reset states immediately
          setDownloadBlocked(false)
          setWarningVisible(false)


          // Start the smart timeout checking for browser-level block
          startSmartTimeout(currentAttemptId)
        } else {

          setDownloadBlocked(true)
          setWarningVisible(true)
        }

        setShowExportOptions(false)
      }

      if (pdfExportModule) {
        runDownloads(pdfExportModule.exportLayoutToPDF)
      } else {
        const module = await import('../services/pdfExport')
        setPdfExportModule(module)
        runDownloads(module.exportLayoutToPDF)
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar PDF')
    }
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
          <span className="tb-store-label desktop-only hide-tablet-text">Farmácia Premium</span>
          <span className="tb-store-arrow">▾</span>
        </button>

        <div className="tb-sep desktop-only" />

        {/* Undo / Redo */}
        {!isReadOnly && (
          <div className="tb-tools desktop-only">
            <button className="tb-tool" onClick={undo} disabled={!canUndo()} title="Desfazer (Ctrl+Z)">
              <I.Undo />
            </button>
            <button className="tb-tool" onClick={redo} disabled={!canRedo()} title="Refazer">
              <I.Redo />
            </button>
          </div>
        )}

        {/* Zoom */}
        <ZoomControls />

        <button className="tb-btn desktop-only" onClick={recenter} title="Centralizar Visualização" style={{ height: 32 }}>
          <I.Center /> <span className="hide-tablet-text">Centralizar</span>
        </button>

        {!isReadOnly && (
          <button className="tb-btn tb-btn-danger desktop-only" onClick={() => { if (confirm('Limpar todo o layout?')) clearCanvas() }} title="Limpar todo o layout" style={{ height: 32 }}>
            <I.Trash /> <span className="hide-tablet-text">Limpar Layout</span>
          </button>
        )}

        {/* Actions */}
        <div className="tb-right">
          <button className="tb-btn desktop-only" onClick={() => setShowEmailModal(true)} style={{ background: '#2563eb', borderColor: '#2563eb', color: '#ffffff' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span className="hide-tablet-text">Receber por E-mail</span>
          </button>

          <button id="btn-3d" className="tb-btn desktop-only" onClick={handleOpen3D}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span className="hide-tablet-text">Visualizar 3D</span>
          </button>


          {!isReadOnly && (
            <button id="btn-save" className="tb-btn desktop-only" onClick={() => handleSave()}>
              <I.Save />
              <span className="hide-tablet-text">Salvar</span>
            </button>
          )}

          {!isReadOnly && (
            <button id="btn-share" className="tb-btn desktop-only" onClick={handleShareClick} style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span className="hide-tablet-text">Compartilhar</span>
            </button>
          )}

          {!isReadOnly && (
            <span className="tb-save-status" aria-live="polite">
              {isDirty
                ? <><span className="tb-save-dot dirty" />Não salvo</>
                : lastSavedAt
                  ? <><span className="tb-save-dot saved" />Salvo</>
                  : null}
            </span>
          )}

          {isReadOnly && (
            <button id="btn-create-own" className="tb-btn tb-btn-primary desktop-only" onClick={() => navigate('/novo-layout')} style={{ background: '#10b981', borderColor: '#10b981' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hide-tablet-text">Criar Meu Projeto</span>
            </button>
          )}
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

              {[
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
        {!isReadOnly && (
          <aside className={`editor-sidebar-left ${leftSidebarOpen ? 'open' : 'collapsed'}`}>
            <ItemLibrary 
              isOpen={leftSidebarOpen} 
              onToggleOpen={setLeftSidebarOpen} 
            />
          </aside>
        )}

        {/* Canvas */}
        <main className="editor-canvas">
          <CanvasEditor stageRef={stageRef} showHeatmap={showHeatmap} showSimulation={showSimulation} />
        </main>

        {/* Right Sidebar (Budget) */}
        <aside className="editor-sidebar-right">
          <div className="sb-tabs-right">
            <button id="tab-budget" className="sb-tab-right active" style={{ cursor: 'default' }}>
              Orçamento do Projeto
            </button>
          </div>
          <div className="sb-body-right">
            <BudgetPanel onRequestEmail={() => setShowEmailModal(true)} />
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
            {!isReadOnly && (
              <button className="mc-act-btn" onClick={undo} disabled={!canUndo()}>
                <div className="mc-act-icon"><I.Undo /></div>
                <span>Desfazer</span>
              </button>
            )}
            {!isReadOnly && (
              <button className="mc-act-btn" onClick={redo} disabled={!canRedo()}>
                <div className="mc-act-icon"><I.Redo /></div>
                <span>Refazer</span>
              </button>
            )}
            <button className="mc-act-btn" onClick={handleOpen3D}>
              <div className="mc-act-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <span>3D</span>
            </button>
            <button className="mc-act-btn" onClick={handleShareClick}>
              <div className="mc-act-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <span>Partilhar</span>
            </button>
            <button className="mc-act-btn" onClick={toggleGrid}>
              <div className="mc-act-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
              </div>
              <span>Grade</span>
            </button>
          </div>

          {/* Mobile email action button */}
          <div className="mobile-save-action">
            {!isReadOnly ? (
              <button className="btn btn-primary btn-lg btn-full" onClick={() => setShowEmailModal(true)} style={{ background: '#2563eb', borderColor: '#2563eb' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span>Receber por E-mail</span>
              </button>
            ) : (
              <button className="btn btn-primary btn-lg btn-full" onClick={() => navigate('/novo-layout')} style={{ background: '#10b981', borderColor: '#10b981' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span>Criar Meu Projeto</span>
              </button>
            )}
          </div>
        </div>
        
        {activeMobileTab === 'library' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ItemLibrary 
              onItemAdded={() => setActiveMobileTab('layout')} 
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
            <BudgetPanel onRequestEmail={() => setShowEmailModal(true)} />
          </div>
        )}
      </div>

      {/* ─── STATUSBAR ─── */}
      <div className="statusbar desktop-only">
        <div className="statusbar-item hide-tablet-item">
          <div className="statusbar-dot" />
          <span>{storeWidth}×{storeHeight}m · {(storeWidth * storeHeight).toFixed(0)}m²</span>
        </div>
        <div className="statusbar-item hide-tablet-item">
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
        <div className="statusbar-item statusbar-right hide-tablet-item">
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
        {!isReadOnly && (
          <button id="mnav-library" className={`mnav-btn ${activeMobileTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveMobileTab('library')}>
            <div className="mnav-icon"><BookIcon /></div>
            <span className="mnav-label">Biblioteca</span>
          </button>
        )}
        
        {/* Center Plus FAB */}
        {!isReadOnly && (
          <button id="mnav-plus" className="mnav-btn" onClick={() => setActiveMobileTab('library')} style={{ marginTop: '-4px' }}>
            <div className="mnav-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1.5px solid #10b981', width: '42px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </button>
        )}

        {!isReadOnly && (
          <button id="mnav-ai" className={`mnav-btn ${activeMobileTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveMobileTab('ai')}>
            <div className="mnav-icon"><SparklesIcon /></div>
            <span className="mnav-label">IA Assistant</span>
          </button>
        )}
        <button id="mnav-budget" className={`mnav-btn ${activeMobileTab === 'budget' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('budget')}>
          <div className="mnav-icon"><BudgetIcon /></div>
          <span className="mnav-label">Orçamento</span>
        </button>
      </nav>
      
      {show3D && (
        <Suspense fallback={
          <div className="hud-loader">
            <div className="loader-content">
              {/* Logo / Icon Area */}
              <div className="loader-icon-container">
                <svg className="loader-cube-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <div className="loader-glow-ring" />
              </div>
              
              {/* Title & Brand */}
              <h2 className="loader-title">Projefarma 3D</h2>
              <p className="loader-subtitle">Criando maquete tridimensional estratégica</p>

              {/* Progress Bar Container */}
              <div className="loader-progress-box">
                <div className="loader-progress-info">
                  <span className="loader-progress-text">Iniciando motor 3D...</span>
                  <span className="loader-progress-percentage">Carregando...</span>
                </div>
                <div className="loader-progress-track">
                  <div className="loader-progress-fill" style={{ width: '15%' }} />
                </div>
              </div>

              {/* Dicas / Tips Card */}
              <div className="loader-tip-card">
                <span className="loader-tip-tag">💡 DICA PROJEFARMA</span>
                <p className="loader-tip-text">
                  Após o carregamento, você poderá caminhar pela farmácia usando as teclas WASD e explorar cada detalhe do layout.
                </p>
              </div>
            </div>
          </div>
        }>
          <ThreeDViewer 
            onClose={() => setShow3D(false)} 
            showSimulation={showSimulation} 
            initialCameraView={initialCameraView} 
            onSendEmail={() => setShowEmailModal(true)}
          />
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
      {/* Floating AI Chat Widget */}
      <div className="floating-chat-container">
        {isChatOpen && (
          <div className="floating-chat-window">
            <div className="floating-chat-header">
              <div className="floating-chat-header-info">
                <h4 className="floating-chat-header-title">Assistente Projefarma IA</h4>
                <div className="floating-chat-header-subtitle">
                  <span className="floating-chat-header-status-dot" />
                  ChatGPT Ativo
                </div>
              </div>
              <button className="floating-chat-header-close" onClick={() => setIsChatOpen(false)}>✕</button>
            </div>
            <div className="floating-chat-body">
              <AiChat />
            </div>
          </div>
        )}
        <button 
          className="floating-chat-button" 
          onClick={() => setIsChatOpen(!isChatOpen)}
          title="Fale com nosso assistente de IA"
        >
          {isChatOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
          <span className="floating-chat-tooltip">Pergunte ao ProjeChat</span>
        </button>
      </div>

      {/* Botão flutuante de ajuda */}
      <button 
        className="tut-help-trigger desktop-only"
        onClick={() => setShowTutorial(true)}
        title="Como usar o sistema"
        style={{
          position: 'fixed',
          bottom: '96px',
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

      {warningVisible && (
        <DownloadBlockModal
          isOpen={warningVisible}
          onClose={() => setWarningVisible(false)}
          onRetry={() => {
            setWarningVisible(false)
            handleExportPDF()
          }}
        />
      )}

      {showShareModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }} onClick={() => setShowShareModal(false)}>
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-xs)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--sh-xl)',
            width: '90%',
            maxWidth: '480px',
            padding: 'var(--s6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s4)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Compartilhar Projeto</h3>
              <button 
                onClick={() => setShowShareModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              Qualquer pessoa com este link poderá visualizar a planta 2D, as estatísticas de corredores e o visualizador 3D do seu projeto.
            </p>
            <div style={{ display: 'flex', gap: 'var(--s2)' }}>
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/layout/${useCanvasStore.getState().shareToken || shareToken || ''}`}
                style={{
                  flex: 1,
                  background: 'var(--surface-input)',
                  border: '1px solid var(--border-xs)',
                  borderRadius: 'var(--r-md)',
                  padding: '10px var(--s3)',
                  fontSize: '0.875rem',
                  color: 'var(--text-2)',
                  outline: 'none'
                }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn btn-primary"
                style={{ padding: '0 var(--s4)', background: '#10b981', borderColor: '#10b981' }}
                onClick={() => {
                  const token = useCanvasStore.getState().shareToken || shareToken || ''
                  navigator.clipboard.writeText(`${window.location.origin}/layout/${token}`)
                  toast.success("Link copiado para a área de transferência!")
                }}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}
      {showEmailModal && (
        <SendEmailModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          onSend={handleSendEmail}
          isSending={sendingEmail}
        />
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

interface SendEmailModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (name: string, email: string, phone: string) => Promise<void>
  isSending: boolean
}

function SendEmailModal({ isOpen, onClose, onSend, isSending }: SendEmailModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (!isOpen) return
    try {
      const rawDetails = sessionStorage.getItem('projefarma_client_details')
      if (rawDetails) {
        const details = JSON.parse(rawDetails)
        if (details.clientName) setName(details.clientName)
        if (details.clientPhone) setPhone(details.clientPhone)
      }
    } catch {}
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Por favor, informe o seu nome.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Por favor, informe um e-mail válido.')
      return
    }
    if (!phone.trim()) {
      toast.error('Por favor, informe seu telefone/WhatsApp.')
      return
    }
    onSend(name, email, phone)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }} onClick={onClose}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-xs)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--sh-xl)',
        width: '90%',
        maxWidth: '440px',
        padding: 'var(--s6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s4)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Receber Projeto por E-mail</h3>
          <button 
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>
        
        <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          Enviaremos um e-mail completo com o link de visualização 3D interativa do seu projeto e o orçamento detalhado dos mobiliários.
        </p>

        <div className="form-group" style={{ gap: 4 }}>
          <label className="label" htmlFor="email-modal-name">Seu Nome</label>
          <input
            id="email-modal-name"
            className="input"
            type="text"
            placeholder="Nome Completo"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            disabled={isSending}
          />
        </div>

        <div className="form-group" style={{ gap: 4 }}>
          <label className="label" htmlFor="email-modal-email">E-mail para Envio</label>
          <input
            id="email-modal-email"
            className="input"
            type="email"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={isSending}
          />
        </div>

        <div className="form-group" style={{ gap: 4 }}>
          <label className="label" htmlFor="email-modal-phone">Telefone / WhatsApp</label>
          <input
            id="email-modal-phone"
            className="input"
            type="text"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            disabled={isSending}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8, background: '#3b82f6', borderColor: '#3b82f6', height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          disabled={isSending}
        >
          {isSending ? (
            <>
              <div className="shared-spinner" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', marginRight: 4 }} />
              Enviando...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Enviar Proposta
            </>
          )}
        </button>
      </form>
    </div>
  )
}
