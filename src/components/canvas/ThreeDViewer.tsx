import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCanvasStore } from '../../store/canvasStore'
import './ThreeDViewer.css'

// Height estimations in meters based on item categories
const CATEGORY_HEIGHTS: Record<string, number> = {
  GONDOLAS: 1.6,
  BALCOES: 0.9,
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
  
  // Text
  ctx.fillStyle = textColor
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2)
  
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
    mesh.castShadow = true
    group.add(mesh)
  }
}

interface ThreeDViewerProps {
  onClose?: () => void
}

export default function ThreeDViewer({ onClose }: ThreeDViewerProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const furnitureGroupRef = useRef<THREE.Group | null>(null)
  const furnitureMeshesRef = useRef<{ box: THREE.Box3; isObstacle: boolean }[]>([])
  const keysRef = useRef<Record<string, boolean>>({})

  // refs para meshes dinâmicas
  const floorMeshRef = useRef<THREE.Mesh | null>(null)
  const floorGridRef = useRef<THREE.GridHelper | null>(null)
  const ceilingMeshRef = useRef<THREE.Mesh | null>(null)
  const wallsRef = useRef<THREE.Mesh[]>([])
  const signageGroupRef = useRef<THREE.Group | null>(null)

  // telemetry ref
  const debugTextRef = useRef<HTMLDivElement>(null)

  // flags de inicialização
  const [initialized, setInitialized] = useState(false)
  const initializedRef = useRef(false)

  const { storeWidth, storeHeight, items, storeType } = useCanvasStore()
  
  const [isLocked, setIsLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Customization & Physics States
  const [floorStyle, setFloorStyle] = useState('grid') 
  const [wallColor, setWallColor] = useState('mint') 
  const [showSignage, setShowSignage] = useState(true)
  const [noclip, setNoclip] = useState(false) // Toggle physics/collisions

  const noclipRef = useRef(noclip)
  useEffect(() => {
    noclipRef.current = noclip
  }, [noclip])

  // --- EFFECT 5: TEMATIZAÇÃO PADRÃO COM BASE NO STORETYPE ---
  useEffect(() => {
    if (storeType === 'premium') {
      setFloorStyle('marble')
      setWallColor('blue')
    } else if (storeType === 'manipulacao') {
      setFloorStyle('concrete')
      setWallColor('white')
    } else if (storeType === 'completa') {
      setFloorStyle('wood')
      setWallColor('gray')
    } else {
      setFloorStyle('grid')
      setWallColor('mint')
    }
  }, [storeType])

  // --- Global Browser Error Catching ---
  useEffect(() => {
    const IGNORED_ERRORS = ['pointerlockchange', 'pointerlock', 'WrongDocumentError', 'pointer lock']
    const isPointerLockError = (msg: string) =>
      IGNORED_ERRORS.some(k => msg?.toLowerCase().includes(k.toLowerCase()))

    const handleGlobalError = (event: ErrorEvent) => {
      const msg = event.error?.message ?? event.message ?? ''
      if (isPointerLockError(msg)) return
      console.error('Erro global capturado pelo 3D:', event.error || event.message)
      const err = event.error
      setErrorMsg('Erro global do navegador: ' + (err?.message || event.message) + '\nStack: ' + (err?.stack || 'Nenhuma stack trace disponível'))
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      console.warn('Promise rejeitada no 3D (normalmente Pointer Lock):', event.reason)
    }

    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // --- Effect 1: Setup (roda 1x na montagem) ---
  useEffect(() => {
    try {
      console.log("🎬 [3D Viewer] Effect 1 (Setup) iniciando...")
      if (!containerRef.current) {
        console.warn("⚠️ [3D Viewer] containerRef.current é nulo. Setup abortado.")
        return
      }

      let width = containerRef.current.clientWidth
      let height = containerRef.current.clientHeight
      
      if (width < 320 || height < 240) {
        width = window.innerWidth || 800
        height = window.innerHeight || 600
      }
      
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x040a06)
      scene.fog = new THREE.FogExp2(0x040a06, 0.05)
      sceneRef.current = scene

      // Camera
      const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
      camera.position.set(0, 1.6, 5)
      cameraRef.current = camera

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.domElement.tabIndex = 1
      renderer.domElement.style.outline = 'none'
      containerRef.current.appendChild(renderer.domElement)
      rendererRef.current = renderer
      canvasRef.current = renderer.domElement

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75)
      scene.add(ambientLight)

      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x333333, 0.45)
      hemisphereLight.position.set(0, 20, 0)
      scene.add(hemisphereLight)

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.75)
      directionalLight.position.set(0, 5, 0)
      directionalLight.castShadow = true
      directionalLight.shadow.mapSize.width = 1024
      directionalLight.shadow.mapSize.height = 1024
      directionalLight.shadow.bias = -0.001
      scene.add(directionalLight)

      // Chão Mesh (placeholder geometry, redimensionado no Effect 2)
      const floorGeo = new THREE.PlaneGeometry(1, 1)
      const floorMat = new THREE.MeshStandardMaterial({ 
        color: FLOOR_STYLES.grid.color, 
        roughness: FLOOR_STYLES.grid.roughness,
        metalness: FLOOR_STYLES.grid.metalness
      })
      const floor = new THREE.Mesh(floorGeo, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      floor.receiveShadow = true
      scene.add(floor)
      floorMeshRef.current = floor

      // Grid helper (placeholder size, atualizado no Effect 2)
      const gridHelper = new THREE.GridHelper(10, 10, 0x107c3f, 0x112b1c)
      gridHelper.position.y = 0.01
      scene.add(gridHelper)
      floorGridRef.current = gridHelper

      // Teto (placeholder geometry, redimensionado no Effect 2)
      const ceilingGeo = new THREE.PlaneGeometry(1, 1)
      const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0f1d15, roughness: 0.9 })
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

      const wFront = new THREE.Mesh(wallGeo, wallMat)
      wFront.receiveShadow = true
      scene.add(wFront)

      const wLeft = new THREE.Mesh(wallSideGeo, wallMat)
      wLeft.rotation.y = Math.PI / 2
      wLeft.receiveShadow = true
      scene.add(wLeft)

      const wRight = new THREE.Mesh(wallSideGeo, wallMat)
      wRight.rotation.y = -Math.PI / 2
      wRight.receiveShadow = true
      scene.add(wRight)

      wallsRef.current = [wBack, wFront, wLeft, wRight]

      // Sinalização inicial vazia (preenchida no Effect 2)
      const signageGroup = new THREE.Group()
      scene.add(signageGroup)
      signageGroupRef.current = signageGroup

      // Grupo de móveis
      const furnitureGroup = new THREE.Group()
      scene.add(furnitureGroup)
      furnitureGroupRef.current = furnitureGroup

      if (typeof window !== 'undefined') {
        (window as any).debugScene = scene;
        (window as any).debugFurnitureGroup = furnitureGroup;
        (window as any).debugCamera = camera;
      }

      // --- CONTROLES DE OLHAR E NAVEGAÇÃO ---
      let yaw = 0
      let isDragging = false
      let previousMouseX = 0

      const canvas = renderer.domElement

      const handleMouseMove = (e: MouseEvent) => {
        const cam = cameraRef.current
        if (!cam) return
        try {
          const movementX = e.movementX ?? 0
          if (document.pointerLockElement === canvas) {
            yaw -= movementX * 0.002
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            cam.rotation.set(0, 0, 0)
            cam.rotation.y = yaw
          } else if (isDragging) {
            const clientX = e.clientX ?? previousMouseX
            const deltaX = clientX - previousMouseX
            previousMouseX = clientX
            yaw -= deltaX * 0.003
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            cam.rotation.set(0, 0, 0)
            cam.rotation.y = yaw
          }
        } catch (err) {
          console.warn("Erro no mouse move:", err)
        }
      }

      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        const tagName = target?.tagName
        if (tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || target?.closest('.ios-toggle')) {
          return
        }
        if (e.button === 0) { // Click esquerdo
          isDragging = true
          previousMouseX = e.clientX ?? 0
          canvas.focus()
        }
      }

      const handleMouseUp = () => {
        isDragging = false
      }

      const handleTouchStart = (e: TouchEvent) => {
        const target = e.target as HTMLElement
        const tagName = target?.tagName
        if (tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || target?.closest('.three-dpad') || target?.closest('.ios-toggle')) {
          return
        }
        if (e.touches && e.touches.length === 1) {
          isDragging = true
          previousMouseX = e.touches[0].clientX ?? 0
          canvas.focus()
        }
      }

      const handleTouchMove = (e: TouchEvent) => {
        const cam = cameraRef.current
        if (!cam) return
        try {
          if (isDragging && e.touches && e.touches.length === 1) {
            const clientX = e.touches[0].clientX ?? previousMouseX
            const deltaX = clientX - previousMouseX
            previousMouseX = clientX
            yaw -= deltaX * 0.005
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            cam.rotation.set(0, 0, 0)
            cam.rotation.y = yaw
          }
        } catch (err) {
          console.warn("Erro no touch move:", err)
        }
      }

      const handleTouchEnd = () => {
        isDragging = false
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
        lockPointer()
      }

      canvas.addEventListener('click', handleCanvasClick)
      document.addEventListener('mousedown', handleMouseDown)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
      document.addEventListener('touchmove', handleTouchMove, { passive: true })
      document.addEventListener('touchend', handleTouchEnd)
      document.addEventListener('pointerlockchange', onPointerLockChange)

      // --- CONTROLES DE TECLADO ---
      const handleKeyDown = (e: KeyboardEvent) => { 
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

      canvas.addEventListener('keydown', handleKeyDown)
      canvas.addEventListener('keyup', handleKeyUp)

      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('keyup', handleKeyUp)

      // --- LOOP DE ANIMAÇÃO ---
      let lastTime = performance.now()
      const cameraDirection = new THREE.Vector3()
      const moveVector = new THREE.Vector3()
      const upVector = new THREE.Vector3(0, 1, 0)
      const rightVector = new THREE.Vector3()
      
      let animationFrameId = 0
      const moveSpeed = 3.0 

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

          cam.getWorldDirection(cameraDirection)
          cameraDirection.y = 0 
          
          if (isNaN(cameraDirection.x) || isNaN(cameraDirection.z) || cameraDirection.lengthSq() < 0.0001) {
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

          const frontVector = new THREE.Vector3()
          const sideVector = new THREE.Vector3()

          const keys = keysRef.current || {}
          if (keys['KeyW'] || keys['ArrowUp'] || keys['w'] || keys['arrowup'] || keys['z'] || keys['KeyZ']) frontVector.copy(cameraDirection)
          if (keys['KeyS'] || keys['ArrowDown'] || keys['s'] || keys['arrowdown']) frontVector.copy(cameraDirection).multiplyScalar(-1)
          if (keys['KeyD'] || keys['ArrowRight'] || keys['d'] || keys['arrowright']) sideVector.copy(rightVector)
          if (keys['KeyA'] || keys['ArrowLeft'] || keys['a'] || keys['arrowleft'] || keys['q'] || keys['KeyQ']) sideVector.copy(rightVector).multiplyScalar(-1)

          moveVector.addVectors(frontVector, sideVector)
          
          if (moveVector.lengthSq() > 0.0001) {
            moveVector.normalize().multiplyScalar(moveSpeed * deltaTime)
            
            let nextX = cam.position.x + moveVector.x
            let nextZ = cam.position.z + moveVector.z
            
            if (isNaN(nextX) || !isFinite(nextX)) nextX = cam.position.x
            if (isNaN(nextZ) || !isFinite(nextZ)) nextZ = cam.position.z

            const { storeWidth: currentWidth, storeHeight: currentHeight } = useCanvasStore.getState()
            const wVal = Math.max(4, Number(currentWidth) || 10)
            const hVal = Math.max(4, Number(currentHeight) || 12)

            const boundMargin = 0.4
            nextX = Math.max(-wVal / 2 + boundMargin, Math.min(nextX, wVal / 2 - boundMargin))
            nextZ = Math.max(-hVal / 2 + boundMargin, Math.min(nextZ, hVal / 2 - boundMargin))

            let collidedX = false
            if (!noclipRef.current && furnitureMeshesRef.current) {
              const nextCamBoxX = new THREE.Box3(
                new THREE.Vector3(nextX - 0.25, 0, cam.position.z - 0.25),
                new THREE.Vector3(nextX + 0.25, 2.0, cam.position.z + 0.25)
              )
              for (const fItem of furnitureMeshesRef.current) {
                if (fItem && fItem.isObstacle && fItem.box && nextCamBoxX.intersectsBox(fItem.box)) {
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
              const nextCamBoxZ = new THREE.Box3(
                new THREE.Vector3(cam.position.x - 0.25, 0, nextZ - 0.25),
                new THREE.Vector3(cam.position.x + 0.25, 2.0, nextZ + 0.25)
              )
              for (const fItem of furnitureMeshesRef.current) {
                if (fItem && fItem.isObstacle && fItem.box && nextCamBoxZ.intersectsBox(fItem.box)) {
                  collidedZ = true
                  break
                }
              }
            }
            if (!collidedZ) {
              cam.position.z = nextZ
            }
          }

          if (isNaN(cam.position.x) || !isFinite(cam.position.x)) cam.position.x = 0
          if (isNaN(cam.position.z) || !isFinite(cam.position.z)) {
            const { storeHeight: currentHeight } = useCanvasStore.getState()
            const hVal = Math.max(4, Number(currentHeight) || 12)
            cam.position.z = hVal / 2 - 1.2
          }

          // Telemetria do HUD
          if (debugTextRef.current) {
            const activeKeys = Object.keys(keysRef.current || {})
              .filter(k => keysRef.current[k])
              .map(k => k.replace('Key', ''))
              .join(', ') || 'Nenhuma'
            
            const currentItems = useCanvasStore.getState().items
            debugTextRef.current.innerText = `Pos: ${cam.position.x.toFixed(2)}, ${cam.position.z.toFixed(2)} | Dir: ${(cam.rotation.y * 180 / Math.PI).toFixed(0)}° | Móveis: ${currentItems.length} | Init: ${initializedRef.current ? 'Sim' : 'Não'} | Teclas: ${activeKeys}`
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
        ren.setSize(w, h)
      }
      window.addEventListener('resize', handleResize)

      // Conclusão do Setup (Bug 3)
      initializedRef.current = true
      setInitialized(true)
      setLoading(false)

      // --- CLEANUP ---
      return () => {
        cancelAnimationFrame(animationFrameId)
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
        
        if (canvas) {
          canvas.removeEventListener('keydown', handleKeyDown)
          canvas.removeEventListener('keyup', handleKeyUp)
          canvas.removeEventListener('click', handleCanvasClick)
          try {
            if (containerRef.current && containerRef.current.contains(canvas)) {
              containerRef.current.removeChild(canvas)
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

  // --- Effect 2: Atualização de Dimensões (Paredes, Piso, Teto, Spawn) ---
  useEffect(() => {
    if (!initializedRef.current) return
    console.log("📏 [3D Viewer] Effect 2 (Dimensões) atualizando para:", storeWidth, "x", storeHeight)

    const widthVal = Math.max(4, Number(storeWidth) || 10)
    const heightVal = Math.max(4, Number(storeHeight) || 12)

    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return

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
      const newGrid = new THREE.GridHelper(
        Math.max(widthVal, heightVal), 
        Math.max(widthVal, heightVal), 
        config.gridColor || 0x107c3f, 
        0x112b1c
      )
      newGrid.position.y = 0.01
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
    const wFront = wallsRef.current[1]
    const wLeft = wallsRef.current[2]
    const wRight = wallsRef.current[3]

    if (wBack) {
      wBack.geometry.dispose()
      wBack.geometry = new THREE.PlaneGeometry(widthVal, 3.0)
      wBack.position.set(0, 1.5, -heightVal / 2)
    }

    if (wFront) {
      wFront.geometry.dispose()
      wFront.geometry = new THREE.PlaneGeometry(widthVal, 3.0)
      wFront.position.set(0, 1.5, heightVal / 2)
    }

    if (wLeft) {
      wLeft.geometry.dispose()
      wLeft.geometry = new THREE.PlaneGeometry(heightVal, 3.0)
      wLeft.position.set(-widthVal / 2, 1.5, 0)
    }

    if (wRight) {
      wRight.geometry.dispose()
      wRight.geometry = new THREE.PlaneGeometry(heightVal, 3.0)
      wRight.position.set(widthVal / 2, 1.5, 0)
    }

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

    // 6. Recalcular spawn de câmera
    let spawnX = 0
    let spawnZ = heightVal / 2 - 1.2
    let safeSpawnFound = false
    let attempts = 0
    while (!safeSpawnFound && attempts < 20) {
      let intersects = false
      const camMinX = spawnX - 0.25
      const camMaxX = spawnX + 0.25
      const camMinZ = spawnZ - 0.25
      const camMaxZ = spawnZ + 0.25

      for (const item of items) {
        if (item && (item.isObstacle || item.isPillar)) {
          const itemW = Number(item.width) || 1.0
          const itemD = Number(item.height) || 1.0
          const minX = (Number(item.x) || 0) - widthVal / 2
          const maxX = minX + itemW
          const minZ = (Number(item.y) || 0) - heightVal / 2
          const maxZ = minZ + itemD

          if (camMinX < maxX && camMaxX > minX && camMinZ < maxZ && camMaxZ > minZ) {
            intersects = true
            break
          }
        }
      }
      if (intersects) {
        spawnZ -= 0.5
        attempts++
      } else {
        safeSpawnFound = true
      }
    }

    if (isNaN(spawnX) || isNaN(spawnZ)) {
      spawnX = 0
      spawnZ = heightVal / 2 - 1.2
    }
    const spawnMargin = 0.4
    spawnX = Math.max(-widthVal / 2 + spawnMargin, Math.min(spawnX, widthVal / 2 - spawnMargin))
    spawnZ = Math.max(-heightVal / 2 + spawnMargin, Math.min(spawnZ, heightVal / 2 - spawnMargin))
    camera.position.set(spawnX, 1.6, spawnZ)
  }, [storeWidth, storeHeight])

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

    const widthVal = Math.max(4, Number(storeWidth) || 10)
    const heightVal = Math.max(4, Number(storeHeight) || 12)
    const newFurnitureMeshes: { box: THREE.Box3; isObstacle: boolean }[] = []

    // 2. Popular móveis
    items.forEach(item => {
      if (!item) return
      const itemW = Number(item.width) || 1.0
      const itemD = Number(item.height) || 1.0
      const itemX = Number(item.x) || 0
      const itemY = Number(item.y) || 0
      const itemH = CATEGORY_HEIGHTS[item.category as keyof typeof CATEGORY_HEIGHTS] || 1.2
      const itemGroup = new THREE.Group()
      itemGroup.name = item.category || 'MÓVEL'

      const center2Dx = itemX + itemW / 2
      const center2Dy = itemY + itemD / 2
      const thX = center2Dx - widthVal / 2
      const thZ = center2Dy - heightVal / 2
      itemGroup.position.set(thX, 0, thZ)
      itemGroup.rotation.y = -(Number(item.rotation) || 0) * Math.PI / 180

      const itemColor = new THREE.Color(0x4b5563)
      try {
        if (item.fillColor) {
          itemColor.set(item.fillColor)
        }
      } catch {
        // fallback
      }

      if (item.isPillar) {
        const pillarGeo = new THREE.BoxGeometry(itemW, 3.0, itemD)
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 })
        const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat)
        pillarMesh.position.y = 1.5
        pillarMesh.castShadow = true
        pillarMesh.receiveShadow = true
        itemGroup.add(pillarMesh)
      } 
      else if (item.category === 'GONDOLAS' || item.category === 'PERFUMARIA') {
        const backGeo = new THREE.BoxGeometry(itemW, itemH, 0.08)
        const backMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 })
        const backMesh = new THREE.Mesh(backGeo, backMat)
        backMesh.position.y = itemH / 2
        backMesh.castShadow = true
        itemGroup.add(backMesh)

        const shelfColor = itemColor.clone().multiplyScalar(0.9)
        const shelfMat = new THREE.MeshStandardMaterial({ color: shelfColor, roughness: 0.5 })
        const shelfLevels = 4
        for (let i = 1; i <= shelfLevels; i++) {
          const sy = (itemH / (shelfLevels + 1)) * i
          
          // Front shelf
          const shelfFGeo = new THREE.BoxGeometry(itemW - 0.05, 0.03, 0.25)
          const shelfFMesh = new THREE.Mesh(shelfFGeo, shelfMat)
          shelfFMesh.position.set(0, sy, 0.15)
          shelfFMesh.castShadow = true
          itemGroup.add(shelfFMesh)
          
          addProductMeshes(itemGroup, itemW, sy, 0.15)

          // Back shelf
          const shelfBGeo = new THREE.BoxGeometry(itemW - 0.05, 0.03, 0.25)
          const shelfBMesh = new THREE.Mesh(shelfBGeo, shelfMat)
          shelfBMesh.position.set(0, sy, -0.15)
          shelfBMesh.castShadow = true
          itemGroup.add(shelfBMesh)
          
          addProductMeshes(itemGroup, itemW, sy, -0.15)
        }
      } 
      else if (item.category === 'BALCOES') {
        const baseGeo = new THREE.BoxGeometry(itemW - 0.02, itemH - 0.05, itemD - 0.02)
        const baseMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.6 })
        const baseMesh = new THREE.Mesh(baseGeo, baseMat)
        baseMesh.position.y = (itemH - 0.05) / 2
        baseMesh.castShadow = true
        itemGroup.add(baseMesh)

        const topGeo = new THREE.BoxGeometry(itemW, 0.05, itemD)
        const topMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })
        const topMesh = new THREE.Mesh(topGeo, topMat)
        topMesh.position.y = itemH - 0.025
        topMesh.castShadow = true
        itemGroup.add(topMesh)
        
        const bottleCount = Math.floor(itemW / 0.35)
        for (let b = 0; b < bottleCount; b++) {
          const bx = -itemW / 2 + 0.18 + b * 0.35 + (Math.random() - 0.5) * 0.05
          const bGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6)
          const bMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.2, transparent: true, opacity: 0.75 })
          const bMesh = new THREE.Mesh(bGeo, bMat)
          bMesh.position.set(bx, itemH + 0.035, (Math.random() - 0.5) * (itemD - 0.1))
          itemGroup.add(bMesh)
        }
      }
      else if (item.category === 'REFRIGERACAO') {
        const cabGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
        const cabMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3 })
        const cabMesh = new THREE.Mesh(cabGeo, cabMat)
        cabMesh.position.y = itemH / 2
        cabMesh.castShadow = true
        itemGroup.add(cabMesh)

        const fridgeShelfLevels = 3
        for (let i = 1; i <= fridgeShelfLevels; i++) {
          const sy = (itemH / (fridgeShelfLevels + 1)) * i
          const wireGeo = new THREE.BoxGeometry(itemW - 0.06, 0.01, itemD - 0.06)
          const wireMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.2 })
          const wireMesh = new THREE.Mesh(wireGeo, wireMat)
          wireMesh.position.set(0, sy, 0)
          itemGroup.add(wireMesh)
          
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
            itemGroup.add(drinkMesh)
          }
        }

        const glassGeo = new THREE.BoxGeometry(itemW - 0.05, itemH - 0.1, 0.02)
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
        itemGroup.add(glassMesh)
      }
      else if (item.category === 'OPERACIONAL') {
        const baseGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
        const baseMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.6 })
        const baseMesh = new THREE.Mesh(baseGeo, baseMat)
        baseMesh.position.y = itemH / 2
        baseMesh.castShadow = true
        itemGroup.add(baseMesh)

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

        itemGroup.add(monGroup)
      }
      else {
        const boxGeo = new THREE.BoxGeometry(itemW, itemH, itemD)
        const boxMat = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.5 })
        const boxMesh = new THREE.Mesh(boxGeo, boxMat)
        boxMesh.position.y = itemH / 2
        boxMesh.castShadow = true
        boxMesh.receiveShadow = true
        itemGroup.add(boxMesh)
      }

      furnitureGroup.add(itemGroup)
      
      newFurnitureMeshes.push({
        box: new THREE.Box3().setFromObject(itemGroup),
        isObstacle: item.isObstacle || item.isPillar
      })
    })

    furnitureMeshesRef.current = newFurnitureMeshes
  }, [items, storeWidth, storeHeight])

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

  const handleDpadStart = (dir: string) => {
    keysRef.current[dir] = true
  }
  const handleDpadStop = (dir: string) => {
    keysRef.current[dir] = false
  }

  return (
    <div className="three-overlay">
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
        <div className="hud-header">
          <div className="hud-title">Visualização 3D Walkthrough</div>
          <div className="hud-debug-telemetry" ref={debugTextRef} style={{
            fontSize: 'var(--fs-2xs)',
            fontFamily: 'monospace',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '4px 10px',
            borderRadius: 'var(--r-md)',
            color: 'var(--green-400)',
            fontWeight: 700,
            letterSpacing: '0.02em',
            minWidth: '220px',
            textAlign: 'center'
          }}>
            Iniciando telemetria...
          </div>
          <button className="btn btn-secondary btn-sm hud-close" onClick={onClose}>
            ✕ Fechar Modo 3D
          </button>
        </div>

        {/* ─── CUSTOMIZER SIDEBAR ─── */}
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
                Azul Suave
              </button>
            </div>
          </div>

          <div className="cust-section">
            <label className="toggle-row" style={{ padding: 0 }}>
              <span className="toggle-row-label" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>Exibir Placas de Setorização</span>
              <div className="ios-toggle">
                <input type="checkbox" checked={showSignage} onChange={e => setShowSignage(e.target.checked)} />
                <div className="ios-track" />
              </div>
            </label>
          </div>

          <div className="cust-section">
            <label className="toggle-row" style={{ padding: 0 }}>
              <span className="toggle-row-label" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                Atravessar Móveis (Ghost)
              </span>
              <div className="ios-toggle">
                <input type="checkbox" checked={noclip} onChange={e => setNoclip(e.target.checked)} />
                <div className="ios-track" />
              </div>
            </label>
          </div>
        </div>

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

        {showIntro && (
          <div className="three-lock-overlay" onClick={handleLockClick}>
            <div className="lock-card" onClick={e => e.stopPropagation()}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--green-400)', marginBottom: 12 }}><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              <h3>Clique no ecrã para iniciar</h3>
              <p>Mova o rato ou arraste para olhar ao redor, e use as teclas **W, A, S, D** ou os botões para navegar.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
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
              </div>
            </div>
          </div>
        )}

        {isLocked ? (
          <div className="hud-instructions">
            <span>🚶‍♂️ <strong>WASD / Setas</strong> para andar · <strong>Mova o rato</strong> para olhar · Pressione <strong>ESC</strong> para liberar o cursor</span>
          </div>
        ) : (
          !showIntro && (
            <div className="hud-instructions">
              <span>🚶‍♂️ <strong>WASD / Setas</strong> para andar · <strong>Arraste o ecrã</strong> para olhar · <span style={{ textDecoration: 'underline', cursor: 'pointer', color: 'var(--green-400)' }} onClick={handleLockClick}>Focar Cursor</span></span>
            </div>
          )
        )}
        {loading && (
          <div className="hud-loader">
            <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--green-400)', borderTopColor: 'transparent', borderRadius: '50%' }} />
            <span style={{ marginTop: 8 }}>Gerando maquete 3D...</span>
          </div>
        )}
      </div>
    </div>
  )
}
