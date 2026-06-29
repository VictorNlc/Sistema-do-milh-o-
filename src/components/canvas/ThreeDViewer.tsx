import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useCanvasStore } from '../../store/canvasStore'
import { useShallow } from 'zustand/react/shallow'
import { getRotatedBounds } from '../../utils/geometry'
import { generateCustomersSimulation, CustomerData } from '../../services/customerSimulation'
import './ThreeDViewer.css'

// Height estimations in meters based on item categories
const CATEGORY_HEIGHTS: Record<string, number> = {
  GONDOLAS: 1.6,
  BALCOES: 1.05, // normal counters height is 1.05m
  REFRIGERACAO: 1.8,
  PERFUMARIA: 1.5,
  SERVICOS: 1.0,
  OPERACIONAL: 0.8,
  ESTRUTURA: 3.0, // pillars go ceiling-high
  ACESSIBILIDADE: 0.4
}

// Floor styling configurations
const FLOOR_STYLES = {
  grid: { color: 0x070f0b, roughness: 0.8, metalness: 0.1, showGrid: true, gridColor: 0x107c3f },
  marble: { color: 0xf3f4f6, roughness: 0.15, metalness: 0.0, showGrid: true, gridColor: 0xd1d5db },
  wood: { color: 0xb45309, roughness: 0.45, metalness: 0.0, showGrid: false, gridColor: 0x000000 },
  concrete: { color: 0x4b5563, roughness: 0.9, metalness: 0.1, showGrid: false, gridColor: 0x000000 }
}

// Wall color configurations
const WALL_COLORS = {
  mint: 0x0d2217,
  white: 0xf9fafb,
  gray: 0x374151,
  blue: 0x1e3a8a
}

// Neutral light-concrete/stucco for solid (no-vitrine) facades — kept independent of the
// interior wall paint so a solid frontage looks like finished concrete, not the painted wall.
const FACADE_CONCRETE = { color: 0xd9d4cc, roughness: 0.85, metalness: 0.05 }

// A floor grid that matches the store's REAL rectangle (w × h) at ~1 m spacing. THREE.GridHelper is
// always square (size × size), so a 10×12 store got a 12×12 grid overhanging the side walls and
// reading as square/oversized. This draws lines exactly to the store bounds instead.
const createFloorGrid = (w: number, h: number, color: number): THREE.LineSegments => {
  const pts: number[] = []
  const nx = Math.max(1, Math.round(w))
  const nz = Math.max(1, Math.round(h))
  for (let i = 0; i <= nx; i++) {
    const x = Math.min(w / 2, -w / 2 + i)
    pts.push(x, 0, -h / 2, x, 0, h / 2)
  }
  for (let j = 0; j <= nz; j++) {
    const z = Math.min(h / 2, -h / 2 + j)
    pts.push(-w / 2, 0, z, w / 2, 0, z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
  const grid = new THREE.LineSegments(geo, mat)
  grid.position.y = 0.01
  return grid
}

const TOUR_SCENES = [
  { name: 'Fachada Principal', mode: 'orbit' as const },
  { name: 'Entrada da Loja', mode: 'first-person' as const },
  { name: 'Corredor Central', mode: 'first-person' as const },
  { name: 'Balcão de Medicamentos', mode: 'first-person' as const },
  { name: 'Perfumaria e Cosméticos', mode: 'first-person' as const },
  { name: 'Vista Panorâmica', mode: 'orbit' as const },
  { name: 'Planta Baixa Aérea', mode: 'orbit' as const }
]

// Global cache for soft contact shadow texture
let cachedShadowTexture: THREE.CanvasTexture | null = null

const getContactShadowTexture = (): THREE.CanvasTexture => {
  if (cachedShadowTexture) return cachedShadowTexture

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 28)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)')
    gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.45)')
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
  }

  const texture = new THREE.CanvasTexture(canvas)
  cachedShadowTexture = texture
  return texture
}

// Helper to draw text onto a 2D canvas and convert it to a Three.js texture
const createSignageTexture = (text: string, bgColor: string, textColor: string): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.warn("Nenhum contexto 2D disponível para textura de sinalização")
    return new THREE.Texture() as THREE.CanvasTexture
  }
  
  // Background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // Border glow
  ctx.strokeStyle = '#10b981'
  ctx.lineWidth = 8
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12)
  
  // Text — auto-shrink the font so long pharmacy names fit instead of clipping
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const upper = text.toUpperCase()
  const maxTextWidth = canvas.width - 48
  let fontSize = 56
  ctx.font = `bold ${fontSize}px sans-serif`
  while (fontSize > 16 && ctx.measureText(upper).width > maxTextWidth) {
    fontSize -= 2
    ctx.font = `bold ${fontSize}px sans-serif`
  }
  ctx.fillText(upper, canvas.width / 2, canvas.height / 2)

  return new THREE.CanvasTexture(canvas)
}

// Helper to generate small colorful 3D packages and bottles on shelves
const addProductMeshes = (group: THREE.Group, width: number, shelfY: number, depthOffset: number): void => {
  const productCount = Math.floor((width - 0.1) / 0.11)
  if (productCount <= 0) return
  const colors = [0xffffff, 0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4]
  
  for (let d = 0; d < productCount; d++) {
    const px = -width / 2 + 0.06 + d * 0.11 + (Math.random() - 0.5) * 0.02
    
    const isCylinder = Math.random() > 0.4
    const pW = 0.03 + Math.random() * 0.03
    const pH = 0.05 + Math.random() * 0.07
    const pD = 0.03 + Math.random() * 0.03
    const color = colors[Math.floor(Math.random() * colors.length)]
    
    let mesh: THREE.Mesh
    if (isCylinder) {
      const geo = new THREE.CylinderGeometry(pW / 2, pW / 2, pH, 6)
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 })
      mesh = new THREE.Mesh(geo, mat)
    } else {
      const geo = new THREE.BoxGeometry(pW, pH, pD)
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
      mesh = new THREE.Mesh(geo, mat)
    }
    
    mesh.position.set(px, shelfY + pH / 2, depthOffset + (Math.random() - 0.5) * 0.02)
    mesh.castShadow = false
    mesh.receiveShadow = false
    group.add(mesh)
  }
}

// Helper to filter shadow casting/receiving on GLTF sub-meshes by physical bounding volume (>= 2 liters)
const configureMeshShadows = (object: THREE.Object3D) => {
  const meshTempBox = new THREE.Box3()
  const sizeVec = new THREE.Vector3()
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      if (mesh.geometry) {
        try {
          mesh.geometry.computeBoundingBox()
          if (mesh.geometry.boundingBox) {
            meshTempBox.copy(mesh.geometry.boundingBox)
            meshTempBox.getSize(sizeVec)
            const volume = sizeVec.x * sizeVec.y * sizeVec.z
            // If geometry volume is smaller than 0.002 m3 (2 liters), disable shadow calculations
            if (volume < 0.002) {
              mesh.castShadow = false
              mesh.receiveShadow = false
            } else {
              mesh.castShadow = true
              mesh.receiveShadow = true
            }
          } else {
            mesh.castShadow = false
            mesh.receiveShadow = false
          }
        } catch {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      }
    }
  })
}

// Helper to generate a stylistic low-poly tree mesh
const createTreeMesh = (): THREE.Group => {
  const treeGroup = new THREE.Group()
  
  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.6, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat)
  trunkMesh.position.y = 0.8
  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true
  treeGroup.add(trunkMesh)
  
  // Foliage (modern blocky low-poly style)
  const folMat = new THREE.MeshStandardMaterial({ color: 0x16803d, roughness: 0.8 })
  
  const folGeo1 = new THREE.BoxGeometry(1.4, 1.8, 1.4)
  const folMesh1 = new THREE.Mesh(folGeo1, folMat)
  folMesh1.position.y = 2.2
  folMesh1.castShadow = true
  folMesh1.receiveShadow = true
  treeGroup.add(folMesh1)
  
  const folGeo2 = new THREE.BoxGeometry(1.0, 0.9, 1.0)
  const folMesh2 = new THREE.Mesh(folGeo2, folMat)
  folMesh2.position.y = 3.25
  folMesh2.castShadow = true
  treeGroup.add(folMesh2)
  
  return treeGroup
}

// Helper to generate a stylistic low-poly car mesh
const createCarMesh = (color: number): THREE.Group => {
  const carGroup = new THREE.Group()
  
  // Chassis/Body
  const bodyGeo = new THREE.BoxGeometry(3.6, 0.65, 1.6)
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.1 })
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
  bodyMesh.position.y = 0.525
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  carGroup.add(bodyMesh)
  
  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1.9, 0.55, 1.4)
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 })
  const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat)
  cabinMesh.position.set(-0.2, 1.05, 0)
  cabinMesh.castShadow = true
  cabinMesh.receiveShadow = true
  carGroup.add(cabinMesh)
  
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.3, 8)
  wheelGeo.rotateX(Math.PI / 2) // Orient axle along Z
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
  
  const wheelFL = new THREE.Mesh(wheelGeo, wheelMat)
  wheelFL.position.set(1.0, 0.28, 0.75)
  carGroup.add(wheelFL)
  
  const wheelFR = new THREE.Mesh(wheelGeo, wheelMat)
  wheelFR.position.set(1.0, 0.28, -0.75)
  carGroup.add(wheelFR)
  
  const wheelRL = new THREE.Mesh(wheelGeo, wheelMat)
  wheelRL.position.set(-1.0, 0.28, 0.75)
  carGroup.add(wheelRL)
  
  const wheelRR = new THREE.Mesh(wheelGeo, wheelMat)
  wheelRR.position.set(-1.0, 0.28, -0.75)
  carGroup.add(wheelRR)
  
  // Headlights
  const lightGeo = new THREE.BoxGeometry(0.08, 0.1, 0.25)
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffee0 })
  
  const hlL = new THREE.Mesh(lightGeo, lightMat)
  hlL.position.set(1.8, 0.525, 0.55)
  carGroup.add(hlL)
  
  const hlR = new THREE.Mesh(lightGeo, lightMat)
  hlR.position.set(1.8, 0.525, -0.55)
  carGroup.add(hlR)
  
  // Taillights
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })
  
  const tlL = new THREE.Mesh(lightGeo, tailMat)
  tlL.position.set(-1.8, 0.525, 0.55)
  carGroup.add(tlL)
  
  const tlR = new THREE.Mesh(lightGeo, tailMat)
  tlR.position.set(-1.8, 0.525, -0.55)
  carGroup.add(tlR)
  
  return carGroup
}

// Global cache for loaded GLTF models to avoid reloading on every component mount
const modelCache: Record<string, THREE.Group | undefined> = {}
const loadingPromises: Record<string, Promise<THREE.Group> | undefined> = {}

const getRequiredModelKeys = (items: any[]): string[] => {
  const keys = new Set<string>()
  items.forEach(item => {
    if (!item) return
    const nameUpper = (item.name || '').toUpperCase()
    const idUpper = (item.itemId || item.id || '').toUpperCase()
    
    if (idUpper.includes('CATALOG-71') || idUpper.includes('CATALOG-72') || nameUpper.includes('CESTAO') || nameUpper.includes('CESTÃO')) {
      keys.add('cestao')
    } else if (idUpper.includes('CATALOG-101') || idUpper.includes('CATALOG-102') || nameUpper.includes('CONTROLADO') || nameUpper.includes('CTRL')) {
      keys.add('controlado')
    } else if (idUpper.includes('CATALOG-91') || idUpper.includes('CATALOG-92') || nameUpper.includes('DERMO')) {
      keys.add('dermo')
    } else if (idUpper.includes('CATALOG-111') || nameUpper.includes('ESMALTE') || nameUpper.includes('ESMALTES')) {
      keys.add('esmalte')
    } else if (idUpper.includes('CATALOG-14-') || nameUpper.includes('CANALETADO') || nameUpper.includes('CANAL')) {
      keys.add('canaletado')
    } else if (nameUpper.includes('FILA') || nameUpper.includes('FILA INTELIGENTE') || nameUpper.includes('FILA_INTELIGENTE')) {
      keys.add('fila')
    } else if (nameUpper.includes('MED ') || nameUpper.includes('MED 807') || nameUpper.includes('MED 500') || nameUpper.includes('MED DUPLO') || nameUpper.includes('MEDICAMENTO') || (item.category === 'GONDOLAS' && nameUpper.includes('MED'))) {
      keys.add('medicamento')
    } else if (item.category === 'PERFUMARIA') {
      keys.add('perfumaria')
    } else if (item.category === 'GONDOLAS' && (nameUpper.includes('GOND') || nameUpper.includes('GÔNDOLA') || nameUpper.includes('GONDOLA'))) {
      keys.add('gondolabranca')
    }
  })
  return Array.from(keys)
}

// An item the first-person camera should not be able to walk through. Most catalog items ship
// isObstacle=false, so keying collision only on isObstacle let the camera glide through every
// gondola/counter/fridge. Treat any solid floor furniture as collidable; doors, reserved rooms
// and floor-level accessibility markers stay walkable.
const isSolidCollidable = (item: any): boolean =>
  !!(item?.isObstacle || item?.isPillar) ||
  (!item?.isDoor && !item?.isRoom && item?.category !== 'ACESSIBILIDADE')

interface ThreeDViewerProps {
  onClose?: () => void
  showSimulation?: boolean
  initialCameraView?: 'normal' | 'aerial'
}

export default function ThreeDViewer({ onClose, showSimulation = false, initialCameraView = 'normal' }: ThreeDViewerProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const furnitureGroupRef = useRef<THREE.Group | null>(null)
  const furnitureMeshesRef = useRef<{ box: THREE.Box3; isObstacle: boolean }[]>([])
  const lodObjectsRef = useRef<{ group: THREE.Group; worldPos: THREE.Vector3 }[]>([])
  const keysRef = useRef<Record<string, boolean>>({})
  const dpadKeysRef = useRef<Record<string, boolean>>({})
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null)

  // refs para meshes dinâmicas
  const floorMeshRef = useRef<THREE.Mesh | null>(null)
  const floorGridRef = useRef<THREE.LineSegments | null>(null)
  const ceilingMeshRef = useRef<THREE.Mesh | null>(null)
  const wallsRef = useRef<THREE.Mesh[]>([])
  // Orientation of the entrance / corner door walls, so the per-frame "dollhouse" cutaway
  // knows which facade to hide when the camera pushes in close in orbit mode.
  const mainOrientRef = useRef<'N' | 'S' | 'E' | 'W'>('S')
  const sideOrientRef = useRef<'N' | 'S' | 'E' | 'W' | null>(null)
  const signageGroupRef = useRef<THREE.Group | null>(null)
  const lightsGroupRef = useRef<THREE.Group | null>(null)
  const interiorLightGroupRef = useRef<THREE.Group | null>(null)
  const simulationGroupRef = useRef<THREE.Group | null>(null)
  const simulationDataRef = useRef<{ data: CustomerData, mesh: THREE.Group, pathIndex: number, waitTimer: number, active: boolean }[]>([])

  // Camera look rotation angles
  const yawRef = useRef(0)
  const pitchRef = useRef(0)

  // flags de inicialização
  const [initialized, setInitialized] = useState(false)
  const initializedRef = useRef(false)

  const { storeWidth, storeHeight, items, storeType, layoutName, setLayoutName } = useCanvasStore(
    useShallow(state => ({
      storeWidth: state.storeWidth,
      storeHeight: state.storeHeight,
      items: state.items,
      storeType: state.storeType,
      layoutName: state.layoutName,
      setLayoutName: state.setLayoutName,
    }))
  )
  const [requiredKeys] = useState(() => getRequiredModelKeys(items))
  
  const [isLocked, setIsLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // Customization & Physics States
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [floorStyle, setFloorStyle] = useState('grid')
  const [wallColor, setWallColor] = useState('mint') 
  // Real-time sun shadows ON by default on desktop for the premium hero shot; OFF on mobile
  // (perf). The fake contact-shadow planes still ground objects when this is off.
  const [shadowsEnabled, setShadowsEnabled] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 1024 : false))
  const [pharmacyName, setPharmacyName] = useState(() => layoutName || 'FARMÁCIA PROJEFARMA')

  // Sincronizar o nome da fachada com a alteração do layoutName no store
  useEffect(() => {
    if (layoutName && layoutName !== pharmacyName) {
      setPharmacyName(layoutName)
    }
  }, [layoutName, pharmacyName])
  const frontFacadeGroupRef = useRef<THREE.Group | null>(null)
  const sideFacadeGroupRef = useRef<THREE.Group | null>(null)
  const urbanContextGroupRef = useRef<THREE.Group | null>(null)
  const carsRef = useRef<{ mesh: THREE.Group; speed: number; dir: number }[]>([])
  const [loadedModelsCount, setLoadedModelsCount] = useState(0)
  const cestaoModelRef = useRef<THREE.Group | null>(null)
  const controladoModelRef = useRef<THREE.Group | null>(null)
  const dermoModelRef = useRef<THREE.Group | null>(null)
  const esmalteModelRef = useRef<THREE.Group | null>(null)
  const gondolabrancaModelRef = useRef<THREE.Group | null>(null)
  const canaletadoModelRef = useRef<THREE.Group | null>(null)
  const filaModelRef = useRef<THREE.Group | null>(null)
  const medicamentoModelRef = useRef<THREE.Group | null>(null)
  const perfumariaModelRef = useRef<THREE.Group | null>(null) 
  const [showSignage, setShowSignage] = useState(false)
  const [noclip, setNoclip] = useState(true) // Toggle physics/collisions
 
  const noclipRef = useRef(true)

  const transitionRef = useRef<{
    startTime: number
    duration: number
    startPos: THREE.Vector3
    endPos: THREE.Vector3
    startTarget: THREE.Vector3
    endTarget: THREE.Vector3
    startYaw: number
    endYaw: number
    startPitch: number
    endPitch: number
    mode: 'orbit' | 'first-person'
  } | null>(null)

  const [activePreset, setActivePreset] = useState<'entrada' | 'geral' | 'farmaceutico' | 'aereo' | null>(null)
  
  const [tourActive, setTourActive] = useState(false)
  const tourActiveRef = useRef(false)
  const [tourIndex, setTourIndex] = useState(0)
  const tourIndexRef = useRef(0)
  const tourHoldStartRef = useRef<number | null>(null)
  const tourTransitioningRef = useRef(false)
  const tourProgressRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    noclipRef.current = noclip
  }, [noclip])
 
  const [showProducts, setShowProducts] = useState(false)
  const showProductsRef = useRef(showProducts)
  useEffect(() => {
    showProductsRef.current = showProducts
  }, [showProducts])

  const [cameraMode, setCameraMode] = useState<'orbit' | 'first-person'>('orbit')
  const cameraModeRef = useRef(cameraMode)
  useEffect(() => {
    cameraModeRef.current = cameraMode
    if (lightsGroupRef.current) {
      lightsGroupRef.current.visible = (cameraMode === 'first-person')
    }
    if (cameraMode === 'orbit') {
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock()
        } catch (e) {
          console.warn("Erro ao liberar pointer lock:", e)
        }
      }
    }
  }, [cameraMode])

  const orbitDistanceRef = useRef(12.0)
  const orbitYawRef = useRef(0.12)
  const orbitPitchRef = useRef(0.18) // ~10 degrees
  const orbitTargetRef = useRef(new THREE.Vector3(0, 0.5, 0))

  // --- EFFECT 5: TEMATIZAÇÃO PADRÃO COM BASE NO STORETYPE ---
  useEffect(() => {
    if (storeType === 'premium') {
      setWallColor('blue') // Azul Royal
    } else if (storeType === 'manipulacao') {
      setWallColor('white') // Branco Clean
    } else if (storeType === 'completa') {
      setWallColor('gray') // Cinza Industrial
    } else {
      setWallColor('white')
    }
  }, [storeType])

  // --- Global Browser Error Catching ---
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      console.warn('Promise rejeitada no 3D (normalmente Pointer Lock):', event.reason)
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // --- Effect 1: Setup (roda 1x na montagem) ---
  useEffect(() => {
    const container = containerRef.current
    try {
      console.log("🎬 [3D Viewer] Effect 1 (Setup) iniciando...")
      if (!container) {
        console.warn("⚠️ [3D Viewer] container é nulo. Setup abortado.")
        return
      }

      let width = container.clientWidth
      let height = container.clientHeight
      
      if (width < 320 || height < 240) {
        width = window.innerWidth || 800
        height = window.innerHeight || 600
      }
      
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xdbeafe) // clean daylight sky
      scene.fog = new THREE.FogExp2(0xdbeafe, 0.008) // subtle sky haze
      sceneRef.current = scene

      // Camera
      const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
      camera.position.set(0, 1.6, 5)
      camera.rotation.order = 'YXZ' // Rotate Y then X for first-person controls without roll/tilt
      cameraRef.current = camera

      // Renderer
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance",
        precision: "mediump"
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap // softer, more premium contact shadows
      renderer.shadowMap.autoUpdate = true
      // Color & tone: filmic rolloff so stacked lights stop clipping to flat white,
      // and correct sRGB output so colors/GLB textures look rich instead of washed out.
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.domElement.tabIndex = 1
      renderer.domElement.style.outline = 'none'
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer
      canvasRef.current = renderer.domElement

      // Image-based ambient: gives glass and metal something to reflect so they read
      // as real glass/chrome instead of flat tinted plastic. Background stays the clean sky.
      try {
        const pmrem = new THREE.PMREMGenerator(renderer)
        const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environment = envTexture
        pmrem.dispose()
      } catch (e) {
        console.warn('Não foi possível gerar o environment map:', e)
      }

      // Lighting — balanced for ACES tone mapping + environment map (avoids blown highlights)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
      scene.add(ambientLight)

      const hemisphereLight = new THREE.HemisphereLight(0xeaf2ff, 0x4a4036, 0.45)
      hemisphereLight.position.set(0, 10, 0)
      scene.add(hemisphereLight)

      const directionalLight = new THREE.DirectionalLight(0xfff4e0, 2.2) // warm sunlight
      directionalLight.position.set(15, 20, 15) // high angle diagonal sunlight
      directionalLight.castShadow = true
      directionalLight.shadow.camera.left = -15
      directionalLight.shadow.camera.right = 15
      directionalLight.shadow.camera.top = 15
      directionalLight.shadow.camera.bottom = -15
      directionalLight.shadow.camera.near = 0.1
      directionalLight.shadow.camera.far = 30
      directionalLight.shadow.mapSize.width = 1024
      directionalLight.shadow.mapSize.height = 1024
      directionalLight.shadow.bias = -0.0005
      scene.add(directionalLight)
      directionalLightRef.current = directionalLight

      // Group for Ceiling Lights (emissive panel meshes — kept first-person only)
      const lightsGroup = new THREE.Group()
      lightsGroup.visible = (cameraModeRef.current === 'first-person')
      scene.add(lightsGroup)
      lightsGroupRef.current = lightsGroup

      // Interior illumination that stays ON in orbit too, so the hero shot isn't flat/dim
      const interiorLightGroup = new THREE.Group()
      scene.add(interiorLightGroup)
      interiorLightGroupRef.current = interiorLightGroup

      // Chão Mesh (placeholder geometry, redimensionado no Effect 2)
      const floorGeo = new THREE.PlaneGeometry(1, 1)
      const floorMat = new THREE.MeshStandardMaterial({
        color: FLOOR_STYLES.marble.color,
        roughness: FLOOR_STYLES.marble.roughness,
        metalness: FLOOR_STYLES.marble.metalness
      })
      const floor = new THREE.Mesh(floorGeo, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      floor.receiveShadow = true
      scene.add(floor)
      floorMeshRef.current = floor

      // Grid de piso (tamanho placeholder, redimensionado no Effect 2 para o retângulo real da loja)
      const gridHelper = createFloorGrid(10, 12, 0x10b981)
      scene.add(gridHelper)
      floorGridRef.current = gridHelper

      // Teto (placeholder geometry, redimensionado no Effect 2)
      const ceilingGeo = new THREE.PlaneGeometry(1, 1)
      const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf9fafb, roughness: 0.8 })
      const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat)
      ceiling.rotation.x = Math.PI / 2
      ceiling.position.y = 3.0
      scene.add(ceiling)
      ceilingMeshRef.current = ceiling

      // Paredes iniciais (geometrias placeholders, atualizadas no Effect 2)
      const wallGeo = new THREE.PlaneGeometry(1, 3.0)
      const wallSideGeo = new THREE.PlaneGeometry(1, 3.0)
      const wallMat = new THREE.MeshStandardMaterial({ 
        color: WALL_COLORS.mint, 
        roughness: 0.7,
        side: THREE.DoubleSide
      })
      
      const wBack = new THREE.Mesh(wallGeo, wallMat)
      wBack.receiveShadow = true
      scene.add(wBack)

      const wLeft = new THREE.Mesh(wallSideGeo, wallMat)
      wLeft.rotation.y = Math.PI / 2
      wLeft.receiveShadow = true
      scene.add(wLeft)

      const wRight = new THREE.Mesh(wallSideGeo, wallMat)
      wRight.rotation.y = -Math.PI / 2
      wRight.receiveShadow = true
      scene.add(wRight)

      const wFront = new THREE.Mesh(wallGeo, wallMat)
      wFront.rotation.y = Math.PI
      wFront.receiveShadow = true
      scene.add(wFront)

      wallsRef.current = [wBack, wLeft, wRight, wFront]

      // Grupo para fachada frontal de vidro/marquise
      const frontFacadeGroup = new THREE.Group()
      scene.add(frontFacadeGroup)
      frontFacadeGroupRef.current = frontFacadeGroup

      // Grupo para fachada lateral (esquina)
      const sideFacadeGroup = new THREE.Group()
      scene.add(sideFacadeGroup)
      sideFacadeGroupRef.current = sideFacadeGroup

      // Grupo para contexto urbano
      const urbanContextGroup = new THREE.Group()
      scene.add(urbanContextGroup)
      urbanContextGroupRef.current = urbanContextGroup

      // Sinalização inicial vazia (preenchida no Effect 2)
      const signageGroup = new THREE.Group()
      scene.add(signageGroup)
      signageGroupRef.current = signageGroup

      // Grupo de móveis
      const furnitureGroup = new THREE.Group()
      scene.add(furnitureGroup)
      furnitureGroupRef.current = furnitureGroup

      // Map keys to local refs
      const refMap: Record<string, React.MutableRefObject<THREE.Group | null>> = {
        cestao: cestaoModelRef,
        controlado: controladoModelRef,
        dermo: dermoModelRef,
        esmalte: esmalteModelRef,
        gondolabranca: gondolabrancaModelRef,
        canaletado: canaletadoModelRef,
        fila: filaModelRef,
        medicamento: medicamentoModelRef,
        perfumaria: perfumariaModelRef
      }

      // Load only required 3D Models
      const gltfLoader = new GLTFLoader()
      const modelsToLoad = [
        { key: 'cestao', path: '/models/cestao.glb' },
        { key: 'controlado', path: '/models/Controlado.glb' },
        { key: 'dermo', path: '/models/Dermo.glb' },
        { key: 'esmalte', path: '/models/Esmalte.glb' },
        { key: 'gondolabranca', path: '/models/Gondolabranca.glb' },
        { key: 'canaletado', path: '/models/Pf canaletado.glb' },
        { key: 'fila', path: '/models/fila inteligente.glb' },
        { key: 'medicamento', path: '/models/medicamento.glb' },
        { key: 'perfumaria', path: '/models/perfumaria.glb' },
      ]

      requiredKeys.forEach((key) => {
        const modelInfo = modelsToLoad.find(m => m.key === key)
        if (!modelInfo) {
          setLoadedModelsCount(prev => prev + 1)
          return
        }

        const path = modelInfo.path

        if (modelCache[key]) {
          console.log(`⚡ [3D Viewer] Modelo ${key} recuperado do cache global.`)
          refMap[key].current = modelCache[key]
          setLoadedModelsCount(prev => prev + 1)
        } else if (loadingPromises[key]) {
          console.log(`⏳ [3D Viewer] Acompanhando carregamento existente de ${key}...`)
          loadingPromises[key].then((group) => {
            refMap[key].current = group
            setLoadedModelsCount(prev => prev + 1)
          }).catch(() => {
            setLoadedModelsCount(prev => prev + 1)
          })
        } else {
          console.log(`📦 [3D Viewer] Carregando modelo do ${key} de ${path}...`)
          const loadPromise = new Promise<THREE.Group>((resolve, reject) => {
            fetch(path)
              .then((res) => {
                if (!res.ok) {
                  throw new Error(`Servidor respondeu com status ${res.status}`);
                }
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                  throw new Error("Arquivo não encontrado (recebido HTML de fallback da SPA)");
                }
                gltfLoader.load(
                  path,
                  (gltf) => {
                    configureMeshShadows(gltf.scene)
                    modelCache[key] = gltf.scene
                    resolve(gltf.scene)
                  },
                  undefined,
                  (error) => {
                    reject(error)
                  }
                )
              })
              .catch((err) => {
                reject(err)
              })
          })

          loadingPromises[key] = loadPromise

          loadPromise.then((group) => {
            console.log(`✅ [3D Viewer] Modelo do ${key} carregado com sucesso!`)
            refMap[key].current = group
            setLoadedModelsCount(prev => prev + 1)
          }).catch((error) => {
            console.warn(`⚠️ [3D Viewer] Falha ao carregar o modelo 3D do ${key} em ${path}. Usando fallback.`, error)
            setLoadedModelsCount(prev => prev + 1)
          })
        }
      })

      if (typeof window !== 'undefined') {
        (window as any).debugScene = scene;
        (window as any).debugFurnitureGroup = furnitureGroup;
        (window as any).debugCamera = camera;
      }

      // --- CONTROLES DE OLHAR E NAVEGAÇÃO ---
      let isDragging = false
      let previousMouseX = 0
      let previousMouseY = 0
      let lastPinchDist = 0 // distância entre dois dedos para zoom (pinça) no modo órbita

      const canvas = renderer.domElement

      const handleMouseMove = (e: MouseEvent) => {
        const cam = cameraRef.current
        if (!cam) return
        try {
          if (document.pointerLockElement === canvas || isDragging) {
            stopTourAndGoFree()
          }
          if (transitionRef.current && (document.pointerLockElement === canvas || isDragging)) {
            transitionRef.current = null
            setActivePreset(null)
          } else if (document.pointerLockElement === canvas || isDragging) {
            setActivePreset(null)
          }
          const mode = cameraModeRef.current
          if (mode === 'first-person') {
            if (document.pointerLockElement === canvas) {
              const movementX = e.movementX ?? 0
              const movementY = e.movementY ?? 0
              
              yawRef.current -= movementX * 0.0025
              pitchRef.current -= movementY * 0.0025
              pitchRef.current = Math.max(-1.1, Math.min(1.1, pitchRef.current))
            } else if (isDragging) {
              const clientX = e.clientX ?? previousMouseX
              const clientY = e.clientY ?? previousMouseY
              const deltaX = clientX - previousMouseX
              const deltaY = clientY - previousMouseY
              previousMouseX = clientX
              previousMouseY = clientY
              
              yawRef.current -= deltaX * 0.003
              pitchRef.current -= deltaY * 0.003
              pitchRef.current = Math.max(-1.1, Math.min(1.1, pitchRef.current))
            }
          } else { // mode === 'orbit'
            if (isDragging) {
              const clientX = e.clientX ?? previousMouseX
              const clientY = e.clientY ?? previousMouseY
              const deltaX = clientX - previousMouseX
              const deltaY = clientY - previousMouseY
              previousMouseX = clientX
              previousMouseY = clientY

              const isRightClick = e.buttons === 2 || (e.buttons === 1 && e.shiftKey)
              if (isRightClick) {
                // Pan target center on horizontal plane
                const theta = orbitYawRef.current
                const cosTheta = Math.cos(theta)
                const sinTheta = Math.sin(theta)
                
                const factor = orbitDistanceRef.current * 0.0015
                const dx = -deltaX * factor
                const dz = -deltaY * factor
                
                const panX = dx * cosTheta - dz * sinTheta
                const panZ = dx * sinTheta + dz * cosTheta
                
                orbitTargetRef.current.x += panX
                orbitTargetRef.current.z += panZ
              } else if (e.buttons === 1) {
                // Rotate
                orbitYawRef.current -= deltaX * 0.005
                orbitPitchRef.current += deltaY * 0.005
                orbitPitchRef.current = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, orbitPitchRef.current))
              }
            }
          }
        } catch (err) {
          console.warn("Erro no mouse move:", err)
        }
      }

      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const tagName = target?.tagName
        
        if (
          tagName === 'BUTTON' || 
          tagName === 'INPUT' || 
          tagName === 'SELECT' || 
          tagName === 'TEXTAREA' || 
          target?.closest('.three-customizer') || 
          target?.closest('.three-dpad') || 
          target?.closest('.hud-header') || 
          target?.closest('.lock-card') ||
          target?.closest('.ios-toggle')
        ) {
          return
        }
        
        if (e.button === 0 || e.button === 2) {
          if (e.button === 2) {
            e.preventDefault()
          }
          isDragging = true
          previousMouseX = e.clientX ?? 0
          previousMouseY = e.clientY ?? 0
          canvas.focus()
        }
      }

      const handleMouseUp = () => {
        isDragging = false
      }

      const handleTouchStart = (e: TouchEvent) => {
        const target = e.target as HTMLElement
        const tagName = target?.tagName
        
        if (
          tagName === 'BUTTON' || 
          tagName === 'INPUT' || 
          tagName === 'SELECT' || 
          tagName === 'TEXTAREA' || 
          target?.closest('.three-customizer') || 
          target?.closest('.three-dpad') || 
          target?.closest('.hud-header') || 
          target?.closest('.lock-card') ||
          target?.closest('.ios-toggle')
        ) {
          return
        }
        
        // Prevent default touch gestures (scrolling, page bounce, pull-to-refresh)
        if (e.cancelable) {
          e.preventDefault()
        }
        
        if (e.touches && e.touches.length === 1) {
          isDragging = true
          previousMouseX = e.touches[0].clientX ?? 0
          previousMouseY = e.touches[0].clientY ?? 0
          canvas.focus()
        } else if (e.touches && e.touches.length === 2) {
          // Início da pinça: suspende a rotação e registra a distância inicial entre os dedos
          isDragging = false
          const dx = e.touches[0].clientX - e.touches[1].clientX
          const dy = e.touches[0].clientY - e.touches[1].clientY
          lastPinchDist = Math.hypot(dx, dy)
        }
      }

      const handleTouchMove = (e: TouchEvent) => {
        const target = e.target as HTMLElement
        const tagName = target?.tagName
        
        if (
          tagName === 'BUTTON' || 
          tagName === 'INPUT' || 
          tagName === 'SELECT' || 
          tagName === 'TEXTAREA' || 
          target?.closest('.three-customizer') || 
          target?.closest('.three-dpad') || 
          target?.closest('.hud-header') || 
          target?.closest('.lock-card') ||
          target?.closest('.ios-toggle')
        ) {
          return
        }

        // Prevent default touch gestures (scrolling, page bounce, pull-to-refresh)
        if (e.cancelable) {
          e.preventDefault()
        }

        const cam = cameraRef.current
        if (!cam) return
        try {
          const mode = cameraModeRef.current
          // Pinça com dois dedos = zoom no modo órbita (espelha o zoom do scroll do mouse)
          if (e.touches && e.touches.length === 2 && mode === 'orbit') {
            stopTourAndGoFree()
            const dx = e.touches[0].clientX - e.touches[1].clientX
            const dy = e.touches[0].clientY - e.touches[1].clientY
            const dist = Math.hypot(dx, dy)
            if (lastPinchDist > 0) {
              // afastar os dedos (dist aumenta) → aproxima a câmera (diminui a distância)
              orbitDistanceRef.current = Math.max(3.0, Math.min(30.0, orbitDistanceRef.current + (lastPinchDist - dist) * 0.03))
            }
            lastPinchDist = dist
            return
          }
          if (isDragging && e.touches) {
            stopTourAndGoFree()
            if (mode === 'first-person' && e.touches.length === 1) {
              const clientX = e.touches[0].clientX ?? previousMouseX
              const clientY = e.touches[0].clientY ?? previousMouseY
              const deltaX = clientX - previousMouseX
              const deltaY = clientY - previousMouseY
              previousMouseX = clientX
              previousMouseY = clientY
              
              yawRef.current -= deltaX * 0.004
              pitchRef.current -= deltaY * 0.004
              pitchRef.current = Math.max(-1.1, Math.min(1.1, pitchRef.current))
            } else if (mode === 'orbit' && e.touches.length === 1) {
              const clientX = e.touches[0].clientX ?? previousMouseX
              const clientY = e.touches[0].clientY ?? previousMouseY
              const deltaX = clientX - previousMouseX
              const deltaY = clientY - previousMouseY
              previousMouseX = clientX
              previousMouseY = clientY
              
              orbitYawRef.current -= deltaX * 0.006
              orbitPitchRef.current += deltaY * 0.006
              orbitPitchRef.current = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, orbitPitchRef.current))
            }
          }
        } catch (err) {
          console.warn("Erro no touch move:", err)
        }
      }

      const handleTouchEnd = (e: TouchEvent) => {
        // Ao soltar um dos dois dedos, reinicia a pinça e re-semeia a rotação com o dedo restante
        // para evitar um "salto" brusco da câmera.
        lastPinchDist = 0
        if (e.touches && e.touches.length === 1) {
          isDragging = true
          previousMouseX = e.touches[0].clientX ?? previousMouseX
          previousMouseY = e.touches[0].clientY ?? previousMouseY
        } else {
          isDragging = false
        }
      }

      const lockPointer = () => {
        if (!isDragging && canvas) {
          try {
            const result = canvas.requestPointerLock()
            if (result && typeof result.catch === 'function') {
              result.catch(() => {})
            }
          } catch {}
        }
      }

      const onPointerLockChange = () => {
        setIsLocked(document.pointerLockElement === canvas)
      }

      const handleCanvasClick = () => {
        canvas.focus()
        if (cameraModeRef.current === 'first-person') {
          lockPointer()
        }
      }

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault()
      }

      const handleWheel = (e: WheelEvent) => {
        if (cameraModeRef.current === 'orbit') {
          e.preventDefault()
          orbitDistanceRef.current = Math.max(3.0, Math.min(30.0, orbitDistanceRef.current + e.deltaY * 0.015))
        }
      }

      canvas.addEventListener('click', handleCanvasClick)
      canvas.addEventListener('contextmenu', handleContextMenu)
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      document.addEventListener('mousedown', handleMouseDown)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      document.addEventListener('touchstart', handleTouchStart, { passive: false })
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)
      document.addEventListener('pointerlockchange', onPointerLockChange)

      // --- CONTROLES DE TECLADO ---
      const handleKeyDown = (e: KeyboardEvent) => { 
        if (transitionRef.current) {
          transitionRef.current = null
        }
        setActivePreset(null)
        
        stopTourAndGoFree()
        if (keysRef.current) {
          keysRef.current[e.code] = true 
          if (e.key) keysRef.current[e.key.toLowerCase()] = true
        }
        
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || 
            ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key?.toLowerCase() || '')) {
          e.preventDefault()
        }
      }
      
      const handleKeyUp = (e: KeyboardEvent) => { 
        if (keysRef.current) {
          keysRef.current[e.code] = false 
          if (e.key) keysRef.current[e.key.toLowerCase()] = false
        }
      }

      const handleBlur = () => {
        keysRef.current = {}
      }

      canvas.addEventListener('keydown', handleKeyDown)
      canvas.addEventListener('keyup', handleKeyUp)

      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.addEventListener('blur', handleBlur)
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('keyup', handleKeyUp)

      // --- LOOP DE ANIMAÇÃO ---
      let lastTime = performance.now()
      const cameraDirection = new THREE.Vector3()
      const moveVector = new THREE.Vector3()
      const upVector = new THREE.Vector3(0, 1, 0)
      const rightVector = new THREE.Vector3()
      const frontVector = new THREE.Vector3()
      const sideVector = new THREE.Vector3()
      const nextCamBox = new THREE.Box3()
      const camBoxMin = new THREE.Vector3()
      const camBoxMax = new THREE.Vector3()
      
      let animationFrameId = 0
      let frameCount = 0
      const animate = () => {
        const cam = cameraRef.current
        const sc = sceneRef.current
        const ren = rendererRef.current
        if (!cam || !sc || !ren) return

        try {
          const currentTime = performance.now()
          let deltaTime = (currentTime - lastTime) / 1000
          lastTime = currentTime

          if (isNaN(deltaTime) || !isFinite(deltaTime) || deltaTime < 0) {
            deltaTime = 0
          } else if (deltaTime > 0.1) {
            deltaTime = 0.1
          }

          const mode = cameraModeRef.current
          const trans = transitionRef.current

          if (trans) {
            const elapsed = currentTime - trans.startTime
            const t = Math.min(elapsed / trans.duration, 1.0)
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

            cam.position.lerpVectors(trans.startPos, trans.endPos, ease)

            if (trans.mode === 'orbit') {
              const currentTarget = new THREE.Vector3().lerpVectors(trans.startTarget, trans.endTarget, ease)
              orbitTargetRef.current.copy(currentTarget)
              cam.lookAt(currentTarget)
            } else {
              const lerpAngle = (start: number, end: number, alpha: number) => {
                const diff = (end - start + Math.PI) % (Math.PI * 2) - Math.PI
                const shortest = diff < -Math.PI ? diff + Math.PI * 2 : diff
                return start + shortest * alpha
              }
              yawRef.current = lerpAngle(trans.startYaw, trans.endYaw, ease)
              pitchRef.current = lerpAngle(trans.startPitch, trans.endPitch, ease)

              cam.rotation.set(0, 0, 0)
              cam.rotation.y = yawRef.current
              cam.rotation.x = pitchRef.current
            }

            if (t >= 1.0) {
              transitionRef.current = null
              setCameraMode(trans.mode)
              cameraModeRef.current = trans.mode

              if (trans.mode === 'orbit') {
                const toTarget = new THREE.Vector3().subVectors(trans.endPos, trans.endTarget)
                orbitDistanceRef.current = toTarget.length()
                orbitYawRef.current = Math.atan2(toTarget.x, toTarget.z)
                orbitPitchRef.current = Math.asin(toTarget.y / orbitDistanceRef.current)
                orbitTargetRef.current.copy(trans.endTarget)
              } else {
                yawRef.current = trans.endYaw
                pitchRef.current = trans.endPitch
                cam.rotation.set(0, 0, 0)
                cam.rotation.y = yawRef.current
                cam.rotation.x = pitchRef.current
              }
              
              if (tourActiveRef.current) {
                tourHoldStartRef.current = performance.now()
                tourTransitioningRef.current = false
              }
            }
          } else {
            // Update tour hold and progress
            if (tourActiveRef.current) {
              if (tourHoldStartRef.current !== null) {
                const holdElapsed = currentTime - tourHoldStartRef.current
                const holdDuration = 6000 // 6 seconds

                const pct = Math.min(100, (holdElapsed / holdDuration) * 100)
                if (tourProgressRef.current) {
                  tourProgressRef.current.style.width = `${pct}%`
                }

                // Slow cinematic panning
                if (cameraModeRef.current === 'orbit') {
                  orbitYawRef.current -= 0.04 * deltaTime
                } else {
                  yawRef.current -= 0.02 * deltaTime
                  cam.rotation.set(0, 0, 0)
                  cam.rotation.y = yawRef.current
                  cam.rotation.x = pitchRef.current
                }

                if (holdElapsed >= holdDuration) {
                  advanceTour()
                }
              }
            }

            if (mode === 'orbit') {
              const r = orbitDistanceRef.current
              const pitch = orbitPitchRef.current
            const yaw = orbitYawRef.current
            const target = orbitTargetRef.current

            // Allow moving target with WASD keys / D-pad in orbit mode too
            const keys = { ...keysRef.current, ...dpadKeysRef.current }
            const moveSpeed = 4.0 // speed of panning
            const moveX = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize()
            const moveZ = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize()
            
            const panVector = new THREE.Vector3(0, 0, 0)
            if (keys['KeyW'] || keys['ArrowUp'] || keys['w'] || keys['arrowup']) panVector.add(moveX)
            if (keys['KeyS'] || keys['ArrowDown'] || keys['s'] || keys['arrowdown']) panVector.add(moveX.clone().multiplyScalar(-1))
            if (keys['KeyD'] || keys['ArrowRight'] || keys['d'] || keys['arrowright']) panVector.add(moveZ)
            if (keys['KeyA'] || keys['ArrowLeft'] || keys['a'] || keys['arrowleft']) panVector.add(moveZ.clone().multiplyScalar(-1))
            
            if (panVector.lengthSq() > 0.0001) {
              panVector.normalize().multiplyScalar(moveSpeed * deltaTime)
              target.x += panVector.x
              target.z += panVector.z
              
              const { storeWidth: currentWidth, storeHeight: currentHeight } = useCanvasStore.getState()
              const wVal = Math.max(3, Number(currentWidth) || 10)
              const hVal = Math.max(3, Number(currentHeight) || 12)
              target.x = Math.max(-wVal / 2, Math.min(target.x, wVal / 2))
              target.z = Math.max(-hVal / 2, Math.min(target.z, hVal / 2))
            }

            cam.position.x = target.x + r * Math.cos(pitch) * Math.sin(yaw)
            cam.position.y = target.y + r * Math.sin(pitch)
            cam.position.z = target.z + r * Math.cos(pitch) * Math.cos(yaw)
            cam.lookAt(target)
          } else {
            // Sync camera look rotation exactly once per frame at the start of rendering
            cam.rotation.set(0, 0, 0)
            cam.rotation.y = yawRef.current
            cam.rotation.x = pitchRef.current
          }
        }

          // Dynamic LOD visibility culling for products
          const camX = cam.position.x
          const camZ = cam.position.z
          const lodObjects = lodObjectsRef.current
          const showProductsVal = showProductsRef.current
          const maxDistSq = mode === 'orbit' ? 64.0 : 20.25 // 8.0m in orbit, 4.5m in first-person
          for (let i = 0; i < lodObjects.length; i++) {
            const item = lodObjects[i]
            if (!showProductsVal) {
              item.group.visible = false
            } else {
              const dx = camX - item.worldPos.x
              const dz = camZ - item.worldPos.z
              const distSq = dx * dx + dz * dz
              item.group.visible = distSq <= maxDistSq
            }
          }

          // Animate procedural cars on the street
          if (carsRef.current) {
            const boundaryX = 60.0
            const boundaryZ = 60.0
            for (let i = 0; i < carsRef.current.length; i++) {
              const car = carsRef.current[i] as any
              if (car && car.mesh) {
                const axis = car.axis || 'x'
                if (axis === 'x') {
                  car.mesh.position.x += car.speed * deltaTime * car.dir
                  // Wrap around
                  if (car.dir === 1 && car.mesh.position.x > boundaryX) {
                    car.mesh.position.x = -boundaryX
                  } else if (car.dir === -1 && car.mesh.position.x < -boundaryX) {
                    car.mesh.position.x = boundaryX
                  }
                } else {
                  car.mesh.position.z += car.speed * deltaTime * car.dir
                  // Wrap around
                  if (car.dir === 1 && car.mesh.position.z > boundaryZ) {
                    car.mesh.position.z = -boundaryZ
                  } else if (car.dir === -1 && car.mesh.position.z < -boundaryZ) {
                    car.mesh.position.z = boundaryZ
                  }
                }
              }
            }
          }

          if (mode === 'first-person') {
            const moveSpeed = 3.0
            cam.getWorldDirection(cameraDirection)
            
            if (isNaN(cameraDirection.x) || isNaN(cameraDirection.y) || isNaN(cameraDirection.z) || cameraDirection.lengthSq() < 0.0001) {
              cameraDirection.set(0, 0, -1)
            } else {
              cameraDirection.normalize()
            }

            rightVector.crossVectors(cameraDirection, upVector)
            if (isNaN(rightVector.x) || isNaN(rightVector.z) || rightVector.lengthSq() < 0.0001) {
              rightVector.set(1, 0, 0)
            } else {
              rightVector.normalize()
            }

            frontVector.set(0, 0, 0)
            sideVector.set(0, 0, 0)

            const keys = { ...keysRef.current, ...dpadKeysRef.current }
            if (keys['KeyW'] || keys['ArrowUp'] || keys['w'] || keys['arrowup'] || keys['z'] || keys['KeyZ']) frontVector.copy(cameraDirection)
            if (keys['KeyS'] || keys['ArrowDown'] || keys['s'] || keys['arrowdown']) frontVector.copy(cameraDirection).multiplyScalar(-1)
            if (keys['KeyD'] || keys['ArrowRight'] || keys['d'] || keys['arrowright']) sideVector.copy(rightVector)
            if (keys['KeyA'] || keys['ArrowLeft'] || keys['a'] || keys['arrowleft'] || keys['q'] || keys['KeyQ']) sideVector.copy(rightVector).multiplyScalar(-1)

            moveVector.addVectors(frontVector, sideVector)
            
            if (moveVector.lengthSq() > 0.0001) {
              moveVector.normalize().multiplyScalar(moveSpeed * deltaTime)
              
              let nextX = cam.position.x + moveVector.x
              let nextY = cam.position.y + moveVector.y
              let nextZ = cam.position.z + moveVector.z
              
              if (isNaN(nextX) || !isFinite(nextX)) nextX = cam.position.x
              if (isNaN(nextY) || !isFinite(nextY)) nextY = cam.position.y
              if (isNaN(nextZ) || !isFinite(nextZ)) nextZ = cam.position.z

              const { storeWidth: currentWidth, storeHeight: currentHeight } = useCanvasStore.getState()
              const wVal = Math.max(3, Number(currentWidth) || 10)
              const hVal = Math.max(3, Number(currentHeight) || 12)

              // Allow walking outside the store limits (e.g., up to 15 meters from store bounds)
              nextX = Math.max(-wVal / 2 - 15.0, Math.min(nextX, wVal / 2 + 15.0))
              nextZ = Math.max(-hVal / 2 - 15.0, Math.min(nextZ, hVal / 2 + 15.0))
              nextY = Math.max(0.2, Math.min(nextY, 50.0))

              // Reduced collision radius (0.12) to navigate narrow corridors easily without getting stuck
              let collidedX = false
              if (!noclipRef.current && furnitureMeshesRef.current) {
                camBoxMin.set(nextX - 0.12, 0.1, cam.position.z - 0.12)
                camBoxMax.set(nextX + 0.12, 1.9, cam.position.z + 0.12)
                nextCamBox.set(camBoxMin, camBoxMax)
                for (const fItem of furnitureMeshesRef.current) {
                  if (fItem && fItem.isObstacle && fItem.box && nextCamBox.intersectsBox(fItem.box)) {
                    collidedX = true
                    break
                  }
                }
              }
              if (!collidedX) {
                cam.position.x = nextX
              }

              let collidedZ = false
              if (!noclipRef.current && furnitureMeshesRef.current) {
                camBoxMin.set(cam.position.x - 0.12, 0.1, nextZ - 0.12)
                camBoxMax.set(cam.position.x + 0.12, 1.9, nextZ + 0.12)
                nextCamBox.set(camBoxMin, camBoxMax)
                for (const fItem of furnitureMeshesRef.current) {
                  if (fItem && fItem.isObstacle && fItem.box && nextCamBox.intersectsBox(fItem.box)) {
                    collidedZ = true
                    break
                  }
                }
              }
              if (!collidedZ) {
                cam.position.z = nextZ
              }

              cam.position.y = nextY
            }

            if (isNaN(cam.position.x) || !isFinite(cam.position.x)) cam.position.x = 0
            if (isNaN(cam.position.z) || !isFinite(cam.position.z)) {
              const { storeHeight: currentHeight } = useCanvasStore.getState()
              const hVal = Math.max(3, Number(currentHeight) || 12)
              cam.position.z = hVal / 2 - 1.2
            }
          }

          frameCount++

          // Atualiza simulação de clientes 3D
          if (showSimulation && simulationDataRef.current.length > 0) {
            const currentWidth = Number(useCanvasStore.getState().storeWidth)
            const currentHeight = Number(useCanvasStore.getState().storeHeight)

            simulationDataRef.current.forEach(cust => {
              if (!cust.active) return
              const pt = cust.data.path[cust.pathIndex]
              if (!pt) return

              // Wait timer (atendimentos/visualização de gôndolas)
              if (cust.waitTimer > 0) {
                cust.waitTimer -= deltaTime
                
                // Micro-animação: wobble leve de espera (respirando)
                const time = performance.now() / 1000
                cust.mesh.children[0].scale.y = 1.0 + Math.sin(time * 3 + cust.data.speed) * 0.05
                cust.mesh.children[1].position.y = 0.75 + Math.sin(time * 3 + cust.data.speed) * 0.05

                if (cust.waitTimer <= 0) {
                  cust.pathIndex++
                  if (cust.pathIndex >= cust.data.path.length) {
                    cust.active = false
                    cust.mesh.visible = false
                  } else {
                    cust.mesh.children[0].scale.y = 1.0
                    cust.mesh.children[1].position.y = 0.75
                  }
                }
                return
              }

              const targetX = pt.x - currentWidth / 2
              const targetZ = pt.y - currentHeight / 2

              const dx = targetX - cust.mesh.position.x
              const dz = targetZ - cust.mesh.position.z
              const dist = Math.sqrt(dx * dx + dz * dz)

              if (dist < 0.1) {
                cust.waitTimer = pt.waitDuration || 0
                cust.mesh.children[0].scale.y = 1.0
                cust.mesh.children[1].position.y = 0.75
                cust.mesh.rotation.z = 0
                if (cust.waitTimer === 0) {
                  cust.pathIndex++
                  if (cust.pathIndex >= cust.data.path.length) {
                    cust.active = false
                    cust.mesh.visible = false
                  }
                }
              } else {
                const step = cust.data.speed * deltaTime
                const moveDist = Math.min(step, dist)
                cust.mesh.position.x += (dx / dist) * moveDist
                cust.mesh.position.z += (dz / dist) * moveDist

                // Rotacionar suavemente em direção ao movimento
                const targetAngle = Math.atan2(dx, dz)
                let angleDiff = targetAngle - cust.mesh.rotation.y
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
                cust.mesh.rotation.y += angleDiff * 0.1

                // Micro-animação: Wobble horizontal (simula caminhada)
                const distTraveled = performance.now() / 150 * cust.data.speed
                cust.mesh.rotation.z = Math.sin(distTraveled) * 0.12
              }
            })
          }

          // --- Dollhouse híbrido ---
          // Longe (zoom afastado) ou durante tour/transição = prédio fechado (hero shot da fachada).
          // Perto, em órbita livre = esconde o teto e as paredes/fachada entre a câmera e o interior,
          // revelando o layout como uma maquete. Em primeira pessoa nunca corta (cliente está dentro).
          {
            const isOrbit = cameraModeRef.current === 'orbit'
            const dimsState = useCanvasStore.getState()
            const wv = Math.max(3, Number(dimsState.storeWidth) || 10)
            const hv = Math.max(3, Number(dimsState.storeHeight) || 12)
            const cutawayDist = Math.max(wv, hv) * 1.0
            const cutaway = isOrbit && !transitionRef.current && !tourActiveRef.current &&
              orbitDistanceRef.current < cutawayDist

            const m = 0.4
            const onSouth = cam.position.z > m   // +Z
            const onNorth = cam.position.z < -m  // -Z
            const onEast = cam.position.x > m    // +X
            const onWest = cam.position.x < -m   // -X

            const walls = wallsRef.current
            const wB = walls[0], wL = walls[1], wR = walls[2], wF = walls[3]
            if (wB) wB.visible = (wB.userData.baseVisible !== false) && !(cutaway && onNorth)
            if (wL) wL.visible = (wL.userData.baseVisible !== false) && !(cutaway && onWest)
            if (wR) wR.visible = (wR.userData.baseVisible !== false) && !(cutaway && onEast)
            if (wF) wF.visible = (wF.userData.baseVisible !== false) && !(cutaway && onSouth)

            // Also drop the ceiling when looking down steeply (aerial / floor-plan view), else
            // a top-down orbit just sees the roof instead of the layout.
            const topDown = isOrbit && orbitPitchRef.current > 1.2
            if (ceilingMeshRef.current) ceilingMeshRef.current.visible = !cutaway && !topDown

            const orientHidden = (o: string | null) => {
              if (!cutaway || !o) return false
              if (o === 'S') return onSouth
              if (o === 'N') return onNorth
              if (o === 'E') return onEast
              if (o === 'W') return onWest
              return false
            }
            if (frontFacadeGroupRef.current) frontFacadeGroupRef.current.visible = !orientHidden(mainOrientRef.current)
            if (sideFacadeGroupRef.current) sideFacadeGroupRef.current.visible = !orientHidden(sideOrientRef.current)
          }

          ren.render(sc, cam)
          animationFrameId = requestAnimationFrame(animate)
        } catch (err: any) {
          console.error("Erro no loop de animação 3D:", err)
          setErrorMsg("Erro no loop de animação 3D: " + err.message + "\n" + err.stack)
        }
      }

      animate()

      // Resize Handler (Bug 6)
      const handleResize = () => {
        const cam = cameraRef.current
        const ren = rendererRef.current
        const container = containerRef.current
        if (!cam || !ren || !container) return

        let w = container.clientWidth
        let h = container.clientHeight
        if (w < 320 || h < 240) {
          w = window.innerWidth || 800
          h = window.innerHeight || 600
        }
        cam.aspect = w / h
        cam.updateProjectionMatrix()
        ren.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        ren.setSize(w, h)
      }
      window.addEventListener('resize', handleResize)

      // Conclusão do Setup (Bug 3)
      initializedRef.current = true
      setInitialized(true)

      // --- CLEANUP ---
      return () => {
        cancelAnimationFrame(animationFrameId)
        // Dispose the generated environment map texture to avoid a GPU texture leak on re-mount
        if (sceneRef.current?.environment) {
          sceneRef.current.environment.dispose()
          sceneRef.current.environment = null
        }
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        window.removeEventListener('blur', handleBlur)
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
        
        if (canvas && container) {
          canvas.removeEventListener('keydown', handleKeyDown)
          canvas.removeEventListener('keyup', handleKeyUp)
          canvas.removeEventListener('click', handleCanvasClick)
          canvas.removeEventListener('contextmenu', handleContextMenu)
          canvas.removeEventListener('wheel', handleWheel)
          try {
            if (container.contains(canvas)) {
              container.removeChild(canvas)
            }
          } catch (e) {
            console.warn("Erro ao remover canvas:", e)
          }
        }
        
        document.removeEventListener('mousedown', handleMouseDown)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchstart', handleTouchStart)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        
        if (furnitureGroupRef.current) {
          furnitureGroupRef.current.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh
              if (mesh.geometry) {
                try {
                  mesh.geometry.dispose()
                } catch {}
              }
              if (mesh.material) {
                try {
                  if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => { if (m) m.dispose(); })
                  } else {
                    mesh.material.dispose()
                  }
                } catch {}
              }
            }
          })
        }

        if (rendererRef.current) {
          try {
            rendererRef.current.dispose()
          } catch (e) {
            console.warn("Erro ao descartar renderizador:", e)
          }
        }
        
        rendererRef.current = null
        canvasRef.current = null
        cameraRef.current = null
        sceneRef.current = null
        furnitureGroupRef.current = null
        lightsGroupRef.current = null
        frontFacadeGroupRef.current = null
        sideFacadeGroupRef.current = null
        urbanContextGroupRef.current = null
        
        floorGeo.dispose()
        floorMat.dispose()
        ceilingGeo.dispose()
        ceilingMat.dispose()
        wallMat.dispose()
        wallGeo.dispose()
        wallSideGeo.dispose()
      }
    } catch (err: any) {
      console.error("Erro no setup 3D:", err)
      setErrorMsg("Erro no setup 3D: " + err.message + "\n" + err.stack)
    }
  }, []) // <- Sem dependências (Bug 2)

  // --- EFFECT: Resolution of Loading State ---
  useEffect(() => {
    if (initialized && loadedModelsCount >= requiredKeys.length) {
      setLoading(prev => {
        if (prev) {
          // Auto tour activation and transition to first scene
          setTourActive(true)
          tourActiveRef.current = true
          setTimeout(() => {
            triggerTourScene(0)
          }, 100)
        }
        return false
      })
    }
  }, [initialized, loadedModelsCount, requiredKeys])

  // Helper to determine which wall a door sits on, from its ACTUAL position (robust to rotation).
  // This is what makes the 3D door land exactly where it was placed in 2D, on the wall it touches.
  const getDoorOrientation = (item: any, storeW: number, storeH: number): 'N' | 'S' | 'E' | 'W' => {
    const b = getRotatedBounds(item.x ?? 0, item.y ?? 0, item.width ?? 1, item.height ?? 1, item.rotation || 0)
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const dN = cy            // distance to top wall (y = 0)
    const dS = storeH - cy   // distance to bottom wall (y = storeH)
    const dW = cx            // distance to left wall (x = 0)
    const dE = storeW - cx   // distance to right wall (x = storeW)
    const min = Math.min(dN, dS, dW, dE)
    if (min === dN) return 'N'
    if (min === dS) return 'S'
    if (min === dW) return 'W'
    return 'E'
  }

  // Group Y-rotation that places a "south-built" facade/scene onto the given wall, facing outward.
  const orientToRotationY = (o: 'N' | 'S' | 'E' | 'W'): number =>
    o === 'N' ? Math.PI : o === 'E' ? Math.PI / 2 : o === 'W' ? -Math.PI / 2 : 0

  // Orientation of `other` relative to `main` as if `main` were the south wall:
  // 'S' = same wall, 'N' = opposite wall, 'E'/'W' = perpendicular (a genuine corner).
  const relativeOrient = (main: 'N' | 'S' | 'E' | 'W', other: 'N' | 'S' | 'E' | 'W' | null): 'N' | 'S' | 'E' | 'W' | null => {
    if (!other) return null
    const ang = (o: 'N' | 'S' | 'E' | 'W') => o === 'S' ? 0 : o === 'E' ? Math.PI / 2 : o === 'N' ? Math.PI : -Math.PI / 2
    let d = ang(other) - ang(main)
    while (d > Math.PI) d -= Math.PI * 2
    while (d <= -Math.PI) d += Math.PI * 2
    if (Math.abs(d) < 0.01) return 'S'
    if (Math.abs(d - Math.PI / 2) < 0.01) return 'E'
    if (Math.abs(d + Math.PI / 2) < 0.01) return 'W'
    return 'N'
  }

  // Builds a full storefront facade (glass/concrete panels, automatic door, canopy, optional sign)
  // for a GIVEN door onto whichever wall that door sits on. Used for BOTH the main entrance and a
  // corner store's second door, so every door appears in 3D exactly where it was placed in 2D.
  const buildDoorFacade = (targetGroup: THREE.Group | null, doorItem: any, widthVal: number, heightVal: number, hasVitrines: boolean, withSign: boolean) => {
    const frontFacadeGroup = targetGroup
    if (!frontFacadeGroup) return

    // Clear old children
    while (frontFacadeGroup.children.length > 0) {
      const child = frontFacadeGroup.children[0]
      frontFacadeGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      } else if (child instanceof THREE.Light) {
        child.dispose()
      }
    }

    const mainOrient = doorItem ? getDoorOrientation(doorItem, storeWidth, storeHeight) : 'S'
    const wallLength = (mainOrient === 'N' || mainOrient === 'S') ? widthVal : heightVal
    const depthDist = (mainOrient === 'N' || mainOrient === 'S') ? heightVal : widthVal

    const defaultDoorW = doorItem?.width ?? 1.2
    const doorBounds = doorItem
      ? getRotatedBounds(doorItem.x, doorItem.y, doorItem.width, doorItem.height, doorItem.rotation || 0)
      : { x: storeWidth / 2 - defaultDoorW / 2, y: storeHeight / 2 - defaultDoorW / 2, width: defaultDoorW, height: defaultDoorW }

    // Opening size measured ALONG the wall the door sits on, so rotated doors get the right width.
    const doorW = (mainOrient === 'N' || mainOrient === 'S') ? doorBounds.width : doorBounds.height

    const doorCenter2d = (mainOrient === 'N' || mainOrient === 'S')
      ? (doorBounds.x + doorBounds.width / 2)
      : (doorBounds.y + doorBounds.height / 2)

    // Along-wall world coordinate of the door centre. The facade is built in a "south-facing"
    // local frame and then rotated onto the real wall; for N and E the group rotation flips the
    // local X axis, so we pre-flip the door's local X to keep it exactly where it was placed.
    let doorX3d = doorCenter2d - wallLength / 2
    if (mainOrient === 'N' || mainOrient === 'E') doorX3d = -doorX3d

    const doorLeftX = doorX3d - doorW / 2
    const doorRightX = doorX3d + doorW / 2

    // Facade height properties
    const facadeZ = depthDist / 2
    const doorHeight = 2.2
    const canopyMinY = 2.3
    const canopyHeight = 0.9 // up to y = 3.2

    // Materials
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.8 })
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.18, metalness: 0.95, roughness: 0.05 })
    const wallColorHex = WALL_COLORS[wallColor as keyof typeof WALL_COLORS] || WALL_COLORS.mint
    const canopyMat = new THREE.MeshStandardMaterial({ color: wallColorHex, roughness: 0.5 })
    const concreteWallMat = new THREE.MeshStandardMaterial({ color: FACADE_CONCRETE.color, roughness: FACADE_CONCRETE.roughness, metalness: FACADE_CONCRETE.metalness })

    // 1. Left Glass Panel or Concrete Wall (from -wallLength / 2 to doorLeftX)
    const leftPanelW = doorLeftX - (-wallLength / 2)
    if (leftPanelW > 0.05) {
      const leftPanelX = -wallLength / 2 + leftPanelW / 2
      if (hasVitrines) {
        // Glass
        const glassGeo = new THREE.BoxGeometry(leftPanelW, canopyMinY, 0.02)
        const glassMesh = new THREE.Mesh(glassGeo, glassMat)
        glassMesh.position.set(leftPanelX, canopyMinY / 2, facadeZ)
        frontFacadeGroup.add(glassMesh)

        // Metal Frame (top, bottom)
        // Bottom sill
        const sillGeo = new THREE.BoxGeometry(leftPanelW, 0.08, 0.08)
        const sillMesh = new THREE.Mesh(sillGeo, metalMat)
        sillMesh.position.set(leftPanelX, 0.04, facadeZ)
        frontFacadeGroup.add(sillMesh)

        // Top frame
        const topFrameGeo = new THREE.BoxGeometry(leftPanelW, 0.06, 0.08)
        const topFrameMesh = new THREE.Mesh(topFrameGeo, metalMat)
        topFrameMesh.position.set(leftPanelX, canopyMinY - 0.03, facadeZ)
        frontFacadeGroup.add(topFrameMesh)
      } else {
        // Concrete wall
        const wallGeo = new THREE.BoxGeometry(leftPanelW, 3.0, 0.1)
        const wallMesh = new THREE.Mesh(wallGeo, concreteWallMat)
        wallMesh.position.set(leftPanelX, 1.5, facadeZ)
        wallMesh.receiveShadow = true
        wallMesh.castShadow = true
        frontFacadeGroup.add(wallMesh)
      }
    }

    // 2. Right Glass Panel or Concrete Wall (from doorRightX to wallLength / 2)
    const rightPanelW = (wallLength / 2) - doorRightX
    if (rightPanelW > 0.05) {
      const rightPanelX = doorRightX + rightPanelW / 2
      if (hasVitrines) {
        // Glass
        const glassGeo = new THREE.BoxGeometry(rightPanelW, canopyMinY, 0.02)
        const glassMesh = new THREE.Mesh(glassGeo, glassMat)
        glassMesh.position.set(rightPanelX, canopyMinY / 2, facadeZ)
        frontFacadeGroup.add(glassMesh)

        // Metal Frame
        // Bottom sill
        const sillGeo = new THREE.BoxGeometry(rightPanelW, 0.08, 0.08)
        const sillMesh = new THREE.Mesh(sillGeo, metalMat)
        sillMesh.position.set(rightPanelX, 0.04, facadeZ)
        frontFacadeGroup.add(sillMesh)

        // Top frame
        const topFrameGeo = new THREE.BoxGeometry(rightPanelW, 0.06, 0.08)
        const topFrameMesh = new THREE.Mesh(topFrameGeo, metalMat)
        topFrameMesh.position.set(rightPanelX, canopyMinY - 0.03, facadeZ)
        frontFacadeGroup.add(topFrameMesh)
      } else {
        // Concrete wall
        const wallGeo = new THREE.BoxGeometry(rightPanelW, 3.0, 0.1)
        const wallMesh = new THREE.Mesh(wallGeo, concreteWallMat)
        wallMesh.position.set(rightPanelX, 1.5, facadeZ)
        wallMesh.receiveShadow = true
        wallMesh.castShadow = true
        frontFacadeGroup.add(wallMesh)
      }
    }

    // 3. Automatic Glass Door (at doorX3d)
    // Concrete wall header above the door height when it's a solid wall facade
    if (!hasVitrines) {
      const headerWallGeo = new THREE.BoxGeometry(doorW, 0.8, 0.1)
      const headerWallMesh = new THREE.Mesh(headerWallGeo, concreteWallMat)
      headerWallMesh.position.set(doorX3d, 2.6, facadeZ)
      headerWallMesh.receiveShadow = true
      headerWallMesh.castShadow = true
      frontFacadeGroup.add(headerWallMesh)
    }

    // Vertical frame sides
    const sideFrameGeo = new THREE.BoxGeometry(0.06, doorHeight, 0.08)
    
    const leftDoorFrame = new THREE.Mesh(sideFrameGeo, metalMat)
    leftDoorFrame.position.set(doorLeftX, doorHeight / 2, facadeZ)
    frontFacadeGroup.add(leftDoorFrame)

    const rightDoorFrame = new THREE.Mesh(sideFrameGeo, metalMat)
    rightDoorFrame.position.set(doorRightX, doorHeight / 2, facadeZ)
    frontFacadeGroup.add(rightDoorFrame)

    // Header profile
    const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.12, 0.12), metalMat)
    headerMesh.position.set(doorX3d, doorHeight + 0.06, facadeZ)
    frontFacadeGroup.add(headerMesh)

    // Sliding Glass Panels (two sheets, slightly open or closed)
    const sheetW = doorW / 2 - 0.02
    const sheetGeo = new THREE.BoxGeometry(sheetW, doorHeight - 0.06, 0.02)
    
    // Left sheet (center to left, slightly open for realism, e.g. offset 10cm)
    const leftSheetX = doorX3d - sheetW / 2 - 0.10
    const leftSheetMesh = new THREE.Mesh(sheetGeo, glassMat)
    leftSheetMesh.position.set(leftSheetX, (doorHeight - 0.06) / 2 + 0.03, facadeZ)
    frontFacadeGroup.add(leftSheetMesh)

    // Right sheet (center to right, slightly open)
    const rightSheetX = doorX3d + sheetW / 2 + 0.10
    const rightSheetMesh = new THREE.Mesh(sheetGeo, glassMat)
    rightSheetMesh.position.set(rightSheetX, (doorHeight - 0.06) / 2 + 0.03, facadeZ)
    frontFacadeGroup.add(rightSheetMesh)

    // 4. Upper Canopy (Marquise) - projecting forward by 0.5m in Z
    const canopyDepth = 0.5
    const canopyGeo = new THREE.BoxGeometry(wallLength, canopyHeight, canopyDepth)
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat)
    canopyMesh.position.set(0, canopyMinY + canopyHeight / 2, facadeZ + canopyDepth / 2)
    canopyMesh.castShadow = true
    canopyMesh.receiveShadow = true
    frontFacadeGroup.add(canopyMesh)

    // 5. Commercial Sign (Placa comercial) — only on the main entrance facade
    if (withSign) {
      const signW = Math.min(wallLength * 0.7, 4.0)
      const signH = 0.5

      // Choose sign colors dynamically based on wall color
      let signBg = '#' + wallColorHex.toString(16).padStart(6, '0')
      let signFg = '#ffffff'
      let signEmissiveColor = 0xffffff
      let signEmissiveIntensity = 0.1

      if (wallColor === 'white') {
        signBg = '#0b3d2e' // Elegant dark green brand color (Projefarma) on white/cream walls
        signEmissiveColor = 0x1ba079
        signEmissiveIntensity = 0.2
      } else if (wallColor === 'mint') {
        signEmissiveColor = 0x10b981
        signEmissiveIntensity = 0.2
      } else if (wallColor === 'blue') {
        signEmissiveColor = 0x60a5fa
        signEmissiveIntensity = 0.2
      }

      const signTex = createSignageTexture(pharmacyName || 'FARMÁCIA PROJEFARMA', signBg, signFg)
      const signFrontMat = new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.1,
        emissive: signEmissiveColor,
        emissiveIntensity: signEmissiveIntensity
      })
      const signBorderMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 })
      const signMaterials = [signBorderMat, signBorderMat, signBorderMat, signBorderMat, signFrontMat, signBorderMat]

      const signGeo = new THREE.BoxGeometry(signW, signH, 0.06)
      const signMesh = new THREE.Mesh(signGeo, signMaterials)
      signMesh.position.set(0, canopyMinY + canopyHeight / 2, facadeZ + canopyDepth + 0.03)
      frontFacadeGroup.add(signMesh)
    }

    // 6. External Lighting (Spotlights under the canopy pointing down)
    const numSpots = Math.max(2, Math.floor(wallLength / 3))
    for (let i = 0; i < numSpots; i++) {
      const spotX = -wallLength / 2 + (wallLength / (numSpots + 1)) * (i + 1)
      
      const fixtureGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8)
      const fixtureMesh = new THREE.Mesh(fixtureGeo, metalMat)
      fixtureMesh.position.set(spotX, canopyMinY - 0.04, facadeZ + canopyDepth / 2)
      frontFacadeGroup.add(fixtureMesh)

      const spotLight = new THREE.SpotLight(0xfffbeb, 2.0, 6.0, Math.PI / 4, 0.5, 1.0)
      spotLight.position.set(spotX, canopyMinY - 0.08, facadeZ + canopyDepth / 2)
      spotLight.target.position.set(spotX, 0, facadeZ + canopyDepth / 2)
      spotLight.castShadow = false
      frontFacadeGroup.add(spotLight)
      frontFacadeGroup.add(spotLight.target)
    }

    // Position and rotate the group so it sits on the wall where the door was actually placed.
    frontFacadeGroup.position.set(0, 0, 0)
    frontFacadeGroup.rotation.set(0, 0, 0)
    frontFacadeGroup.rotation.y = orientToRotationY(mainOrient)
  }


  const rebuildUrbanContext = (widthVal: number, heightVal: number) => {
    const urbanContextGroup = urbanContextGroupRef.current
    if (!urbanContextGroup) return

    // Clear old children
    while (urbanContextGroup.children.length > 0) {
      const child = urbanContextGroup.children[0]
      urbanContextGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      } else if (child instanceof THREE.Light) {
        child.dispose()
      }
    }

    // Corner space is driven purely by the doors: it only appears when there are TWO doors on
    // PERPENDICULAR walls. One door (or two on the same/opposite wall) = a normal street space.
    const urbanDoors = items.filter(item =>
      (item.isDoor ||
        item.itemId?.includes('door') ||
        item.itemId?.includes('porta')) &&
      !item.isEmergency &&
      item.itemId !== 'porta-saida-emergencia'
    )
    // Prefer the N/S door as the street-facing "front" so the scene (built south-facing) only needs
    // a 0°/180° rotation — no width/height swap — and the corner lands on the doors' shared corner.
    const urbanOrients = urbanDoors.map(d => getDoorOrientation(d, storeWidth, storeHeight))
    let urbanMainIdx = urbanOrients.findIndex(o => o === 'N' || o === 'S')
    if (urbanMainIdx < 0) urbanMainIdx = urbanDoors.length ? 0 : -1
    const urbanMainOrient = urbanMainIdx >= 0 ? urbanOrients[urbanMainIdx] : 'S'
    const urbanSideDoor = urbanDoors.find((_, i) => i !== urbanMainIdx) || null
    const urbanD2Abs = urbanSideDoor ? getDoorOrientation(urbanSideDoor, storeWidth, storeHeight) : null
    // d2Orient expressed in the local "south-facing" frame the scene is built in (E/W = corner side).
    const d2Orient = relativeOrient(urbanMainOrient, urbanD2Abs)
    const isCorner = d2Orient === 'E' || d2Orient === 'W'
    const sideWallX = (d2Orient === 'E') ? widthVal / 2 : -widthVal / 2
    const sideSign = (d2Orient === 'E') ? 1 : -1

    const facadeZ = heightVal / 2
    const curbZ = facadeZ + 3.0
    const streetMaxZ = facadeZ + 15.0

    // Materials
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.85, metalness: 0.1 })
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.8 })
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1f242e, roughness: 0.9 })
    const roadMarkMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 }) // yellow
    const paintWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }) // white
    const buildingLeftMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 }) // slate gray
    const buildingRightMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.7 }) // cool gray
    const buildingFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }) // dark metal
    const buildingGlassMat = new THREE.MeshStandardMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.9 })
    const streetlightPoleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.8 })
    const streetlightFixtureMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })

    // 1. Calçada Proxima (Sidewalk Near) - Plane
    const sidewalkGeo = new THREE.PlaneGeometry(120, 3.0)
    const sidewalkMesh = new THREE.Mesh(sidewalkGeo, sidewalkMat)
    sidewalkMesh.rotation.x = -Math.PI / 2
    sidewalkMesh.position.set(0, 0, facadeZ + 1.5)
    sidewalkMesh.receiveShadow = true
    urbanContextGroup.add(sidewalkMesh)

    // Sidewalk joint lines
    for (let x = -60; x <= 60; x += 2) {
      if (Math.abs(x) < widthVal / 2 - 0.1 || Math.abs(x) > widthVal / 2 + 0.1) {
        const jointGeo = new THREE.BoxGeometry(0.015, 0.002, 3.0)
        const jointMesh = new THREE.Mesh(jointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
        jointMesh.position.set(x, 0.001, facadeZ + 1.5)
        urbanContextGroup.add(jointMesh)
      }
    }
    const longJointGeo = new THREE.BoxGeometry(120, 0.002, 0.015)
    const longJointMesh = new THREE.Mesh(longJointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
    longJointMesh.position.set(0, 0.001, facadeZ + 1.5)
    urbanContextGroup.add(longJointMesh)

    // 2. Meio-fio Proximo (Curb Near) - Box
    const curbGeo = new THREE.BoxGeometry(120, 0.15, 0.12)
    const curbMesh = new THREE.Mesh(curbGeo, curbMat)
    curbMesh.position.set(0, -0.075, curbZ - 0.06)
    curbMesh.receiveShadow = true
    urbanContextGroup.add(curbMesh)

    // 3. Rua Asfaltada (Asphalt Road) - Plane
    const roadGeo = new THREE.PlaneGeometry(120, 12.0)
    const roadMesh = new THREE.Mesh(roadGeo, asphaltMat)
    roadMesh.rotation.x = -Math.PI / 2
    roadMesh.position.set(0, -0.15, curbZ + 6.0)
    roadMesh.receiveShadow = true
    urbanContextGroup.add(roadMesh)

    // Road Painted Markings
    const yellowLineLeft = new THREE.Mesh(new THREE.BoxGeometry(120, 0.002, 0.08), roadMarkMat)
    yellowLineLeft.position.set(0, -0.148, curbZ + 5.90)
    urbanContextGroup.add(yellowLineLeft)

    const yellowLineRight = new THREE.Mesh(new THREE.BoxGeometry(120, 0.002, 0.08), roadMarkMat)
    yellowLineRight.position.set(0, -0.148, curbZ + 6.10)
    urbanContextGroup.add(yellowLineRight)

    // Pedestrian Zebra Crossing (Faixa de pedestres - Door 1)
    const doorItem = items.find(item =>
      (item.isDoor ||
        item.itemId?.includes('door') ||
        item.itemId?.includes('porta')) &&
      !item.isEmergency &&
      item.itemId !== 'porta-saida-emergencia'
    )
    const doorW = doorItem?.width ?? 1.2
    const doorX2d = doorItem?.x ?? (storeWidth / 2 - doorW / 2)
    const doorX3d = doorX2d + doorW / 2 - widthVal / 2

    const numStripes = 6
    const stripeW = 0.5
    const stripeD = 4.5
    const stripeSpacing = 0.5
    const crosswalkXStart = doorX3d - ((numStripes - 1) * (stripeW + stripeSpacing)) / 2

    for (let s = 0; s < numStripes; s++) {
      const sx = crosswalkXStart + s * (stripeW + stripeSpacing)
      const stripeGeo = new THREE.BoxGeometry(stripeW, 0.002, stripeD)
      const stripeMesh = new THREE.Mesh(stripeGeo, paintWhiteMat)
      stripeMesh.position.set(sx, -0.148, curbZ + 2.5)
      urbanContextGroup.add(stripeMesh)
    }

    // ── CORNER STREET ELEMENTS ──
    if (isCorner) {
      // 1. Sidewalk Side (Calçada Lateral)
      const sideSidewalkGeo = new THREE.PlaneGeometry(3.0, 120)
      const sideSidewalkMesh = new THREE.Mesh(sideSidewalkGeo, sidewalkMat)
      sideSidewalkMesh.rotation.x = -Math.PI / 2
      sideSidewalkMesh.position.set(sideWallX + sideSign * 1.5, 0, 0)
      sideSidewalkMesh.receiveShadow = true
      urbanContextGroup.add(sideSidewalkMesh)

      // Joints for side sidewalk
      for (let z = -60; z <= 60; z += 2) {
        if (z < -heightVal / 2 || z > heightVal / 2) {
          const jointGeo = new THREE.BoxGeometry(3.0, 0.002, 0.015)
          const jointMesh = new THREE.Mesh(jointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
          jointMesh.position.set(sideWallX + sideSign * 1.5, 0.001, z)
          urbanContextGroup.add(jointMesh)
        }
      }
      const sideLongJointGeo = new THREE.BoxGeometry(0.015, 0.002, 120)
      const sideLongJointMesh = new THREE.Mesh(sideLongJointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
      sideLongJointMesh.position.set(sideWallX + sideSign * 1.5, 0.001, 0)
      urbanContextGroup.add(sideLongJointMesh)

      // 2. Curb Side (Meio-fio Lateral)
      const sideCurbGeo = new THREE.BoxGeometry(0.12, 0.15, 120)
      const sideCurbMesh = new THREE.Mesh(sideCurbGeo, curbMat)
      sideCurbMesh.position.set(sideWallX + sideSign * (3.0 - 0.06), -0.075, 0)
      sideCurbMesh.receiveShadow = true
      urbanContextGroup.add(sideCurbMesh)

      // 3. Asphalt Road Side (Rua Lateral)
      const sideRoadGeo = new THREE.PlaneGeometry(12.0, 120)
      const sideRoadMesh = new THREE.Mesh(sideRoadGeo, asphaltMat)
      sideRoadMesh.rotation.x = -Math.PI / 2
      sideRoadMesh.position.set(sideWallX + sideSign * 9.0, -0.15, 0)
      sideRoadMesh.receiveShadow = true
      urbanContextGroup.add(sideRoadMesh)

      // Side Road painted markings
      const sideYellowLineLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.002, 120), roadMarkMat)
      sideYellowLineLeft.position.set(sideWallX + sideSign * 8.9, -0.148, 0)
      urbanContextGroup.add(sideYellowLineLeft)

      const sideYellowLineRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.002, 120), roadMarkMat)
      sideYellowLineRight.position.set(sideWallX + sideSign * 9.1, -0.148, 0)
      urbanContextGroup.add(sideYellowLineRight)

      // 4. Pedestrian Crossing for Door 2 (offset/size taken from the real corner door item)
      const d2b = urbanSideDoor
        ? getRotatedBounds(urbanSideDoor.x, urbanSideDoor.y, urbanSideDoor.width, urbanSideDoor.height, urbanSideDoor.rotation || 0)
        : null
      const d2Offset = d2b ? ((urbanD2Abs === 'N' || urbanD2Abs === 'S') ? d2b.x : d2b.y) : 0.0
      const d2Width = d2b ? ((urbanD2Abs === 'N' || urbanD2Abs === 'S') ? d2b.width : d2b.height) : 2.0
      const doorZ_start = heightVal / 2 - (d2Offset + d2Width)
      const doorZ_end = heightVal / 2 - d2Offset
      const doorZ_mid = (doorZ_start + doorZ_end) / 2

      const numStripes2 = 6
      const stripeW2 = 0.5
      const stripeD2 = 4.5
      const stripeSpacing2 = 0.5
      const crosswalkZStart = doorZ_mid - ((numStripes2 - 1) * (stripeW2 + stripeSpacing2)) / 2

      for (let s = 0; s < numStripes2; s++) {
        const sz = crosswalkZStart + s * (stripeW2 + stripeSpacing2)
        const stripeGeo = new THREE.BoxGeometry(stripeD2, 0.002, stripeW2)
        const stripeMesh = new THREE.Mesh(stripeGeo, paintWhiteMat)
        stripeMesh.position.set(sideWallX + sideSign * 2.5, -0.148, sz)
        urbanContextGroup.add(stripeMesh)
      }
    }

    // 4. Neighboring Buildings (Left & Right)
    // Avoid neighbor building on the street corner side
    const buildLeftExists = !isCorner || d2Orient === 'E'
    const buildRightExists = !isCorner || d2Orient === 'W'

    const winW = 1.4
    const winH = 1.6

    if (buildLeftExists) {
      const leftBuildW = 30
      const leftBuildH = 9.0
      const leftBuildX = -widthVal / 2 - leftBuildW / 2 - 0.02
      
      const leftBuildGeo = new THREE.BoxGeometry(leftBuildW, leftBuildH, heightVal)
      const leftBuildMesh = new THREE.Mesh(leftBuildGeo, buildingLeftMat)
      leftBuildMesh.position.set(leftBuildX, leftBuildH / 2, 0)
      leftBuildMesh.castShadow = true
      leftBuildMesh.receiveShadow = true
      urbanContextGroup.add(leftBuildMesh)

      const leftStoreW = 12.0
      const leftStoreH = 2.6
      const leftStoreX = -widthVal / 2 - 8.0
      
      const leftStoreGlass = new THREE.Mesh(new THREE.BoxGeometry(leftStoreW, leftStoreH, 0.02), buildingGlassMat)
      leftStoreGlass.position.set(leftStoreX, leftStoreH / 2, facadeZ + 0.01)
      urbanContextGroup.add(leftStoreGlass)

      const leftStoreFrameB = new THREE.Mesh(new THREE.BoxGeometry(leftStoreW, 0.08, 0.08), buildingFrameMat)
      leftStoreFrameB.position.set(leftStoreX, 0.04, facadeZ + 0.01)
      urbanContextGroup.add(leftStoreFrameB)

      const leftStoreFrameT = new THREE.Mesh(new THREE.BoxGeometry(leftStoreW, 0.06, 0.08), buildingFrameMat)
      leftStoreFrameT.position.set(leftStoreX, leftStoreH - 0.03, facadeZ + 0.01)
      urbanContextGroup.add(leftStoreFrameT)

      for (let f = 0; f < 2; f++) {
        const wy = 4.5 + f * 2.5
        for (let w = 0; w < 3; w++) {
          const wx = -widthVal / 2 - 5.0 - w * 4.0
          const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.1, winH + 0.1, 0.06), buildingFrameMat)
          winFrame.position.set(wx, wy, facadeZ + 0.01)
          urbanContextGroup.add(winFrame)
          const winGlass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.02), buildingGlassMat)
          winGlass.position.set(wx, wy, facadeZ + 0.02)
          urbanContextGroup.add(winGlass)
        }
      }
    }

    if (buildRightExists) {
      const rightBuildW = 30
      const rightBuildH = 12.0
      const rightBuildX = widthVal / 2 + rightBuildW / 2 + 0.02
      
      const rightBuildGeo = new THREE.BoxGeometry(rightBuildW, rightBuildH, heightVal)
      const rightBuildMesh = new THREE.Mesh(rightBuildGeo, buildingRightMat)
      rightBuildMesh.position.set(rightBuildX, rightBuildH / 2, 0)
      rightBuildMesh.castShadow = true
      rightBuildMesh.receiveShadow = true
      urbanContextGroup.add(rightBuildMesh)

      const rightStoreW = 14.0
      const rightStoreH = 2.6
      const rightStoreX = widthVal / 2 + 9.0
      
      const rightStoreGlass = new THREE.Mesh(new THREE.BoxGeometry(rightStoreW, rightStoreH, 0.02), buildingGlassMat)
      rightStoreGlass.position.set(rightStoreX, rightStoreH / 2, facadeZ + 0.01)
      urbanContextGroup.add(rightStoreGlass)

      const rightStoreFrameB = new THREE.Mesh(new THREE.BoxGeometry(rightStoreW, 0.08, 0.08), buildingFrameMat)
      rightStoreFrameB.position.set(rightStoreX, 0.04, facadeZ + 0.01)
      urbanContextGroup.add(rightStoreFrameB)

      const rightStoreFrameT = new THREE.Mesh(new THREE.BoxGeometry(rightStoreW, 0.06, 0.08), buildingFrameMat)
      rightStoreFrameT.position.set(rightStoreX, rightStoreH - 0.03, facadeZ + 0.01)
      urbanContextGroup.add(rightStoreFrameT)

      for (let f = 0; f < 3; f++) {
        const wy = 4.5 + f * 2.8
        for (let w = 0; w < 3; w++) {
          const wx = widthVal / 2 + 5.0 + w * 4.5
          const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.1, winH + 0.1, 0.06), buildingFrameMat)
          winFrame.position.set(wx, wy, facadeZ + 0.01)
          urbanContextGroup.add(winFrame)
          const winGlass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.02), buildingGlassMat)
          winGlass.position.set(wx, wy, facadeZ + 0.02)
          urbanContextGroup.add(winGlass)
        }
      }
    }

    // 5. Calçada do Lado Oposto (Opposite Sidewalk)
    const oppCurbZ = facadeZ + 15.0
    const oppSidewalkZ = facadeZ + 16.5

    const oppCurbGeo = new THREE.BoxGeometry(120, 0.15, 0.12)
    const oppCurbMesh = new THREE.Mesh(oppCurbGeo, curbMat)
    oppCurbMesh.position.set(0, -0.075, oppCurbZ + 0.06)
    oppCurbMesh.receiveShadow = true
    urbanContextGroup.add(oppCurbMesh)

    const oppSidewalkGeo = new THREE.PlaneGeometry(120, 3.0)
    const oppSidewalkMesh = new THREE.Mesh(oppSidewalkGeo, sidewalkMat)
    oppSidewalkMesh.rotation.x = -Math.PI / 2
    oppSidewalkMesh.position.set(0, 0, oppSidewalkZ)
    oppSidewalkMesh.receiveShadow = true
    urbanContextGroup.add(oppSidewalkMesh)

    // Joints for opposite sidewalk
    for (let x = -60; x <= 60; x += 2) {
      const jointGeo = new THREE.BoxGeometry(0.015, 0.002, 3.0)
      const jointMesh = new THREE.Mesh(jointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
      jointMesh.position.set(x, 0.001, oppSidewalkZ)
      urbanContextGroup.add(jointMesh)
    }
    const oppLongJointGeo = new THREE.BoxGeometry(120, 0.002, 0.015)
    const oppLongJointMesh = new THREE.Mesh(oppLongJointGeo, new THREE.MeshBasicMaterial({ color: 0x555555 }))
    oppLongJointMesh.position.set(0, 0.001, oppSidewalkZ)
    urbanContextGroup.add(oppLongJointMesh)

    // 6. Prédios do Lado Oposto (Opposite Buildings)
    const oppBuildZ = facadeZ + 18.0
    const buildDepth = 10.0
    const buildCenterZ = oppBuildZ + buildDepth / 2

    const buildingsConfig = [
      { width: 18, height: 11, color: 0x475569, x: -35, sign: "PADARIA BELA VISTA" },
      { width: 14, height: 8, color: 0x5b21b6, x: -18, sign: "LIVRARIA CULTURAL" },
      { width: 16, height: 14, color: 0x1e3a8a, x: -2, sign: "BANCO NACIONAL" },
      { width: 12, height: 9, color: 0xb45309, x: 13, sign: "CAFÉ GOURMET" },
      { width: 20, height: 12, color: 0x374151, x: 30, sign: "BOUTIQUE MODA" }
    ]

    // Filter buildings that would block the side street
    const sideStreetMinX = (d2Orient === 'E') ? (widthVal / 2) : (-widthVal / 2 - 18.0)
    const sideStreetMaxX = (d2Orient === 'E') ? (widthVal / 2 + 18.0) : (-widthVal / 2)
    const activeBuildingsConfig = isCorner
      ? buildingsConfig.filter(b => (b.x + b.width/2) < sideStreetMinX || (b.x - b.width/2) > sideStreetMaxX)
      : buildingsConfig

    activeBuildingsConfig.forEach(cfg => {
      // Main block mesh
      const buildGeo = new THREE.BoxGeometry(cfg.width, cfg.height, buildDepth)
      const buildMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7 })
      const buildMesh = new THREE.Mesh(buildGeo, buildMat)
      buildMesh.position.set(cfg.x, cfg.height / 2, buildCenterZ)
      buildMesh.castShadow = true
      buildMesh.receiveShadow = true
      urbanContextGroup.add(buildMesh)

      // Storefront glass on ground floor
      const storeW = cfg.width - 2.0
      const storeH = 2.6
      const glassGeo = new THREE.BoxGeometry(storeW, storeH, 0.02)
      const glassMesh = new THREE.Mesh(glassGeo, buildingGlassMat)
      glassMesh.position.set(cfg.x, storeH / 2, oppBuildZ - 0.01)
      urbanContextGroup.add(glassMesh)

      // Storefront frame
      const frameB = new THREE.Mesh(new THREE.BoxGeometry(storeW, 0.08, 0.08), buildingFrameMat)
      frameB.position.set(cfg.x, 0.04, oppBuildZ - 0.01)
      urbanContextGroup.add(frameB)

      const frameT = new THREE.Mesh(new THREE.BoxGeometry(storeW, 0.06, 0.08), buildingFrameMat)
      frameT.position.set(cfg.x, storeH - 0.03, oppBuildZ - 0.01)
      urbanContextGroup.add(frameT)

      // Letreiro comercial
      const signTex = createSignageTexture(cfg.sign, '#1f2937', '#ffffff')
      const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.1 })
      const signGeo = new THREE.BoxGeometry(storeW * 0.7, 0.45, 0.04)
      const signMesh = new THREE.Mesh(signGeo, signMat)
      signMesh.position.set(cfg.x, storeH + 0.3, oppBuildZ - 0.02)
      urbanContextGroup.add(signMesh)

      // Upper floor windows
      const floors = Math.floor(cfg.height / 3.0)
      for (let f = 1; f < floors; f++) {
        const wy = 3.8 + (f - 1) * 2.8
        const winCount = Math.floor(cfg.width / 4.0)
        for (let w = 0; w < winCount; w++) {
          const wx = cfg.x - cfg.width / 2 + (cfg.width / (winCount + 1)) * (w + 1)
          const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.1, winH + 0.1, 0.06), buildingFrameMat)
          winFrame.position.set(wx, wy, oppBuildZ - 0.01)
          urbanContextGroup.add(winFrame)
          const winGlass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.02), buildingGlassMat)
          winGlass.position.set(wx, wy, oppBuildZ - 0.01 + 0.01)
          urbanContextGroup.add(winGlass)
        }
      }
    })

    // ── Corner Side Street opposite buildings ──
    if (isCorner) {
      const sideBuildingsConfig = [
        { width: 16, height: 10, color: 0x334155, z: -30, sign: "RESTAURANTE CENTRAL" },
        { width: 14, height: 12, color: 0x065f46, z: -10, sign: "POSTO COMBUSTÍVEL" },
        { width: 18, height: 9, color: 0x7c2d12, z: 15, sign: "MERCADO DO BAIRRO" }
      ]

      sideBuildingsConfig.forEach(cfg => {
        // Main block mesh
        const buildGeo = new THREE.BoxGeometry(10.0, cfg.height, cfg.width)
        const buildMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7 })
        const buildMesh = new THREE.Mesh(buildGeo, buildMat)
        buildMesh.position.set(sideWallX + sideSign * 23.0, cfg.height / 2, cfg.z)
        buildMesh.castShadow = true
        buildMesh.receiveShadow = true
        urbanContextGroup.add(buildMesh)

        // Storefront glass
        const storeW = cfg.width - 2.0
        const storeH = 2.6
        const glassGeo = new THREE.BoxGeometry(0.02, storeH, storeW)
        const glassMesh = new THREE.Mesh(glassGeo, buildingGlassMat)
        glassMesh.position.set(sideWallX + sideSign * 18.0 - sideSign * 0.01, storeH / 2, cfg.z)
        urbanContextGroup.add(glassMesh)

        // Storefront frame
        const frameB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, storeW), buildingFrameMat)
        frameB.position.set(sideWallX + sideSign * 18.0 - sideSign * 0.01, 0.04, cfg.z)
        urbanContextGroup.add(frameB)

        const frameT = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, storeW), buildingFrameMat)
        frameT.position.set(sideWallX + sideSign * 18.0 - sideSign * 0.01, storeH - 0.03, cfg.z)
        urbanContextGroup.add(frameT)

        // Sign
        const sTex = createSignageTexture(cfg.sign, '#1f2937', '#ffffff')
        const sMat = new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.1 })
        const sGeo = new THREE.BoxGeometry(0.04, 0.45, storeW * 0.7)
        const sMesh = new THREE.Mesh(sGeo, sMat)
        sMesh.position.set(sideWallX + sideSign * 18.0 - sideSign * 0.02, storeH + 0.3, cfg.z)
        urbanContextGroup.add(sMesh)
      })
    }

    // 7. Vegetação (Trees along both sidewalks)
    const treePositions = [
      // Near sidewalk
      { x: -16.0, z: curbZ - 0.3 },
      { x: 16.0, z: curbZ - 0.3 },
      // Opposite sidewalk
      { x: -24.0, z: oppCurbZ + 1.2 },
      { x: 0.0, z: oppCurbZ + 1.2 },
      { x: 24.0, z: oppCurbZ + 1.2 }
    ]

    // Add side street trees if corner
    if (isCorner) {
      treePositions.push(
        { x: sideWallX + sideSign * 0.3, z: -35.0 },
        { x: sideWallX + sideSign * 0.3, z: 35.0 },
        { x: sideWallX + sideSign * 17.7, z: -20.0 },
        { x: sideWallX + sideSign * 17.7, z: 20.0 }
      )
    }

    treePositions.forEach(pos => {
      const tree = createTreeMesh()
      tree.position.set(pos.x, 0, pos.z)
      urbanContextGroup.add(tree)
    })

    // 8. Postes de Iluminação Pública (Streetlights)
    const streetlightPositions = [
      { x: -widthVal / 2 - 2, z: curbZ - 0.3, rotY: 0 },
      { x: widthVal / 2 + 2, z: curbZ - 0.3, rotY: 0 },
      // Opposite side (pointing back to street)
      { x: -widthVal / 2 - 10, z: oppCurbZ + 1.2, rotY: Math.PI },
      { x: 0, z: oppCurbZ + 1.2, rotY: Math.PI },
      { x: widthVal / 2 + 10, z: oppCurbZ + 1.2, rotY: Math.PI }
    ]

    streetlightPositions.forEach((pos) => {
      const streetlightGroup = new THREE.Group()
      streetlightGroup.position.set(pos.x, 0, pos.z)
      if (pos.rotY) {
        streetlightGroup.rotation.y = pos.rotY
      }
      
      const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 5.0, 8)
      const poleMesh = new THREE.Mesh(poleGeo, streetlightPoleMat)
      poleMesh.position.y = 2.5
      poleMesh.castShadow = true
      poleMesh.receiveShadow = true
      streetlightGroup.add(poleMesh)

      const armGeo = new THREE.BoxGeometry(0.06, 0.06, 1.2)
      const armMesh = new THREE.Mesh(armGeo, streetlightPoleMat)
      armMesh.position.set(0, 5.0, 0.5)
      armMesh.castShadow = true
      streetlightGroup.add(armMesh)

      const headGeo = new THREE.BoxGeometry(0.15, 0.08, 0.3)
      const headMesh = new THREE.Mesh(headGeo, streetlightFixtureMat)
      headMesh.position.set(0, 4.96, 1.1)
      headMesh.castShadow = true
      streetlightGroup.add(headMesh)

      const lensGeo = new THREE.BoxGeometry(0.12, 0.01, 0.24)
      const lensMesh = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0xffe885 }))
      lensMesh.position.set(0, 4.915, 1.1)
      streetlightGroup.add(lensMesh)

      const light = new THREE.SpotLight(0xffd8a8, 1.5, 16.0, Math.PI / 4, 0.6, 1.0)
      light.position.set(0, 4.9, 1.1)
      light.target.position.set(0, 0, 1.1)
      light.castShadow = false
      streetlightGroup.add(light)
      streetlightGroup.add(light.target)

      urbanContextGroup.add(streetlightGroup)
    })

    // Side Streetlights
    if (isCorner) {
      const sideStreetlightPositions = [
        { x: sideWallX + sideSign * 0.3, z: -20, rotY: sideSign * Math.PI / 2 },
        { x: sideWallX + sideSign * 0.3, z: 20, rotY: sideSign * Math.PI / 2 },
        // Opposite side of side street pointing back
        { x: sideWallX + sideSign * 17.7, z: -35, rotY: -sideSign * Math.PI / 2 },
        { x: sideWallX + sideSign * 17.7, z: 0, rotY: -sideSign * Math.PI / 2 },
        { x: sideWallX + sideSign * 17.7, z: 35, rotY: -sideSign * Math.PI / 2 }
      ]

      sideStreetlightPositions.forEach((pos) => {
        const streetlightGroup = new THREE.Group()
        streetlightGroup.position.set(pos.x, 0, pos.z)
        streetlightGroup.rotation.y = pos.rotY
        
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 5.0, 8)
        const poleMesh = new THREE.Mesh(poleGeo, streetlightPoleMat)
        poleMesh.position.y = 2.5
        poleMesh.castShadow = true
        poleMesh.receiveShadow = true
        streetlightGroup.add(poleMesh)

        const armGeo = new THREE.BoxGeometry(0.06, 0.06, 1.2)
        const armMesh = new THREE.Mesh(armGeo, streetlightPoleMat)
        armMesh.position.set(0, 5.0, 0.5)
        armMesh.castShadow = true
        streetlightGroup.add(armMesh)

        const headGeo = new THREE.BoxGeometry(0.15, 0.08, 0.3)
        const headMesh = new THREE.Mesh(headGeo, streetlightFixtureMat)
        headMesh.position.set(0, 4.96, 1.1)
        headMesh.castShadow = true
        streetlightGroup.add(headMesh)

        const lensGeo = new THREE.BoxGeometry(0.12, 0.01, 0.24)
        const lensMesh = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0xffe885 }))
        lensMesh.position.set(0, 4.915, 1.1)
        streetlightGroup.add(lensMesh)

        const light = new THREE.SpotLight(0xffd8a8, 1.5, 16.0, Math.PI / 4, 0.6, 1.0)
        light.position.set(0, 4.9, 1.1)
        light.target.position.set(0, 0, 1.1)
        light.castShadow = false
        streetlightGroup.add(light)
        streetlightGroup.add(light.target)

        urbanContextGroup.add(streetlightGroup)
      })
    }

    // 9. Procedural Animated Cars
    carsRef.current = []

    const carColors = [0xef4444, 0x3b82f6, 0xf59e0b, 0xfafafa, 0x10b981, 0x111827]
    const carSpawns = [
      { laneZ: curbZ + 3.5, speed: 8.5, dir: -1, startX: -30, color: carColors[0], axis: 'x' },
      { laneZ: curbZ + 4.2, speed: 10.5, dir: -1, startX: 20, color: carColors[1], axis: 'x' },
      { laneZ: curbZ + 7.8, speed: 9.0, dir: 1, startX: -10, color: carColors[2], axis: 'x' },
      { laneZ: curbZ + 8.5, speed: 11.5, dir: 1, startX: 40, color: carColors[3], axis: 'x' }
    ]

    if (isCorner) {
      const laneX1 = sideWallX + sideSign * 3.5
      const laneX2 = sideWallX + sideSign * 4.2
      const laneX3 = sideWallX + sideSign * 7.8
      const laneX4 = sideWallX + sideSign * 8.5

      carSpawns.push(
        { laneZ: laneX1, speed: 8.0, dir: -1, startX: -35, color: carColors[4], axis: 'z' } as any,
        { laneZ: laneX2, speed: 11.0, dir: -1, startX: 15, color: carColors[5], axis: 'z' } as any,
        { laneZ: laneX3, speed: 9.5, dir: 1, startX: -15, color: carColors[0], axis: 'z' } as any,
        { laneZ: laneX4, speed: 10.0, dir: 1, startX: 35, color: carColors[1], axis: 'z' } as any
      )
    }

    carSpawns.forEach(spawn => {
      const carGroup = createCarMesh(spawn.color)
      const axis = (spawn as any).axis || 'x'
      if (axis === 'x') {
        carGroup.position.set(spawn.startX, -0.15, spawn.laneZ)
        if (spawn.dir === -1) {
          carGroup.rotation.y = Math.PI // Face negative X
        }
      } else {
        carGroup.position.set(spawn.laneZ, -0.15, spawn.startX)
        if (spawn.dir === 1) {
          carGroup.rotation.y = 0 // Face positive Z
        } else {
          carGroup.rotation.y = Math.PI // Face negative Z
        }
      }
      urbanContextGroup.add(carGroup)
      carsRef.current.push({
        mesh: carGroup,
        speed: spawn.speed,
        dir: spawn.dir,
        axis: axis
      } as any)
    })

    // The whole street scene is built "south-facing"; rotate it onto the wall where the main
    // entrance actually is, so the sidewalk/street/crosswalk line up with the door in 3D.
    urbanContextGroup.position.set(0, 0, 0)
    urbanContextGroup.rotation.set(0, orientToRotationY(urbanMainOrient), 0)
  }


  // --- Effect 2: Atualização de Dimensões (Paredes, Piso, Teto, Spawn) ---
  useEffect(() => {
    if (!initializedRef.current) return
    console.log("📏 [3D Viewer] Effect 2 (Dimensões) atualizando para:", storeWidth, "x", storeHeight)

    const widthVal = Math.max(3, Number(storeWidth) || 10)
    const heightVal = Math.max(3, Number(storeHeight) || 12)

    // Set camera default orbit look angle to be directly in front of the entrance showing the facade and part of the interior
    if (initialCameraView === 'aerial') {
      const sizeAerial = Math.max(widthVal, heightVal)
      orbitDistanceRef.current = sizeAerial * 1.5
      orbitYawRef.current = 0.0
      orbitPitchRef.current = 1.45 // close to 90 degrees looking down
      orbitTargetRef.current.set(0, 0, 0)
    } else {
      orbitDistanceRef.current = Math.max(widthVal, heightVal) * 1.35
      orbitYawRef.current = 0.12 // slightly offset for architectural depth
      orbitPitchRef.current = 0.18 // eye-level perspective looking slightly down
      orbitTargetRef.current.set(0, 0.5, 0)
    }

    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return

    // 0. Ajustar o frustum da luz direcional ao tamanho da loja, senão lojas grandes
    //    (>30m) ficam sem sombra e lojas pequenas desperdiçam a resolução do shadow map.
    const dirLight = directionalLightRef.current
    if (dirLight) {
      const margin = 6
      const ext = Math.max(widthVal, heightVal) / 2 + margin
      const shadowCam = dirLight.shadow.camera
      shadowCam.left = -ext
      shadowCam.right = ext
      shadowCam.top = ext
      shadowCam.bottom = -ext
      shadowCam.near = 0.1
      shadowCam.far = dirLight.position.y + ext * 2
      shadowCam.updateProjectionMatrix()
      const desiredMap = Math.max(widthVal, heightVal) > 24 ? 2048 : 1024
      if (dirLight.shadow.mapSize.width !== desiredMap) {
        dirLight.shadow.mapSize.set(desiredMap, desiredMap)
        dirLight.shadow.map?.dispose()
        dirLight.shadow.map = null as any
      }
    }

    // 1. Atualizar Piso
    const floor = floorMeshRef.current
    if (floor) {
      floor.geometry.dispose()
      floor.geometry = new THREE.PlaneGeometry(widthVal, heightVal)
    }

    // 2. Atualizar Grid Helper
    const grid = floorGridRef.current
    if (grid) {
      scene.remove(grid)
      grid.geometry.dispose()
      if (Array.isArray(grid.material)) {
        grid.material.forEach(m => m.dispose())
      } else {
        grid.material.dispose()
      }
      
      const config = FLOOR_STYLES[floorStyle as keyof typeof FLOOR_STYLES] || FLOOR_STYLES.grid
      const newGrid = createFloorGrid(widthVal, heightVal, config.gridColor || 0x10b981)
      newGrid.visible = config.showGrid !== false
      scene.add(newGrid)
      floorGridRef.current = newGrid
    }

    // 3. Atualizar Teto
    const ceiling = ceilingMeshRef.current
    if (ceiling) {
      ceiling.geometry.dispose()
      ceiling.geometry = new THREE.PlaneGeometry(widthVal, heightVal)
      ceiling.position.y = 3.0
    }

    // 4. Atualizar Geometria e Posição das Paredes
    const wBack = wallsRef.current[0]
    const wLeft = wallsRef.current[1]
    const wRight = wallsRef.current[2]
    const wFront = wallsRef.current[3]

    // Determine door orientations to hide matching solid walls
    const doors = items.filter(item =>
      (item.isDoor ||
        item.itemId?.includes('door') ||
        item.itemId?.includes('porta')) &&
      !item.isEmergency &&
      item.itemId !== 'porta-saida-emergencia'
    )
    // Primary entrance = prefer a door on a N/S wall. This keeps the corner street scene un-swapped
    // (rotation 0°/180°) and puts the main sign + front street on it; the perpendicular door becomes
    // the corner/side facade. So the corner always lands on the doors' shared corner.
    const doorOrients = doors.map(d => getDoorOrientation(d, storeWidth, storeHeight))
    let primaryIdx = doorOrients.findIndex(o => o === 'N' || o === 'S')
    if (primaryIdx < 0) primaryIdx = doors.length ? 0 : -1
    const doorItem = primaryIdx >= 0 ? doors[primaryIdx] : undefined
    const doorItem2 = doors.find((_, i) => i !== primaryIdx) || null

    const mainOrient = doorItem ? doorOrients[primaryIdx] : 'S'
    const rawSideOrient = doorItem2 ? getDoorOrientation(doorItem2, storeWidth, storeHeight) : null
    // Only hide a second perimeter wall for a GENUINE corner (second door on a perpendicular wall),
    // which is exactly when a side facade is built. Same/opposite-wall second doors keep their wall.
    const relSideOrient = relativeOrient(mainOrient, rawSideOrient)
    const sideOrient = (relSideOrient === 'E' || relSideOrient === 'W') ? rawSideOrient : null

    // Store orientations for the per-frame dollhouse cutaway in the animation loop.
    mainOrientRef.current = mainOrient
    sideOrientRef.current = sideOrient

    if (wBack) {
      wBack.geometry.dispose()
      wBack.geometry = new THREE.PlaneGeometry(widthVal, 3.0)
      wBack.position.set(0, 1.5, -heightVal / 2)
      const base = (mainOrient !== 'N' && sideOrient !== 'N')
      wBack.userData.baseVisible = base
      wBack.visible = base
    }

    if (wLeft) {
      wLeft.geometry.dispose()
      wLeft.geometry = new THREE.PlaneGeometry(heightVal, 3.0)
      wLeft.position.set(-widthVal / 2, 1.5, 0)
      const base = (mainOrient !== 'W' && sideOrient !== 'W')
      wLeft.userData.baseVisible = base
      wLeft.visible = base
    }

    if (wRight) {
      wRight.geometry.dispose()
      wRight.geometry = new THREE.PlaneGeometry(heightVal, 3.0)
      wRight.position.set(widthVal / 2, 1.5, 0)
      const base = (mainOrient !== 'E' && sideOrient !== 'E')
      wRight.userData.baseVisible = base
      wRight.visible = base
    }

    if (wFront) {
      wFront.geometry.dispose()
      wFront.geometry = new THREE.PlaneGeometry(widthVal, 3.0)
      wFront.position.set(0, 1.5, heightVal / 2)
      const base = (mainOrient !== 'S' && sideOrient !== 'S')
      wFront.userData.baseVisible = base
      wFront.visible = base
    }

    // Determine which facade should have vitrines (default is front unless side has more/closer vitrines).
    // Detection covers every way a vitrine can appear: catalog ids (15 MDF / 16 vidro / 92 dermo),
    // the item name, and the user-facing label (reference layouts only carry "Vitrine" on the label).
    const vitrines = items.filter(it =>
      it.itemId?.includes('catalog-15') ||
      it.itemId?.includes('catalog-16') ||
      it.itemId?.includes('catalog-92') ||
      it.name?.toLowerCase().includes('vitrine') ||
      it.name?.toLowerCase().includes('dermocosm') ||
      it.label?.toLowerCase().includes('vitrine')
    )
    
    // The genuine corner door = the non-primary door, only if it sits on a PERPENDICULAR wall.
    const door2Perp = (relSideOrient === 'E' || relSideOrient === 'W') ? doorItem2 : null

    let frontHasVitrines = true
    let sideHasVitrines = false

    if (door2Perp && doorItem) {
      if (vitrines.length > 0) {
        let distToD1 = 0
        let distToD2 = 0
        vitrines.forEach(v => {
          distToD1 += Math.sqrt((v.x - doorItem.x) ** 2 + (v.y - doorItem.y) ** 2)
          distToD2 += Math.sqrt((v.x - door2Perp.x) ** 2 + (v.y - door2Perp.y) ** 2)
        })
        frontHasVitrines = distToD1 <= distToD2
        sideHasVitrines = !frontHasVitrines
      }
    }

    // Render BOTH doors through the SAME corrected builder, so each door appears in 3D exactly
    // where it was placed in 2D. Main entrance = doors[0]; side facade only for a perpendicular door.
    buildDoorFacade(frontFacadeGroupRef.current, doorItem || null, widthVal, heightVal, frontHasVitrines, true)

    if (door2Perp) {
      buildDoorFacade(sideFacadeGroupRef.current, door2Perp, widthVal, heightVal, sideHasVitrines, false)
    } else if (sideFacadeGroupRef.current) {
      // No corner door → ensure the side facade group is emptied (no phantom side wall)
      const g = sideFacadeGroupRef.current
      while (g.children.length > 0) {
        const child = g.children[0]
        g.remove(child)
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
          else child.material.dispose()
        } else if (child instanceof THREE.Light) {
          child.dispose()
        }
      }
    }

    // Atualizar o contexto urbano realista
    rebuildUrbanContext(widthVal, heightVal)

    // 5. Atualizar Placas de Setorização
    const signageGroup = signageGroupRef.current
    if (signageGroup) {
      while (signageGroup.children.length > 0) {
        const child = signageGroup.children[0] as THREE.Mesh
        signageGroup.remove(child)
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }

      const addSign = (text: string, x: number, y: number, z: number, rotY: number) => {
        const tex = createSignageTexture(text, '#070f0b', '#ffffff')
        const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2, emissive: 0x10b981, emissiveIntensity: 0.15 })
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 })
        const materials = [borderMat, borderMat, borderMat, borderMat, frontMat, borderMat]
        
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.06), materials)
        mesh.position.set(x, y, z)
        mesh.rotation.y = rotY
        signageGroup.add(mesh)
      }

      addSign('Medicamentos', 0, 2.1, -heightVal / 2 + 0.05, 0)
      addSign('Perfumaria & Cosméticos', -widthVal / 2 + 0.05, 2.1, 0, Math.PI / 2)
      addSign('Higiene & Conveniência', widthVal / 2 - 0.05, 2.1, 0, -Math.PI / 2)
      addSign('Caixa / Pagamentos', 0, 2.1, heightVal / 2 - 0.05, Math.PI)
    }

    // 6. Atualizar a Grade de Iluminação do Teto (Fluorescent LED Panels)
    const lightsGroup = lightsGroupRef.current
    if (lightsGroup) {
      // Hide ceiling lamps in orbit mode, show in first-person
      lightsGroup.visible = (cameraModeRef.current === 'first-person')
      // Clear old lights and fixture meshes
      while (lightsGroup.children.length > 0) {
        const child = lightsGroup.children[0]
        lightsGroup.remove(child)
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        } else if (child instanceof THREE.Light) {
          child.dispose()
        }
      }

      // Compute grid size
      const cols = Math.max(1, Math.floor(widthVal / 3.5))
      const rows = Math.max(1, Math.floor(heightVal / 3.5))

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const lx = -widthVal / 2 + (widthVal / (cols + 1)) * (c + 1)
          const lz = -heightVal / 2 + (heightVal / (rows + 1)) * (r + 1)

          // White glowing panel fixture on the ceiling (looks like emitting light)
          const fixtureGeo = new THREE.BoxGeometry(0.8, 0.02, 0.8)
          const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
          const fixture = new THREE.Mesh(fixtureGeo, fixtureMat)
          fixture.position.set(lx, 2.99, lz)
          lightsGroup.add(fixture)
        }
      }
    }

    // Interior point lights — distributed across the ceiling and ALWAYS visible (orbit + first-person),
    // so the shelves read with form in the default hero view instead of flat ambient fill.
    const interiorLightGroup = interiorLightGroupRef.current
    if (interiorLightGroup) {
      while (interiorLightGroup.children.length > 0) {
        const child = interiorLightGroup.children[0]
        interiorLightGroup.remove(child)
        if (child instanceof THREE.Light) child.dispose()
      }
      const lcols = Math.min(3, Math.max(1, Math.round(widthVal / 6)))
      const lrows = Math.min(3, Math.max(1, Math.round(heightVal / 6)))
      const reach = Math.max(widthVal, heightVal)
      for (let c = 0; c < lcols; c++) {
        for (let r = 0; r < lrows; r++) {
          const lx = -widthVal / 2 + (widthVal / (lcols + 1)) * (c + 1)
          const lz = -heightVal / 2 + (heightVal / (lrows + 1)) * (r + 1)
          const pl = new THREE.PointLight(0xfff6e8, 0.9, reach, 1.6)
          pl.position.set(lx, 2.7, lz)
          pl.castShadow = false
          interiorLightGroup.add(pl)
        }
      }
    }

    // 7. Recalcular spawn de câmera de forma segura usando busca em grade
    let spawnX = 0
    let spawnZ = heightVal / 2 - 1.2
    let safeSpawnFound = false
    
    const stepSize = 0.4
    const xSteps = Math.floor(widthVal / stepSize)
    const zSteps = Math.floor(heightVal / stepSize)
    
    let bestX = 0
    let bestZ = heightVal / 2 - 1.2
    
    // Procura por um ponto seguro sem colisões começando pela entrada (fundo da loja)
    for (let zi = zSteps - 2; zi >= 2; zi--) {
      const zPos = -heightVal / 2 + zi * stepSize
      for (let xi = 1; xi < xSteps; xi++) {
        // Busca do centro para as bordas (X)
        const offset = Math.floor(xi / 2) * (xi % 2 === 0 ? 1 : -1)
        const xPos = offset * stepSize
        
        if (Math.abs(xPos) > widthVal / 2 - 0.4) continue
        if (zPos < -heightVal / 2 + 0.4 || zPos > heightVal / 2 - 0.4) continue
        
        let intersects = false
        const camBox = new THREE.Box3(
          new THREE.Vector3(xPos - 0.15, 0.1, zPos - 0.15),
          new THREE.Vector3(xPos + 0.15, 1.9, zPos + 0.15)
        )
        
        for (const item of items) {
          if (item && isSolidCollidable(item)) {
            const bounds = getRotatedBounds(
              Number(item.x) || 0,
              Number(item.y) || 0,
              Number(item.width) || 1.0,
              Number(item.height) || 1.0,
              Number(item.rotation) || 0
            )
            const minX = bounds.x - widthVal / 2
            const maxX = minX + bounds.width
            const minZ = bounds.y - heightVal / 2
            const maxZ = minZ + bounds.height
            
            const obstacleBox = new THREE.Box3(
              new THREE.Vector3(minX, 0, minZ),
              new THREE.Vector3(maxX, 3.0, maxZ)
            )
            
            if (camBox.intersectsBox(obstacleBox)) {
              intersects = true
              break
            }
          }
        }
        
        if (!intersects) {
          bestX = xPos
          bestZ = zPos
          safeSpawnFound = true
          break
        }
      }
      if (safeSpawnFound) break
    }
    
    spawnX = bestX
    spawnZ = bestZ

    if (isNaN(spawnX) || isNaN(spawnZ)) {
      spawnX = 0
      spawnZ = heightVal / 2 - 1.2
    }
    const spawnMargin = 0.3
    spawnX = Math.max(-widthVal / 2 + spawnMargin, Math.min(spawnX, widthVal / 2 - spawnMargin))
    spawnZ = Math.max(-heightVal / 2 + spawnMargin, Math.min(spawnZ, heightVal / 2 - spawnMargin))
    
    // Position camera and reset look angles
    camera.position.set(spawnX, 1.6, spawnZ)
    yawRef.current = 0
    pitchRef.current = 0
    camera.rotation.set(0, 0, 0)

    if (rendererRef.current) {
      rendererRef.current.shadowMap.needsUpdate = true
    }
  }, [storeWidth, storeHeight, items, wallColor, pharmacyName])

  // --- Effect 3: Sincronização de Móveis ---
  useEffect(() => {
    if (!initializedRef.current) return
    console.log("🔄 [3D Viewer] Effect 3 (Furniture Sync) rodando para", items.length, "itens")

    const scene = sceneRef.current
    const furnitureGroup = furnitureGroupRef.current
    if (!scene || !furnitureGroup) return

    // 1. Limpar móveis antigos
    while (furnitureGroup.children.length > 0) {
      const group = furnitureGroup.children[0]
      furnitureGroup.remove(group)
      
      if (group && typeof group.traverse === 'function') {
        group.traverse(child => {
          if (child && (child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
              try {
                mesh.geometry.dispose()
              } catch (e) {
                console.warn("Erro ao descartar geometria:", e)
              }
            }
            if (mesh.material) {
              try {
                if (Array.isArray(mesh.material)) {
                  mesh.material.forEach(m => {
                    if (m && typeof m.dispose === 'function') m.dispose()
                  })
                } else if (typeof mesh.material.dispose === 'function') {
                  mesh.material.dispose()
                }
              } catch (e) {
                console.warn("Erro ao descartar material:", e)
              }
            }
          }
        })
      }
    }

    lodObjectsRef.current = []

    const widthVal = Math.max(3, Number(storeWidth) || 10)
    const heightVal = Math.max(3, Number(storeHeight) || 12)
    const newFurnitureMeshes: { box: THREE.Box3; isObstacle: boolean }[] = []

    // 2. Popular móveis
    items.forEach(item => {
      if (!item) return
      // Skip doors since they are custom-rendered on the front facade
      if (item.isDoor || item.itemId?.includes('door') || item.itemId?.includes('porta')) return

      const nameUpper = (item.name || '').toUpperCase()
      const idUpper = (item.itemId || item.id || '').toUpperCase()

      const isLCheckout = idUpper.includes('catalog-131') || 
                          nameUpper.includes('CHECK OUT L') || 
                          nameUpper.includes('CHECKOUT L') || 
                          nameUpper.includes('BALCÃO EM L') || 
                          nameUpper.includes('BALCÃO L') || 
                          nameUpper.includes('BA1200') ||
                          nameUpper.includes('BA 1200') ||
                          nameUpper.includes('BA120') ||
                          nameUpper.includes('BA 120')

      const itemW = Number(item.width) || 1.0
      const itemD = Number(item.height) || 1.0
      const itemX = Number(item.x) || 0
      const itemY = Number(item.y) || 0
      let itemH = Number(item.height3d) || CATEGORY_HEIGHTS[item.category as keyof typeof CATEGORY_HEIGHTS] || 1.2
      
      if (isLCheckout) {
        itemH = 1.05
      }

      const itemGroup = new THREE.Group()
      itemGroup.name = item.category || 'MÓVEL'

      const thX = itemX - widthVal / 2
      const thZ = itemY - heightVal / 2
      itemGroup.position.set(thX, 0, thZ)
      itemGroup.rotation.y = -(Number(item.rotation) || 0) * Math.PI / 180

      const subGroup = new THREE.Group()
      const productsGroup = new THREE.Group()
      productsGroup.name = "productsGroup"
      subGroup.add(productsGroup)

      // Helper function to clone and scale model to fit the item's dimensions
      const applyModelToSubGroup = (model: THREE.Group) => {
        const modelClone = model.clone()
        const bbox = new THREE.Box3().setFromObject(modelClone)
        const size = new THREE.Vector3()
        bbox.getSize(size)
        
        const scaleX = size.x > 0 ? itemW / size.x : 1
        const scaleY = size.y > 0 ? itemH / size.y : 1
        const scaleZ = size.z > 0 ? itemD / size.z : 1
        
        modelClone.scale.set(scaleX, scaleY, scaleZ)
        
        const localBbox = new THREE.Box3().setFromObject(modelClone)
        const minY = localBbox.min.y
        modelClone.position.y = -minY
        
        // Centering the model relative to its boundaries in X and Z
        const centerX = (localBbox.max.x + localBbox.min.x) / 2
        const centerZ = (localBbox.max.z + localBbox.min.z) / 2
        modelClone.position.x = -centerX
        modelClone.position.z = -centerZ
        
        modelClone.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })
        configureMeshShadows(modelClone)

        // Separate products by volume (< 2 liters)
        const smallMeshes: THREE.Mesh[] = []
        const meshTempBox = new THREE.Box3()
        const sizeVec = new THREE.Vector3()

        modelClone.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            if (mesh.geometry) {
              try {
                mesh.geometry.computeBoundingBox()
                if (mesh.geometry.boundingBox) {
                  meshTempBox.copy(mesh.geometry.boundingBox)
                  meshTempBox.getSize(sizeVec)
                  const volume = sizeVec.x * sizeVec.y * sizeVec.z
                  if (volume < 0.002) {
                    smallMeshes.push(mesh)
                  }
                }
              } catch {}
            }
          }
        })

        smallMeshes.forEach(mesh => {
          productsGroup.attach(mesh)
        })

        subGroup.add(modelClone)
      }

      // Match items to custom GLB 3D models added by the user
      let matchedModel: THREE.Group | null = null

      if (idUpper.includes('CATALOG-71') || idUpper.includes('CATALOG-72') || nameUpper.includes('CESTAO') || nameUpper.includes('CESTÃO')) {
        matchedModel = cestaoModelRef.current
      } else if (idUpper.includes('CATALOG-101') || idUpper.includes('CATALOG-102') || nameUpper.includes('CONTROLADO') || nameUpper.includes('CTRL')) {
        matchedModel = controladoModelRef.current
      } else if (idUpper.includes('CATALOG-91') || idUpper.includes('CATALOG-92') || nameUpper.includes('DERMO')) {
        matchedModel = dermoModelRef.current
      } else if (idUpper.includes('CATALOG-111') || nameUpper.includes('ESMALTE') || nameUpper.includes('ESMALTES')) {
        matchedModel = esmalteModelRef.current
      } else if (idUpper.includes('CATALOG-14-') || nameUpper.includes('CANALETADO') || nameUpper.includes('CANAL')) {
        matchedModel = canaletadoModelRef.current
      } else if (nameUpper.includes('FILA') || nameUpper.includes('FILA INTELIGENTE') || nameUpper.includes('FILA_INTELIGENTE')) {
        matchedModel = filaModelRef.current
      } else if (nameUpper.includes('MED ') || nameUpper.includes('MED 807') || nameUpper.includes('MED 500') || nameUpper.includes('MED DUPLO') || nameUpper.includes('MEDICAMENTO') || (item.category === 'GONDOLAS' && nameUpper.includes('MED'))) {
        matchedModel = medicamentoModelRef.current
      } else if (item.category === 'PERFUMARIA') {
        matchedModel = perfumariaModelRef.current
      } else if (item.category === 'GONDOLAS' && (nameUpper.includes('GOND') || nameUpper.includes('GÔNDOLA') || nameUpper.includes('GONDOLA'))) {
        matchedModel = gondolabrancaModelRef.current
      }

      const isCestao = idUpper.includes('CATALOG-71') || idUpper.includes('CATALOG-72') || nameUpper.includes('CESTAO') || nameUpper.includes('CESTÃO')

      if (matchedModel) {
        try {
          applyModelToSubGroup(matchedModel)
        } catch (e) {
          console.error(`⚠️ [3D Viewer] Erro ao clonar/renderizar modelo 3D para ${item.name}:`, e)
        }
      } else if (isCestao) {
        const basketGeo = new THREE.CylinderGeometry(itemW / 2, itemW / 2, itemH, 12, 1, true)
        const basketMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.2, metalness: 0.8, side: THREE.DoubleSide, wireframe: true })
        const basketMesh = new THREE.Mesh(basketGeo, basketMat)
        basketMesh.position.y = itemH / 2
        basketMesh.castShadow = true
        subGroup.add(basketMesh)
      } else {
        const itemColor = new THREE.Color(0x4b5563)
        try {
          if (item.fillColor) {
            itemColor.set(item.fillColor)
          }
        } catch {}

        if (item.isPillar) {
          const pillarGeo = new THREE.BoxGeometry(itemW, 3.0, itemD)
          const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 })
          const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat)
          pillarMesh.position.y = 1.5
          pillarMesh.castShadow = true
          pillarMesh.receiveShadow = true
          subGroup.add(pillarMesh)
        } 
        else if (item.isObstacle) {
          const wallThickness = 0.15
          const wallColor = 0xbababa
          const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8 })

          if (itemW > wallThickness && itemD > wallThickness) {
            // Parede Fundo (Back)
            const backGeo = new THREE.BoxGeometry(itemW, itemH, wallThickness)
            const backMesh = new THREE.Mesh(backGeo, wallMat)
            backMesh.position.set(0, itemH / 2, -itemD / 2 + wallThickness / 2)
            backMesh.castShadow = true
            backMesh.receiveShadow = true
            subGroup.add(backMesh)

            // Parede Frente (Front)
            const frontGeo = new THREE.BoxGeometry(itemW, itemH, wallThickness)
            const frontMesh = new THREE.Mesh(frontGeo, wallMat)
            frontMesh.position.set(0, itemH / 2, itemD / 2 - wallThickness / 2)
            frontMesh.castShadow = true
            frontMesh.receiveShadow = true
            subGroup.add(frontMesh)

            // Parede Esquerda (Left)
            const leftGeo = new THREE.BoxGeometry(wallThickness, itemH, Math.max(0.01, itemD - 2 * wallThickness))
            const leftMesh = new THREE.Mesh(leftGeo, wallMat)
            leftMesh.position.set(-itemW / 2 + wallThickness / 2, itemH / 2, 0)
            leftMesh.castShadow = true
            leftMesh.receiveShadow = true
            subGroup.add(leftMesh)

            // Parede Direita (Right)
            const rightGeo = new THREE.BoxGeometry(wallThickness, itemH, Math.max(0.01, itemD - 2 * wallThickness))
            const rightMesh = new THREE.Mesh(rightGeo, wallMat)
            rightMesh.position.set(itemW / 2 - wallThickness / 2, itemH / 2, 0)
            rightMesh.castShadow = true
            rightMesh.receiveShadow = true
            subGroup.add(rightMesh)
          } else {
            // Fallback para divisórias muito finas: renderiza uma parede sólida única
            const solidGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
            const solidMesh = new THREE.Mesh(solidGeo, wallMat)
            solidMesh.position.y = itemH / 2
            solidMesh.castShadow = true
            solidMesh.receiveShadow = true
            subGroup.add(solidMesh)
          }
        }
        else if (item.category === 'PERFUMARIA') {
          // Vitrine de exposição: estrutura branca (MDP TX) + prateleiras de vidro + frente de vidro + produtos iluminados.
          // Antes a perfumaria reutilizava a gôndola de fundo cinza-escuro, o que enfileirado parecia "parede de concreto".
          const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.4, metalness: 0.0 })
          const glassShelfMat = new THREE.MeshStandardMaterial({ color: 0xd5effb, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.5, envMapIntensity: 1.2 })
          const frontGlassMat = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.4, envMapIntensity: 1.3 })

          const backDepth = 0.02
          const sidePost = 0.03

          // Painel de fundo (claro)
          const backGeo = new THREE.BoxGeometry(itemW, itemH, backDepth)
          const backMesh = new THREE.Mesh(backGeo, frameMat)
          backMesh.position.set(0, itemH / 2, -itemD / 2 + backDepth / 2)
          backMesh.castShadow = true
          backMesh.receiveShadow = true
          subGroup.add(backMesh)

          // Montantes laterais
          const postGeo = new THREE.BoxGeometry(sidePost, itemH, itemD)
          const leftPost = new THREE.Mesh(postGeo, frameMat)
          leftPost.position.set(-itemW / 2 + sidePost / 2, itemH / 2, 0)
          leftPost.castShadow = true
          subGroup.add(leftPost)
          const rightPost = new THREE.Mesh(postGeo, frameMat)
          rightPost.position.set(itemW / 2 - sidePost / 2, itemH / 2, 0)
          rightPost.castShadow = true
          subGroup.add(rightPost)

          // Rodapé e testeira superior
          const plinthGeo = new THREE.BoxGeometry(itemW, 0.075, itemD)
          const plinthMesh = new THREE.Mesh(plinthGeo, frameMat)
          plinthMesh.position.set(0, 0.0375, 0)
          plinthMesh.castShadow = true
          plinthMesh.receiveShadow = true
          subGroup.add(plinthMesh)

          const headerH = 0.3
          const headerGeo = new THREE.BoxGeometry(itemW, headerH, itemD)
          const headerMesh = new THREE.Mesh(headerGeo, frameMat)
          headerMesh.position.set(0, itemH - headerH / 2, 0)
          headerMesh.castShadow = true
          subGroup.add(headerMesh)

          // Faixa de marca (cor do item) na frente da testeira
          const accentColor = new THREE.Color(item.color || 0xdb2777)
          const accentGeo = new THREE.BoxGeometry(itemW, 0.05, 0.012)
          const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, emissive: accentColor, emissiveIntensity: 0.25 })
          const accentMesh = new THREE.Mesh(accentGeo, accentMat)
          accentMesh.position.set(0, itemH - headerH + 0.02, itemD / 2 - 0.005)
          subGroup.add(accentMesh)

          // Fita de LED quente sob a testeira (ilumina os produtos)
          const ledGeo = new THREE.BoxGeometry(Math.max(0.01, itemW - 0.08), 0.02, 0.02)
          const ledMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
          const ledMesh = new THREE.Mesh(ledGeo, ledMat)
          ledMesh.position.set(0, itemH - headerH - 0.015, itemD / 2 - 0.05)
          subGroup.add(ledMesh)

          // Prateleiras de vidro + produtos
          const innerBottom = 0.12
          const innerTop = itemH - headerH - 0.05
          const shelfLevels = 5
          const shelfW = Math.max(0.01, itemW - 2 * sidePost - 0.01)
          const shelfD = Math.max(0.01, itemD - 0.03)
          for (let i = 0; i < shelfLevels; i++) {
            const sy = innerBottom + (innerTop - innerBottom) * (i / (shelfLevels - 1))
            const shelfGeo = new THREE.BoxGeometry(shelfW, 0.015, shelfD)
            const shelfMesh = new THREE.Mesh(shelfGeo, glassShelfMat)
            shelfMesh.position.set(0, sy, 0)
            subGroup.add(shelfMesh)
            addProductMeshes(productsGroup, shelfW, sy + 0.0075, 0)
          }

          // Vidro frontal
          const paneW = Math.max(0.01, itemW - 2 * sidePost)
          const paneH = Math.max(0.01, innerTop - innerBottom + 0.12)
          const paneGeo = new THREE.BoxGeometry(paneW, paneH, 0.01)
          const paneMesh = new THREE.Mesh(paneGeo, frontGlassMat)
          paneMesh.position.set(0, (innerBottom + innerTop) / 2 + 0.03, itemD / 2 - 0.012)
          subGroup.add(paneMesh)
        }
        else if (item.category === 'GONDOLAS') {
          const backGeo = new THREE.BoxGeometry(itemW, itemH, 0.08)
          const backMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.6 })
          const backMesh = new THREE.Mesh(backGeo, backMat)
          backMesh.position.y = itemH / 2
          backMesh.castShadow = true
          backMesh.receiveShadow = true
          subGroup.add(backMesh)

          const shelfColor = itemColor.clone().multiplyScalar(0.9)
          const shelfMat = new THREE.MeshStandardMaterial({ color: shelfColor, roughness: 0.5 })
          const shelfLevels = 4
          for (let i = 1; i <= shelfLevels; i++) {
            const sy = (itemH / (shelfLevels + 1)) * i

            // Front shelf - clamped to prevent negative sizes (WebGL crash)
            const shelfWClamped = Math.max(0.01, itemW - 0.05)
            const shelfFGeo = new THREE.BoxGeometry(shelfWClamped, 0.03, 0.25)
            const shelfFMesh = new THREE.Mesh(shelfFGeo, shelfMat)
            shelfFMesh.position.set(0, sy, 0.15)
            shelfFMesh.castShadow = true
            subGroup.add(shelfFMesh)

            addProductMeshes(productsGroup, itemW, sy, 0.15)

            // Back shelf - clamped to prevent negative sizes (WebGL crash)
            const shelfBGeo = new THREE.BoxGeometry(shelfWClamped, 0.03, 0.25)
            const shelfBMesh = new THREE.Mesh(shelfBGeo, shelfMat)
            shelfBMesh.position.set(0, sy, -0.15)
            shelfBMesh.castShadow = true
            subGroup.add(shelfBMesh)

            addProductMeshes(productsGroup, itemW, sy, -0.15)
          }
        }
        else if (item.category === 'BALCOES') {
          if (isLCheckout) {
            const tTop = 0.40
            const tBase = 0.38

            const baseH = Math.max(0.01, itemH - 0.05)
            const baseMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.6 })

            // Base Leg 1 (Horizontal)
            const baseW1 = Math.max(0.01, itemW - 0.02)
            const baseL1Geo = new THREE.BoxGeometry(baseW1, baseH, tBase)
            const baseL1Mesh = new THREE.Mesh(baseL1Geo, baseMat)
            baseL1Mesh.position.set(0, baseH / 2, 0.20 - itemD / 2)
            baseL1Mesh.castShadow = true
            baseL1Mesh.receiveShadow = true
            subGroup.add(baseL1Mesh)

            // Base Leg 2 (Vertical)
            const baseD2 = Math.max(0.01, itemD - 0.39)
            const baseL2Geo = new THREE.BoxGeometry(tBase, baseH, baseD2)
            const baseL2Mesh = new THREE.Mesh(baseL2Geo, baseMat)
            baseL2Mesh.position.set(0.20 - itemW / 2, baseH / 2, 0.38 + baseD2 / 2 - itemD / 2)
            baseL2Mesh.castShadow = true
            baseL2Mesh.receiveShadow = true
            subGroup.add(baseL2Mesh)

            // 2. Countertop (Top)
            const topMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })

            // Top Leg 1 (Horizontal)
            const topL1Geo = new THREE.BoxGeometry(itemW, 0.05, tTop)
            const topL1Mesh = new THREE.Mesh(topL1Geo, topMat)
            topL1Mesh.position.set(0, itemH - 0.025, 0.20 - itemD / 2)
            topL1Mesh.castShadow = true
            topL1Mesh.receiveShadow = true
            subGroup.add(topL1Mesh)

            // Top Leg 2 (Vertical)
            const topD2 = Math.max(0.01, itemD - tTop)
            const topL2Geo = new THREE.BoxGeometry(tTop, 0.05, topD2)
            const topL2Mesh = new THREE.Mesh(topL2Geo, topMat)
            topL2Mesh.position.set(0.20 - itemW / 2, itemH - 0.025, tTop + topD2 / 2 - itemD / 2)
            topL2Mesh.castShadow = true
            topL2Mesh.receiveShadow = true
            subGroup.add(topL2Mesh)

            // 3. Products
            const bottleCount = Math.floor(itemW / 0.35)
            for (let b = 0; b < bottleCount; b++) {
              const bx = -itemW / 2 + 0.18 + b * 0.35 + (Math.random() - 0.5) * 0.05
              const bGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6)
              const bMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, transparent: true, opacity: 0.75 })
              const bMesh = new THREE.Mesh(bGeo, bMat)
              bMesh.position.set(bx, itemH + 0.035, 0.20 - itemD / 2 + (Math.random() - 0.5) * 0.2)
              productsGroup.add(bMesh)
            }
          } else {
            const baseW = Math.max(0.01, itemW - 0.02)
            const baseH = Math.max(0.01, itemH - 0.05)
            const baseD = Math.max(0.01, itemD - 0.02)
            
            const baseGeo = new THREE.BoxGeometry(baseW, baseH, baseD)
            const baseMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.6 })
            const baseMesh = new THREE.Mesh(baseGeo, baseMat)
            baseMesh.position.y = (itemH - 0.05) / 2
            baseMesh.castShadow = true
            subGroup.add(baseMesh)

            const topGeo = new THREE.BoxGeometry(itemW, 0.05, itemD)
            const topMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })
            const topMesh = new THREE.Mesh(topGeo, topMat)
            topMesh.position.y = itemH - 0.025
            topMesh.castShadow = true
            subGroup.add(topMesh)
            
            const bottleCount = Math.floor(itemW / 0.35)
            for (let b = 0; b < bottleCount; b++) {
              const bx = -itemW / 2 + 0.18 + b * 0.35 + (Math.random() - 0.5) * 0.05
              const bGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6)
              const bMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, transparent: true, opacity: 0.75 })
              const bMesh = new THREE.Mesh(bGeo, bMat)
              bMesh.position.set(bx, itemH + 0.035, (Math.random() - 0.5) * (itemD - 0.1))
              productsGroup.add(bMesh)
            }
          }
        }
        else if (item.category === 'REFRIGERACAO') {
          const cabGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
          const cabMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3 })
          const cabMesh = new THREE.Mesh(cabGeo, cabMat)
          cabMesh.position.y = itemH / 2
          cabMesh.castShadow = true
          subGroup.add(cabMesh)

          const fridgeShelfLevels = 3
          const wireW = Math.max(0.01, itemW - 0.06)
          const wireD = Math.max(0.01, itemD - 0.06)
          for (let i = 1; i <= fridgeShelfLevels; i++) {
            const sy = (itemH / (fridgeShelfLevels + 1)) * i
            const wireGeo = new THREE.BoxGeometry(wireW, 0.01, wireD)
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.2 })
            const wireMesh = new THREE.Mesh(wireGeo, wireMat)
            wireMesh.position.set(0, sy, 0)
            subGroup.add(wireMesh)
            
            const drinkColors = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b]
            const drinkCount = Math.floor((itemW - 0.1) / 0.08)
            for (let d = 0; d < drinkCount; d++) {
              const dx = -(itemW - 0.06) / 2 + 0.04 + d * 0.08
              const drinkGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.08, 6)
              const drinkMat = new THREE.MeshStandardMaterial({ 
                color: drinkColors[Math.floor(Math.random() * drinkColors.length)], 
                roughness: 0.1,
                metalness: 0.8
              })
              const drinkMesh = new THREE.Mesh(drinkGeo, drinkMat)
              drinkMesh.position.set(dx, sy + 0.04, 0)
              productsGroup.add(drinkMesh)
            }
          }

          const glassW = Math.max(0.01, itemW - 0.05)
          const glassH = Math.max(0.01, itemH - 0.1)
          const glassGeo = new THREE.BoxGeometry(glassW, glassH, 0.02)
          const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0x67e8f9, 
            transparent: true, 
            opacity: 0.45,
            roughness: 0.1,
            metalness: 0.9,
            emissive: 0x0891b2,
            emissiveIntensity: 0.3
          })
          const glassMesh = new THREE.Mesh(glassGeo, glassMat)
          glassMesh.position.set(0, itemH / 2, itemD / 2 - 0.01)
          subGroup.add(glassMesh)
        }
        else if (item.category === 'OPERACIONAL') {
          const baseGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
          const baseMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.6 })
          const baseMesh = new THREE.Mesh(baseGeo, baseMat)
          baseMesh.position.y = itemH / 2
          baseMesh.castShadow = true
          subGroup.add(baseMesh)

          const monGroup = new THREE.Group()
          monGroup.position.set(0, itemH, 0)
          
          const standGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8)
          const standMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })
          const standMesh = new THREE.Mesh(standGeo, standMat)
          standMesh.position.y = 0.06
          monGroup.add(standMesh)
          
          const scrGeo = new THREE.BoxGeometry(0.24, 0.18, 0.02)
          const scrMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 })
          const scrMesh = new THREE.Mesh(scrGeo, scrMat)
          scrMesh.position.set(0, 0.15, 0)
          scrMesh.rotation.x = -0.15
          monGroup.add(scrMesh)
          
          const faceGeo = new THREE.BoxGeometry(0.22, 0.16, 0.002)
          const faceMesh = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ color: 0x10b981 }))
          faceMesh.position.set(0, 0.15, 0.011)
          faceMesh.rotation.x = -0.15
          monGroup.add(faceMesh)

          const kbGeo = new THREE.BoxGeometry(0.22, 0.01, 0.08)
          const kbMesh = new THREE.Mesh(kbGeo, new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }))
          kbMesh.position.set(0, 0.005, 0.08)
          monGroup.add(kbMesh)

          subGroup.add(monGroup)
        }
        else {
          const boxGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
          const boxMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.5 })
          const boxMesh = new THREE.Mesh(boxGeo, boxMat)
          boxMesh.position.y = itemH / 2
          boxMesh.castShadow = true
          boxMesh.receiveShadow = true
          subGroup.add(boxMesh)
        }
      }

      // Add a fake contact shadow under the furniture item (if not a pillar)
      if (!item.isPillar) {
        const shadowGeo = new THREE.PlaneGeometry(itemW * 1.1, itemD * 1.1)
        const shadowMat = new THREE.MeshBasicMaterial({
          map: getContactShadowTexture(),
          transparent: true,
          opacity: 0.5, // softer so it complements (not doubles) the real sun shadow when enabled
          blending: THREE.MultiplyBlending,
          depthWrite: false
        })
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat)
        shadowMesh.rotation.x = -Math.PI / 2
        // Positioned slightly above floor to prevent z-fighting
        shadowMesh.position.set(0, 0.004, 0)
        subGroup.add(shadowMesh)
      }

      subGroup.position.set(itemW / 2, 0, itemD / 2)
      itemGroup.add(subGroup)
      furnitureGroup.add(itemGroup)
      
      newFurnitureMeshes.push({
        box: new THREE.Box3().setFromObject(itemGroup),
        isObstacle: isSolidCollidable(item)
      })

      // Add to LOD list if it contains products
      if (productsGroup.children.length > 0) {
        const angle = -(Number(item.rotation) || 0) * Math.PI / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const cx = (itemW / 2) * cos - (itemD / 2) * sin
        const cz = (itemW / 2) * sin + (itemD / 2) * cos
        const worldPos = new THREE.Vector3(thX + cx, 0, thZ + cz)

        lodObjectsRef.current.push({
          group: productsGroup,
          worldPos
        })
      }
    })

    furnitureMeshesRef.current = newFurnitureMeshes
    
    // Simulação 3D de fluxo
    if (simulationGroupRef.current) {
      sceneRef.current?.remove(simulationGroupRef.current)
      simulationGroupRef.current = null
    }

    if (showSimulation) {
      const simGroup = new THREE.Group()
      simulationGroupRef.current = simGroup
      if (sceneRef.current) sceneRef.current.add(simGroup)

      const customers = generateCustomersSimulation(items, Number(storeWidth), Number(storeHeight), 15)
      
      simulationDataRef.current = customers.map(cust => {
        const mat = new THREE.MeshStandardMaterial({ color: cust.color, roughness: 0.5 })
        const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.6, 16)
        const headGeo = new THREE.SphereGeometry(0.15, 16, 16)
        
        const bodyMesh = new THREE.Mesh(bodyGeo, mat)
        bodyMesh.position.y = 0.3
        bodyMesh.castShadow = true
        bodyMesh.receiveShadow = true

        const headMesh = new THREE.Mesh(headGeo, mat)
        headMesh.position.y = 0.75
        headMesh.castShadow = true
        headMesh.receiveShadow = true

        const custGroup = new THREE.Group()
        custGroup.add(bodyMesh)
        custGroup.add(headMesh)
        
        const startPt = cust.path[0]
        custGroup.position.set(startPt.x - Number(storeWidth) / 2, 0, startPt.y - Number(storeHeight) / 2)
        simGroup.add(custGroup)

        return {
          data: cust,
          mesh: custGroup,
          pathIndex: 0,
          waitTimer: 0,
          active: true
        }
      })
    } else {
      simulationDataRef.current = []
    }

    if (rendererRef.current) {
      rendererRef.current.shadowMap.needsUpdate = true
    }
  }, [items, storeWidth, storeHeight, loadedModelsCount, showSimulation])

  // --- Effect 4: Atualização de Customizações (floorStyle, wallColor, showSignage) ---
  useEffect(() => {
    if (!initializedRef.current) return

    if (floorMeshRef.current) {
      const config = FLOOR_STYLES[floorStyle as keyof typeof FLOOR_STYLES] || FLOOR_STYLES.grid
      const mat = floorMeshRef.current.material as THREE.MeshStandardMaterial
      if (mat) {
        mat.color.setHex(config.color)
        mat.roughness = config.roughness
        mat.metalness = config.metalness
        mat.needsUpdate = true
      }
    }

    if (floorGridRef.current) {
      const config = FLOOR_STYLES[floorStyle as keyof typeof FLOOR_STYLES] || FLOOR_STYLES.grid
      floorGridRef.current.visible = config.showGrid !== false
      const mat = floorGridRef.current.material as THREE.LineBasicMaterial
      if (config.showGrid && config.gridColor && mat && mat.color) {
        mat.color.setHex(config.gridColor)
      }
    }

    wallsRef.current.forEach(wall => {
      if (wall) {
        const mat = wall.material as THREE.MeshStandardMaterial
        if (mat) {
          mat.color.setHex(WALL_COLORS[wallColor as keyof typeof WALL_COLORS] || WALL_COLORS.mint)
          mat.needsUpdate = true
        }
      }
    })

    if (signageGroupRef.current) {
      signageGroupRef.current.visible = showSignage
    }
  }, [floorStyle, wallColor, showSignage])

  // --- Effect: Update shadowMap state ---
  useEffect(() => {
    const ren = rendererRef.current
    const dirLight = directionalLightRef.current
    if (dirLight) {
      dirLight.castShadow = shadowsEnabled
    }
    if (ren) {
      ren.shadowMap.enabled = shadowsEnabled
      ren.shadowMap.needsUpdate = true
      sceneRef.current?.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material
          if (mat) {
            if (Array.isArray(mat)) mat.forEach(m => { if (m) m.needsUpdate = true; })
            else mat.needsUpdate = true
          }
        }
      })
    }
  }, [shadowsEnabled])

  const handleLockClick = () => {
    setShowIntro(false)
    const canvas = canvasRef.current
    if (canvas) {
      try {
        canvas.focus()
      } catch (e) {
        console.warn("Erro ao focar canvas:", e)
      }
    }
    if (canvas && typeof canvas.requestPointerLock === 'function') {
      try {
        const result = canvas.requestPointerLock()
        if (result && typeof result.catch === 'function') {
          result.catch((err: any) => {
            console.warn("Pointer lock recusado:", err)
          })
        }
      } catch (err) {
        console.warn("Pointer lock recusado:", err)
      }
    }
  }

  const stopTourAndGoFree = () => {
    if (tourActiveRef.current) {
      setTourActive(false)
      tourActiveRef.current = false
      tourHoldStartRef.current = null
      setCameraMode('first-person')
      cameraModeRef.current = 'first-person'
    }
  }

  const handleDpadStart = (dir: string) => {
    stopTourAndGoFree()
    dpadKeysRef.current[dir] = true
  }
  const handleDpadStop = (dir: string) => {
    dpadKeysRef.current[dir] = false
  }

  const triggerTourScene = (index: number) => {
    const cam = cameraRef.current
    if (!cam) return

    setActivePreset(null)
    tourIndexRef.current = index
    setTourIndex(index)
    tourTransitioningRef.current = true
    tourHoldStartRef.current = null

    let targetMode: 'orbit' | 'first-person' = 'orbit'
    const endPos = new THREE.Vector3()
    const endTarget = new THREE.Vector3(0, 0.5, 0)
    let endYaw = 0
    let endPitch = 0

    const { storeWidth: currentWidth, storeHeight: currentHeight } = useCanvasStore.getState()
    const wVal = Math.max(3, Number(currentWidth) || 10)
    const hVal = Math.max(3, Number(currentHeight) || 12)

    // Find Door and Counter
    const doorItem = items.find(i => i.isDoor && !i.isEmergency)
    const doorX = doorItem ? (doorItem.x + doorItem.width / 2 - wVal / 2) : 0
    const doorZ = doorItem ? (doorItem.y + doorItem.height / 2 - hVal / 2) : (hVal / 2)

    const counterItem = items.find(i => i.category === 'BALCOES' || i.name?.toLowerCase().includes('balcão') || i.name?.toLowerCase().includes('atendimento'))
    const counterX = counterItem ? (counterItem.x + counterItem.width / 2 - wVal / 2) : 0
    const counterZ = counterItem ? (counterItem.y + counterItem.height / 2 - hVal / 2) : (-hVal / 4)

    const gondolaItem = items.find(i => i.category === 'GONDOLAS')
    const perfItem = items.find(i =>
      i.category === 'PERFUMARIA' ||
      i.itemId?.includes('catalog-15') || i.itemId?.includes('catalog-16') || i.itemId?.includes('catalog-92') ||
      i.label?.toLowerCase().includes('vitrine')
    )

    // Stand ~1.4m in front of an item (offset toward store center) and look straight at it.
    // Falls back to fixed coordinates when no such item exists (empty/default layout).
    const aimAtItem = (it: any, fbX: number, fbZ: number, fbYaw: number) => {
      if (!it) { endPos.set(fbX, 1.6, fbZ); endYaw = fbYaw; return }
      const ix = it.x + it.width / 2 - wVal / 2
      const iz = it.y + it.height / 2 - hVal / 2
      const len = Math.hypot(ix, iz) || 1
      const stand = 1.4
      let cx = ix + (-ix / len) * stand
      let cz = iz + (-iz / len) * stand
      cx = Math.max(-wVal / 2 + 0.6, Math.min(cx, wVal / 2 - 0.6))
      cz = Math.max(-hVal / 2 + 0.6, Math.min(cz, hVal / 2 - 0.6))
      endPos.set(cx, 1.6, cz)
      endYaw = Math.atan2(cx - ix, cz - iz)
    }

    switch (index) {
      case 0: // Fachada Principal
        targetMode = 'orbit'
        endPos.set(0, 2.2, hVal / 2 + 5.5)
        endTarget.set(0, 1.2, hVal / 2)
        break
      case 1: // Entrada da Loja
        targetMode = 'first-person'
        endPos.set(doorX, 1.6, hVal / 2 - 0.6)
        endYaw = 0 // facing inside (-Z)
        endPitch = -0.05
        break
      case 2: // Corredor Central (Gôndolas)
        targetMode = 'first-person'
        // Positioned along the main corridor path, looking forward and slightly angled
        endPos.set(doorX, 1.6, hVal * 0.2)
        endYaw = 0.15
        endPitch = -0.08
        break
      case 3: // Balcão de Medicamentos
        targetMode = 'first-person'
        endPos.set(counterX, 1.6, Math.max(-hVal / 2 + 0.6, Math.min(counterZ - 1.2, hVal / 2 - 0.6)))
        endYaw = Math.PI // facing towards entrance (+Z)
        endPitch = -0.05
        break
      case 4: // Perfumaria e Cosméticos
        targetMode = 'first-person'
        aimAtItem(perfItem, -wVal * 0.3, -hVal * 0.1, -Math.PI / 4)
        endPitch = -0.05
        break
      case 5: // Vista Panorâmica
        targetMode = 'orbit'
        const sizeFactor = Math.max(wVal, hVal)
        endPos.set(sizeFactor * 0.9, sizeFactor * 0.8, sizeFactor * 0.9)
        endTarget.set(0, 0.5, 0)
        break
      case 6: // Planta Baixa Aérea
        targetMode = 'orbit'
        const sizeAerial = Math.max(wVal, hVal)
        endPos.set(0, sizeAerial * 1.3, 0.001)
        endTarget.set(0, 0, 0)
        break
    }

    const startPos = cam.position.clone()
    const startTarget = orbitTargetRef.current.clone()
    
    let startYaw = yawRef.current
    let startPitch = pitchRef.current
    if (cameraModeRef.current === 'orbit') {
      const dir = new THREE.Vector3()
      cam.getWorldDirection(dir)
      startYaw = Math.atan2(dir.x, dir.z)
      startPitch = Math.asin(dir.y)
    }

    transitionRef.current = {
      startTime: performance.now(),
      duration: 1800, // smooth 1.8 seconds transition
      startPos,
      endPos,
      startTarget,
      endTarget,
      startYaw,
      endYaw,
      startPitch,
      endPitch,
      mode: targetMode
    }
  }

  const advanceTour = () => {
    const nextIndex = (tourIndexRef.current + 1) % TOUR_SCENES.length
    triggerTourScene(nextIndex)
  }

  const prevTourScene = () => {
    let prevIndex = tourIndexRef.current - 1
    if (prevIndex < 0) {
      prevIndex = TOUR_SCENES.length - 1
    }
    triggerTourScene(prevIndex)
  }

  const triggerPresetTransition = (presetName: 'entrada' | 'geral' | 'farmaceutico' | 'aereo') => {
    const cam = cameraRef.current
    if (!cam) return

    if (tourActiveRef.current) {
      setTourActive(false)
      tourActiveRef.current = false
      tourHoldStartRef.current = null
    }

    setActivePreset(presetName)

    let targetMode: 'orbit' | 'first-person' = 'orbit'
    const endPos = new THREE.Vector3()
    const endTarget = new THREE.Vector3(0, 0.5, 0)
    let endYaw = 0
    let endPitch = 0

    const { storeWidth: currentWidth, storeHeight: currentHeight } = useCanvasStore.getState()
    const wVal = Math.max(3, Number(currentWidth) || 10)
    const hVal = Math.max(3, Number(currentHeight) || 12)

    // Find Door and Counter
    const doorItem = items.find(i => i.isDoor && !i.isEmergency)
    const doorX = doorItem ? (doorItem.x + doorItem.width / 2 - wVal / 2) : 0
    const doorZ = doorItem ? (doorItem.y + doorItem.height / 2 - hVal / 2) : (hVal / 2)

    // Counter
    const counterItem = items.find(i => i.category === 'BALCOES' || i.name?.toLowerCase().includes('balcão') || i.name?.toLowerCase().includes('atendimento'))
    const counterX = counterItem ? (counterItem.x + counterItem.width / 2 - wVal / 2) : 0
    const counterZ = counterItem ? (counterItem.y + counterItem.height / 2 - hVal / 2) : (-hVal / 4)

    switch (presetName) {
      case 'entrada':
        targetMode = 'first-person'
        endPos.set(doorX, 1.6, Math.max(-hVal / 2 + 0.5, Math.min(doorZ - 0.5, hVal / 2 - 0.5)))
        endYaw = 0 // facing inside (-Z)
        endPitch = -0.05
        break
      case 'geral':
        targetMode = 'orbit'
        const sizeFactor = Math.max(wVal, hVal)
        endPos.set(sizeFactor * 0.8, sizeFactor * 0.7, sizeFactor * 0.8)
        endTarget.set(0, 0.5, 0)
        break
      case 'farmaceutico':
        targetMode = 'first-person'
        endPos.set(counterX, 1.6, Math.max(-hVal / 2 + 0.3, Math.min(counterZ - 0.6, hVal / 2 - 0.3)))
        endYaw = Math.PI // facing entrance (+Z)
        endPitch = -0.05
        break
      case 'aereo':
        targetMode = 'orbit'
        const sizeAerial = Math.max(wVal, hVal)
        endPos.set(0, sizeAerial * 1.25, 0.001)
        endTarget.set(0, 0, 0)
        break
    }

    const startPos = cam.position.clone()
    const startTarget = orbitTargetRef.current.clone()
    
    let startYaw = yawRef.current
    let startPitch = pitchRef.current
    if (cameraModeRef.current === 'orbit') {
      const dir = new THREE.Vector3()
      cam.getWorldDirection(dir)
      startYaw = Math.atan2(dir.x, dir.z)
      startPitch = Math.asin(dir.y)
    }

    transitionRef.current = {
      startTime: performance.now(),
      duration: 800,
      startPos,
      endPos,
      startTarget,
      endTarget,
      startYaw,
      endYaw,
      startPitch,
      endPitch,
      mode: targetMode
    }

    if (document.pointerLockElement) {
      try {
        document.exitPointerLock()
      } catch {}
    }
  }

  return (
    <div className={`three-overlay ${showCustomizer ? 'customizer-open' : ''}`}>
      {errorMsg && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          right: '20px',
          background: 'rgba(239, 68, 68, 0.95)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 99999,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          pointerEvents: 'auto'
        }}>
          <h3>⚠️ Erro no Modo 3D</h3>
          <p>{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="btn btn-secondary btn-sm" style={{ marginTop: '10px' }}>Fechar Alerta</button>
        </div>
      )}
      <div className="three-container" ref={containerRef} />


      
      {/* ─── UI CONTROLS / OVERLAY ─── */}
      <div className="three-hud">
        <div className={`hud-header ${mobileMenuOpen ? 'menu-open' : ''}`}>
          <div className="hud-title">
            Visualização 3D
          </div>
          
          <button 
            className="hud-burger-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          <div className={`hud-header-actions ${mobileMenuOpen ? 'mobile-visible' : ''}`}>
            <button 
              className={`btn btn-secondary btn-sm hud-toggle-customizer ${showCustomizer ? 'active' : ''}`}
              onClick={() => {
                setShowCustomizer(!showCustomizer)
                setMobileMenuOpen(false)
              }}
            >
              ⚙️ {showCustomizer ? (
                <>Fechar<span className="hide-mobile"> Ajustes</span></>
              ) : (
                <><span className="hide-mobile">Customizar projeto</span><span className="show-mobile-inline">Customizar projeto</span></>
              )}
            </button>

            <button 
              className={`btn btn-secondary btn-sm hud-free-mode ${(!tourActive && cameraMode === 'first-person') ? 'active' : ''}`}
              onClick={() => {
                setTourActive(false)
                tourActiveRef.current = false
                tourHoldStartRef.current = null
                setCameraMode('first-person')
                cameraModeRef.current = 'first-person'
                setMobileMenuOpen(false)
              }}
            >
              🚶‍♂️ Modo Livre
            </button>

            <button 
              className={`btn btn-secondary btn-sm hud-tour-mode ${tourActive ? 'active' : ''}`}
              onClick={() => {
                if (tourActive) {
                  setTourActive(false)
                  tourActiveRef.current = false
                  tourHoldStartRef.current = null
                } else {
                  setTourActive(true)
                  tourActiveRef.current = true
                  triggerTourScene(0)
                }
                setMobileMenuOpen(false)
              }}
            >
              🎬 Modo Tour
            </button>

            <button 
              className="btn btn-secondary btn-sm hud-close" 
              onClick={() => {
                onClose?.()
                setMobileMenuOpen(false)
              }}
            >
              ✏️ <span className="hide-mobile">Editar planta baixa</span><span className="show-mobile-inline">Editar planta baixa</span>
            </button>
          </div>
        </div>

        {/* ─── CUSTOMIZER SIDEBAR ─── */}
        {showCustomizer && (
          <div className="three-customizer pointer-events-auto">
            <div className="cust-title">Customizar Espaço</div>
          
          <div className="cust-section">
            <label className="cust-label">Piso (Textura & Cor)</label>
            <div className="cust-grid">
              <button className={`cust-btn ${floorStyle === 'grid' ? 'active' : ''}`} onClick={() => setFloorStyle('grid')}>
                Grid Midnight
              </button>
              <button className={`cust-btn ${floorStyle === 'marble' ? 'active' : ''}`} onClick={() => setFloorStyle('marble')}>
                Mármore Branco
              </button>
              <button className={`cust-btn ${floorStyle === 'wood' ? 'active' : ''}`} onClick={() => setFloorStyle('wood')}>
                Madeira Carvalho
              </button>
              <button className={`cust-btn ${floorStyle === 'concrete' ? 'active' : ''}`} onClick={() => setFloorStyle('concrete')}>
                Cimento Cru
              </button>
            </div>
          </div>

          <div className="cust-section">
            <label className="cust-label">Cor das Paredes</label>
            <div className="cust-grid">
              <button className={`cust-btn ${wallColor === 'mint' ? 'active' : ''}`} onClick={() => setWallColor('mint')}>
                Verde Mint
              </button>
              <button className={`cust-btn ${wallColor === 'white' ? 'active' : ''}`} onClick={() => setWallColor('white')}>
                Branco Clean
              </button>
              <button className={`cust-btn ${wallColor === 'gray' ? 'active' : ''}`} onClick={() => setWallColor('gray')}>
                Cinza Industrial
              </button>
              <button className={`cust-btn ${wallColor === 'blue' ? 'active' : ''}`} onClick={() => setWallColor('blue')}>
                Azul Royal
              </button>
            </div>
          </div>

          <div className="cust-section">
            <label className="cust-label">Nome da Farmácia (Fachada)</label>
            <input 
              type="text" 
              className="cust-input"
              value={pharmacyName}
              onChange={e => {
                const val = e.target.value
                setPharmacyName(val)
                setLayoutName(val)
              }} 
              style={{
                background: '#ffffff',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                color: 'black',
                padding: '6px 12px',
                borderRadius: '4px',
                width: '100%',
                fontSize: 'var(--fs-xs)',
                outline: 'none'
              }}
            />
          </div>
        </div>
        )}



        {/* ─── ON-SCREEN D-PAD CONTROLLER ─── */}
        <div className="three-dpad pointer-events-auto">
          <button 
            className="dpad-btn dpad-up" 
            onMouseDown={() => handleDpadStart('KeyW')} 
            onMouseUp={() => handleDpadStop('KeyW')}
            onMouseLeave={() => handleDpadStop('KeyW')}
            onTouchStart={(e) => { e.preventDefault(); handleDpadStart('KeyW'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleDpadStop('KeyW'); }}
          >▲</button>
          <button 
            className="dpad-btn dpad-left" 
            onMouseDown={() => handleDpadStart('KeyA')} 
            onMouseUp={() => handleDpadStop('KeyA')}
            onMouseLeave={() => handleDpadStop('KeyA')}
            onTouchStart={(e) => { e.preventDefault(); handleDpadStart('KeyA'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleDpadStop('KeyA'); }}
          >◀</button>
          <div className="dpad-center">Mover</div>
          <button 
            className="dpad-btn dpad-right" 
            onMouseDown={() => handleDpadStart('KeyD')} 
            onMouseUp={() => handleDpadStop('KeyD')}
            onMouseLeave={() => handleDpadStop('KeyD')}
            onTouchStart={(e) => { e.preventDefault(); handleDpadStart('KeyD'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleDpadStop('KeyD'); }}
          >▶</button>
          <button 
            className="dpad-btn dpad-down" 
            onMouseDown={() => handleDpadStart('KeyS')} 
            onMouseUp={() => handleDpadStop('KeyS')}
            onMouseLeave={() => handleDpadStop('KeyS')}
            onTouchStart={(e) => { e.preventDefault(); handleDpadStart('KeyS'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleDpadStop('KeyS'); }}
          >▼</button>
        </div>

        {!loading && showIntro && (
          <div className="three-lock-overlay" onClick={handleLockClick}>
            <div className="lock-card" onClick={e => e.stopPropagation()}>
              <svg className="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              <h3>Clique na tela para iniciar</h3>
              <p>
                {isTouch 
                  ? 'Arraste a tela para olhar ao redor e use os botões direcionais para se mover.'
                  : 'Mova o mouse ou arraste para olhar ao redor, e use as teclas W, A, S, D ou os botões para navegar.'
                }
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
                {isTouch ? (
                  <button className="btn btn-primary btn-md" onClick={() => setShowIntro(false)}>
                    Começar a Explorar
                  </button>
                ) : (
                  <>
                    <button className="btn btn-primary btn-md" onClick={handleLockClick}>
                      Entrar na Farmácia
                    </button>
                    <button className="btn btn-secondary btn-md" onClick={() => {
                      setShowIntro(false)
                      const canvas = canvasRef.current
                      if (canvas) {
                        try {
                          canvas.focus()
                        } catch (e) {
                          console.warn("Erro ao focar canvas:", e)
                        }
                      }
                    }}>
                      Explorar por Arrastar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {isLocked ? (
          <div className="hud-instructions">
            <span>🚶‍♂️ <strong>WASD / Setas</strong> para andar · <strong>Mova o mouse</strong> para olhar · Pressione <strong>ESC</strong> para liberar o cursor</span>
          </div>
        ) : (
          !showIntro && !loading && (
            <div className="hud-instructions">
              {isTouch ? (
                <span>🚶‍♂️ <strong>Botões direcionais</strong> para andar · <strong>Arraste a tela</strong> para olhar</span>
              ) : (
                <span>🚶‍♂️ <strong>WASD / Setas</strong> para andar · <strong>Arraste a tela</strong> para olhar · <span style={{ textDecoration: 'underline', cursor: 'pointer', color: 'var(--green-400)' }} onClick={handleLockClick}>Focar Cursor</span></span>
              )}
            </div>
          )
        )}
        {loading && (
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
                  <span className="loader-progress-text">
                    {requiredKeys.length > 0
                      ? `Carregando elementos (${loadedModelsCount} de ${requiredKeys.length})`
                      : 'Gerando estruturas e paredes...'}
                  </span>
                  <span className="loader-progress-percentage">
                    {requiredKeys.length > 0 
                      ? `${Math.round((loadedModelsCount / requiredKeys.length) * 100)}%`
                      : '100%'}
                  </span>
                </div>
                <div className="loader-progress-track">
                  <div 
                    className="loader-progress-fill" 
                    style={{ 
                      width: requiredKeys.length > 0 
                        ? `${(loadedModelsCount / requiredKeys.length) * 100}%` 
                        : '100%' 
                    }} 
                  />
                </div>
              </div>

              {/* Dicas / Tips Card */}
              <div className="loader-tip-card">
                <span className="loader-tip-tag">💡 DICA PROJEFARMA</span>
                <p className="loader-tip-text">
                  {requiredKeys.length > 0
                    ? "Após o carregamento, você poderá caminhar pela farmácia usando as teclas WASD e explorar cada detalhe do layout."
                    : "Nosso sistema calcula as áreas frias e quentes para garantir o melhor fluxo de clientes para a sua loja."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
