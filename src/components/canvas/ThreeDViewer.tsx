import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useCanvasStore } from '../../store/canvasStore'
import './ThreeDViewer.css'

// Height estimations in meters based on item categories
const CATEGORY_HEIGHTS = {
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
  wood: { color: 0xb45309, roughness: 0.45, metalness: 0.0, showGrid: false },
  concrete: { color: 0x4b5563, roughness: 0.9, metalness: 0.1, showGrid: false }
}

// Wall color configurations
const WALL_COLORS = {
  mint: 0x0d2217,
  white: 0xf9fafb,
  gray: 0x374151,
  blue: 0x1e3a8a
}

// Helper to draw text onto a 2D canvas and convert it to a Three.js texture
const createSignageTexture = (text, bgColor, textColor) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.warn("Nenhum contexto 2D disponível para textura de sinalização")
    return new THREE.Texture()
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
const addProductMeshes = (group, width, shelfY, depthOffset) => {
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
    
    let mesh
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
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const keysRef = useRef({}) // Ref to hold keyboard/button inputs reliably
  const debugTextRef = useRef(null) // Real-time telemetry ref
  
  const { storeWidth, storeHeight, items } = useCanvasStore()
  
  const [isLocked, setIsLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showIntro, setShowIntro] = useState(true)

  // Customization & Physics States
  const [floorStyle, setFloorStyle] = useState('grid') 
  const [wallColor, setWallColor] = useState('mint') 
  const [showSignage, setShowSignage] = useState(true)
  const [noclip, setNoclip] = useState(false) // Toggle physics/collisions

  const noclipRef = useRef(noclip)
  useEffect(() => {
    noclipRef.current = noclip
  }, [noclip])

  // Refs to dynamic Three.js objects
  const floorMeshRef = useRef(null)
  const floorGridRef = useRef(null)
  const wallsRef = useRef([])
  const signageGroupRef = useRef(null)

  // Sincronização dinâmica e controle de inicialização do Three.js
  const [initialized, setInitialized] = useState(false)
  const initializedRef = useRef(false)
  useEffect(() => {
    initializedRef.current = initialized
  }, [initialized])
  const [errorMsg, setErrorMsg] = useState(null)
  const sceneRef = useRef(null)
  const furnitureGroupRef = useRef(null)
  const furnitureMeshesRef = useRef([])

  // --- Global Browser Error Catching ---
  // NOTE: Pointer Lock errors are intentionally excluded — they are expected when
  // the user hasn't interacted with the page yet or the browser denies the request.
  useEffect(() => {
    const IGNORED_ERRORS = ['pointerlockchange', 'pointerlock', 'WrongDocumentError', 'pointer lock']
    const isPointerLockError = (msg: string) =>
      IGNORED_ERRORS.some(k => msg?.toLowerCase().includes(k.toLowerCase()))

    const handleGlobalError = (event: ErrorEvent) => {
      const msg = event.error?.message ?? event.message ?? ''
      if (isPointerLockError(msg)) return // silently ignore
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

  // --- Component Mount Logging ---
  useEffect(() => {
    console.log("🚀 [3D Viewer] Componente montado. Itens:", items?.length, "Dimensões:", storeWidth, "x", storeHeight)
    return () => {
      console.log("🚪 [3D Viewer] Componente desmontado.")
    }
  }, [])

  // --- EFFECT 1: INITIALIZE THREE.JS SCENE ---
  useEffect(() => {
    try {
      console.log("🎬 [3D Viewer] Effect 1 (Setup) iniciando com dimensões:", storeWidth, "x", storeHeight)
      if (!containerRef.current) {
        console.warn("⚠️ [3D Viewer] containerRef.current é nulo. Setup abortado.")
        return
      }

      const widthVal = Math.max(4, Number(storeWidth) || 10)
      const heightVal = Math.max(4, Number(storeHeight) || 12)

      let width = containerRef.current.clientWidth
      let height = containerRef.current.clientHeight
      
      // Fallback if the container hasn't layouted yet or is too small to prevent aspect ratio NaN/Infinity
      if (width < 320 || height < 240) {
        width = window.innerWidth || 800
        height = window.innerHeight || 600
      }
      
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x040a06)
      scene.fog = new THREE.FogExp2(0x040a06, 0.05)

      const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 100)
      camera.position.set(0, 1.6, heightVal / 2 - 1.2) 

      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.domElement.tabIndex = 1
      renderer.domElement.style.outline = 'none'
      containerRef.current.appendChild(renderer.domElement)
      rendererRef.current = renderer.domElement

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

      // Floor Mesh
      const floorGeo = new THREE.PlaneGeometry(widthVal, heightVal)
      const floorMat = new THREE.MeshStandardMaterial({ 
        color: FLOOR_STYLES[floorStyle].color, 
        roughness: FLOOR_STYLES[floorStyle].roughness,
        metalness: FLOOR_STYLES[floorStyle].metalness
      })
      const floor = new THREE.Mesh(floorGeo, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      floor.receiveShadow = true
      scene.add(floor)
      floorMeshRef.current = floor

      // Grid helper
      const gridHelper = new THREE.GridHelper(Math.max(widthVal, heightVal), Math.max(widthVal, heightVal), 0x107c3f, 0x112b1c)
      gridHelper.position.y = 0.01
      scene.add(gridHelper)
      floorGridRef.current = gridHelper

      // Ceiling
      const ceilingGeo = new THREE.PlaneGeometry(widthVal, heightVal)
      const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0f1d15, roughness: 0.9 })
      const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat)
      ceiling.rotation.x = Math.PI / 2
      ceiling.position.y = 3.0
      scene.add(ceiling)

      // Wall Material & Geometry
      const wallGeo = new THREE.PlaneGeometry(widthVal, 3.0)
      const wallSideGeo = new THREE.PlaneGeometry(heightVal, 3.0)
      const wallMat = new THREE.MeshStandardMaterial({ 
        color: WALL_COLORS[wallColor], 
        roughness: 0.7,
        side: THREE.DoubleSide
      })
      
      // Create the 4 boundaries
      const wBack = new THREE.Mesh(wallGeo, wallMat)
      wBack.position.set(0, 1.5, -heightVal / 2)
      wBack.receiveShadow = true
      scene.add(wBack)

      const wFront = new THREE.Mesh(wallGeo, wallMat)
      wFront.position.set(0, 1.5, heightVal / 2)
      wFront.receiveShadow = true
      scene.add(wFront)

      const wLeft = new THREE.Mesh(wallSideGeo, wallMat)
      wLeft.rotation.y = Math.PI / 2
      wLeft.position.set(-widthVal / 2, 1.5, 0)
      wLeft.receiveShadow = true
      scene.add(wLeft)

      const wRight = new THREE.Mesh(wallSideGeo, wallMat)
      wRight.rotation.y = -Math.PI / 2
      wRight.position.set(widthVal / 2, 1.5, 0)
      wRight.receiveShadow = true
      scene.add(wRight)

      wallsRef.current = [wBack, wFront, wLeft, wRight]

      // --- Dynamic Signage (Categorias nas Paredes) ---
      const signageGroup = new THREE.Group()
      
      const addSign = (text, x, y, z, rotY) => {
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

      scene.add(signageGroup)
      signageGroupRef.current = signageGroup

      // Create the dynamic furniture group and store in refs
      const furnitureGroup = new THREE.Group()
      scene.add(furnitureGroup)
      furnitureGroupRef.current = furnitureGroup
      sceneRef.current = scene

      if (typeof window !== 'undefined') {
        (window as any).debugScene = scene;
        (window as any).debugFurnitureGroup = furnitureGroup;
        (window as any).debugCamera = camera;
      }

      // Find a safe spawn position that doesn't intersect with obstacles using 2D bounds check
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
          if (item.isObstacle || item.isPillar) {
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
          spawnZ -= 0.5 // Shift forward
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
      console.log("✅ [3D Viewer] Setup concluído. Spawn:", spawnX, ",", spawnZ)

      setLoading(false)
      setInitialized(true)

      // --- 5. CAMERA LOOK CONTROLS (HORIZONTAL ONLY TO PREVENT VERTIGO) ---
      let yaw = 0
      let isDragging = false
      let previousMouseX = 0

      const handleMouseMove = (e) => {
        try {
          const movementX = e.movementX ?? 0
          if (document.pointerLockElement === renderer.domElement) {
            yaw -= movementX * 0.002
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            camera.rotation.set(0, 0, 0)
            camera.rotation.y = yaw
          } else if (isDragging) {
            const clientX = e.clientX ?? previousMouseX
            const deltaX = clientX - previousMouseX
            previousMouseX = clientX
            yaw -= deltaX * 0.003
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            camera.rotation.set(0, 0, 0)
            camera.rotation.y = yaw
          }
        } catch (err) {
          console.warn("Erro no mouse move:", err)
        }
      }

      const handleMouseDown = (e) => {
        const tagName = e.target.tagName
        if (tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || e.target.closest('.ios-toggle')) {
          return
        }
        if (e.button === 0) { // Left click only
          isDragging = true
          previousMouseX = e.clientX ?? 0
          renderer.domElement.focus()
        }
      }

      const handleMouseUp = () => {
        isDragging = false
      }

      const handleTouchStart = (e) => {
        const tagName = e.target.tagName
        if (tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || e.target.closest('.three-dpad') || e.target.closest('.ios-toggle')) {
          return
        }
        if (e.touches && e.touches.length === 1) {
          isDragging = true
          previousMouseX = e.touches[0].clientX ?? 0
          renderer.domElement.focus()
        }
      }

      const handleTouchMove = (e) => {
        try {
          if (isDragging && e.touches && e.touches.length === 1) {
            const clientX = e.touches[0].clientX ?? previousMouseX
            const deltaX = clientX - previousMouseX
            previousMouseX = clientX
            yaw -= deltaX * 0.005
            if (isNaN(yaw) || !isFinite(yaw)) yaw = 0
            camera.rotation.set(0, 0, 0)
            camera.rotation.y = yaw
          }
        } catch (err) {
          console.warn("Erro no touch move:", err)
        }
      }

      const handleTouchEnd = () => {
        isDragging = false
      }

      const lockPointer = () => {
        if (!isDragging && renderer && renderer.domElement) {
          try {
            // requestPointerLock can fail if the document doesn't have focus
            // or if the element is not connected to a valid document.
            // We use .catch() to silently handle rejection without showing error UI.
            const result = renderer.domElement.requestPointerLock()
            if (result && typeof result.catch === 'function') {
              result.catch(() => {
                // PointerLock rejected — drag-to-look is still available
              })
            }
          } catch {
            // Silently ignore synchronous PointerLock errors
          }
        }
      }

      const onPointerLockChange = () => {
        if (renderer && renderer.domElement) {
          setIsLocked(document.pointerLockElement === renderer.domElement)
        }
      }

      const handleCanvasClick = (e) => {
        if (renderer && renderer.domElement) {
          renderer.domElement.focus()
          lockPointer()
        }
      }

      renderer.domElement.addEventListener('click', handleCanvasClick)
      document.addEventListener('mousedown', handleMouseDown)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
      document.addEventListener('touchmove', handleTouchMove, { passive: true })
      document.addEventListener('touchend', handleTouchEnd)
      document.addEventListener('pointerlockchange', onPointerLockChange)

      // --- 6. KEYBOARD MOVEMENT CONTROLS ---
      const handleKeyDown = (e) => { 
        if (keysRef.current) {
          keysRef.current[e.code] = true 
          if (e.key) keysRef.current[e.key.toLowerCase()] = true
        }
        
        // Prevent browser default scroll behaviors for navigation keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || 
            ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key?.toLowerCase() || '')) {
          e.preventDefault()
        }
      }
      const handleKeyUp = (e) => { 
        if (keysRef.current) {
          keysRef.current[e.code] = false 
          if (e.key) keysRef.current[e.key.toLowerCase()] = false
        }
      }

      // Direct binding to the canvas element for maximum focus reliability
      if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('keydown', handleKeyDown)
        renderer.domElement.addEventListener('keyup', handleKeyUp)
      }

      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('keyup', handleKeyUp)

      // --- 7. ANIMATION & MOVEMENT LOOP ---
      let lastTime = performance.now()
      const cameraDirection = new THREE.Vector3()
      const moveVector = new THREE.Vector3()
      const upVector = new THREE.Vector3(0, 1, 0)
      const rightVector = new THREE.Vector3()
      
      let animationFrameId = null
      const moveSpeed = 3.0 

      const animate = () => {
        try {
          const currentTime = performance.now()
          let deltaTime = (currentTime - lastTime) / 1000
          lastTime = currentTime

          // Safeguard deltaTime from being excessively high (e.g. background tab resumed) or NaN
          if (isNaN(deltaTime) || !isFinite(deltaTime) || deltaTime < 0) {
            deltaTime = 0
          } else if (deltaTime > 0.1) {
            deltaTime = 0.1 // clamp to 100ms max per frame to prevent giant leaps
          }

          camera.getWorldDirection(cameraDirection)
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
          // Support AZERTY layouts as well (Z to walk forward, Q to walk left)
          if (keys['KeyW'] || keys['ArrowUp'] || keys['w'] || keys['arrowup'] || keys['z'] || keys['KeyZ']) frontVector.copy(cameraDirection)
          if (keys['KeyS'] || keys['ArrowDown'] || keys['s'] || keys['arrowdown']) frontVector.copy(cameraDirection).multiplyScalar(-1)
          if (keys['KeyD'] || keys['ArrowRight'] || keys['d'] || keys['arrowright']) sideVector.copy(rightVector)
          if (keys['KeyA'] || keys['ArrowLeft'] || keys['a'] || keys['arrowleft'] || keys['q'] || keys['KeyQ']) sideVector.copy(rightVector).multiplyScalar(-1)

          moveVector.addVectors(frontVector, sideVector)
          
          if (moveVector.lengthSq() > 0.0001) {
            moveVector.normalize().multiplyScalar(moveSpeed * deltaTime)
            
            let nextX = camera.position.x + moveVector.x
            let nextZ = camera.position.z + moveVector.z
            
            if (isNaN(nextX) || !isFinite(nextX)) nextX = camera.position.x ?? 0
            if (isNaN(nextZ) || !isFinite(nextZ)) nextZ = camera.position.z ?? 0

            const boundMargin = 0.4
            nextX = Math.max(-widthVal / 2 + boundMargin, Math.min(nextX, widthVal / 2 - boundMargin))
            nextZ = Math.max(-heightVal / 2 + boundMargin, Math.min(nextZ, heightVal / 2 - boundMargin))

            // sliding collision detection - check X and Z independently so players do not get stuck
            let collidedX = false
            if (!noclipRef.current && furnitureMeshesRef.current) {
              const nextCamBoxX = new THREE.Box3(
                new THREE.Vector3(nextX - 0.25, 0, camera.position.z - 0.25),
                new THREE.Vector3(nextX + 0.25, 2.0, camera.position.z + 0.25)
              )
              for (const fItem of furnitureMeshesRef.current) {
                if (fItem && fItem.isObstacle && fItem.box && nextCamBoxX.intersectsBox(fItem.box)) {
                  collidedX = true
                  break
                }
              }
            }
            if (!collidedX) {
              camera.position.x = nextX
            }

            let collidedZ = false
            if (!noclipRef.current && furnitureMeshesRef.current) {
              const nextCamBoxZ = new THREE.Box3(
                new THREE.Vector3(camera.position.x - 0.25, 0, nextZ - 0.25),
                new THREE.Vector3(camera.position.x + 0.25, 2.0, nextZ + 0.25)
              )
              for (const fItem of furnitureMeshesRef.current) {
                if (fItem && fItem.isObstacle && fItem.box && nextCamBoxZ.intersectsBox(fItem.box)) {
                  collidedZ = true
                  break
                }
              }
            }
            if (!collidedZ) {
              camera.position.z = nextZ
            }
          }

          // Double check camera coordinates are completely valid numbers
          if (isNaN(camera.position.x) || !isFinite(camera.position.x)) camera.position.x = 0
          if (isNaN(camera.position.z) || !isFinite(camera.position.z)) camera.position.z = heightVal / 2 - 1.2

          // Update telemetry box
          if (debugTextRef.current) {
            const activeKeys = Object.keys(keysRef.current || {})
              .filter(k => keysRef.current[k])
              .map(k => k.replace('Key', ''))
              .join(', ') || 'Nenhuma'
            
            const currentItems = useCanvasStore.getState().items
            debugTextRef.current.innerText = `Pos: ${camera.position.x.toFixed(2)}, ${camera.position.z.toFixed(2)} | Dir: ${(camera.rotation.y * 180 / Math.PI).toFixed(0)}° | Móveis: ${currentItems.length} | Init: ${initializedRef.current ? 'Sim' : 'Não'} | Teclas: ${activeKeys}`
          }

          renderer.render(scene, camera)
          animationFrameId = requestAnimationFrame(animate)
        } catch (err) {
          console.error("Erro no loop de animação 3D:", err)
          setErrorMsg("Erro no loop de animação 3D: " + err.message + "\n" + err.stack)
        }
      }

      animate()

      // Resize
      const handleResize = () => {
        let w = containerRef.current?.clientWidth ?? 0
        let h = containerRef.current?.clientHeight ?? 0
        if (w < 320 || h < 240) {
          w = window.innerWidth || 800
          h = window.innerHeight || 600
        }
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
      window.addEventListener('resize', handleResize)

      // --- CLEANUP ---
      return () => {
        cancelAnimationFrame(animationFrameId)
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
        
        if (renderer) {
          try {
            if (typeof renderer.dispose === 'function') {
              renderer.dispose()
            }
          } catch (e) {
            console.warn("Erro ao descartar renderizador WebGL:", e)
          }
          if (renderer.domElement) {
            renderer.domElement.removeEventListener('keydown', handleKeyDown)
            renderer.domElement.removeEventListener('keyup', handleKeyUp)
            renderer.domElement.removeEventListener('click', handleCanvasClick)
            try {
              if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
                containerRef.current.removeChild(renderer.domElement)
              }
            } catch (e) {
              console.warn("Erro ao remover elemento do canvas:", e)
            }
          }
        }
        rendererRef.current = null
        
        document.removeEventListener('mousedown', handleMouseDown)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchstart', handleTouchStart)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
        document.removeEventListener('pointerlockchange', onPointerLockChange)
        
        floorGeo.dispose()
        floorMat.dispose()
        ceilingGeo.dispose()
        ceilingMat.dispose()
        wallMat.dispose()
        wallGeo.dispose()
        wallSideGeo.dispose()
      }
    } catch (err) {
      console.error("Erro no setup 3D:", err)
      setErrorMsg("Erro no setup 3D: " + err.message + "\n" + err.stack)
    }
  }, [storeWidth, storeHeight])

  // --- EFFECT 1.5: DYNAMIC FURNITURE SYNCHRONIZATION ---
  useEffect(() => {
    try {
      const scene = sceneRef.current
      const furnitureGroup = furnitureGroupRef.current
      console.log("🔄 [3D Viewer] Iniciando sincronização de móveis. Itens no canvas:", items?.length, "initialized =", initialized)
      if (!scene || !furnitureGroup || !initialized) return

      // 1. Clear existing items
      while (furnitureGroup.children.length > 0) {
        const group = furnitureGroup.children[0]
        furnitureGroup.remove(group)
        
        // Dispose geometries/materials inside recursively
        if (group && typeof group.traverse === 'function') {
          group.traverse(child => {
            if (child && child.isMesh) {
              if (child.geometry && typeof child.geometry.dispose === 'function') {
                try {
                  child.geometry.dispose()
                } catch (e) {
                  console.warn("Erro ao descartar geometria:", e)
                }
              }
              if (child.material) {
                try {
                  if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                      if (m && typeof m.dispose === 'function') {
                        m.dispose()
                      }
                    })
                  } else if (typeof child.material.dispose === 'function') {
                    child.material.dispose()
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
      const newFurnitureMeshes = []

      // 2. Populate furniture
      items.forEach(item => {
        if (!item) return
        const itemW = Number(item.width) || 1.0
        const itemD = Number(item.height) || 1.0
        const itemX = Number(item.x) || 0
        const itemY = Number(item.y) || 0
        const itemH = CATEGORY_HEIGHTS[item.category] || 1.2
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
          // fallback stays 0x4b5563
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
          
          // Put cosmetic bottles on top of counter
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

          // Draw interior shelves and products inside
          const fridgeShelfLevels = 3
          for (let i = 1; i <= fridgeShelfLevels; i++) {
            const sy = (itemH / (fridgeShelfLevels + 1)) * i
            // shelf wire
            const wireGeo = new THREE.BoxGeometry(itemW - 0.06, 0.01, itemD - 0.06)
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.2 })
            const wireMesh = new THREE.Mesh(wireGeo, wireMat)
            wireMesh.position.set(0, sy, 0)
            itemGroup.add(wireMesh)
            
            // Place drinks
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

          // Draw Cash Register / Monitor
          const monGroup = new THREE.Group()
          monGroup.position.set(0, itemH, 0)
          
          // Stand
          const standGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8)
          const standMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })
          const standMesh = new THREE.Mesh(standGeo, standMat)
          standMesh.position.y = 0.06
          monGroup.add(standMesh)
          
          // Screen
          const scrGeo = new THREE.BoxGeometry(0.24, 0.18, 0.02)
          const scrMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 })
          const scrMesh = new THREE.Mesh(scrGeo, scrMat)
          scrMesh.position.set(0, 0.15, 0)
          scrMesh.rotation.x = -0.15
          monGroup.add(scrMesh)
          
          // Glowing screen front
          const faceGeo = new THREE.BoxGeometry(0.22, 0.16, 0.002)
          const faceMat = new THREE.MeshBasicMaterial({ color: 0x10b981 })
          const faceMesh = new THREE.Mesh(faceGeo, faceMat)
          faceMesh.position.set(0, 0.15, 0.011)
          faceMesh.rotation.x = -0.15
          monGroup.add(faceMesh)

          // Keyboard
          const kbGeo = new THREE.BoxGeometry(0.22, 0.01, 0.08)
          const kbMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 })
          const kbMesh = new THREE.Mesh(kbGeo, kbMat)
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
      console.log("✅ [3D Viewer] Sincronização de móveis concluída com sucesso. Meshes geradas:", newFurnitureMeshes.length)

      if (furnitureGroup && scene) {
        console.log("DEBUG_SCENE groupInScene:", scene.children.includes(furnitureGroup), "groupVisible:", furnitureGroup.visible, "childrenCount:", furnitureGroup.children.length);
        furnitureGroup.children.forEach((c: any, idx) => {
          console.log(`DEBUG_SCENE item[${idx}] category:`, c.name, "type:", c.type, "position:", JSON.stringify(c.position), "scale:", JSON.stringify(c.scale), "visible:", c.visible, "childrenCount:", c.children.length);
          c.children.forEach((sc: any, sidx: number) => {
            console.log(`  DEBUG_SCENE subchild[${sidx}] type:`, sc.type, "visible:", sc.visible, "geom:", sc.geometry?.type, "mat:", sc.material?.type);
          });
        });
      }
    } catch (err) {
      console.error("Erro na sincronização de móveis:", err)
      setErrorMsg("Erro na sincronização de móveis: " + err.message + "\n" + err.stack)
    }
  }, [items, initialized, storeWidth, storeHeight])

  // --- EFFECT 2: UPDATE CUSTOMIZATIONS IN REAL-TIME ---
  useEffect(() => {
    if (floorMeshRef.current) {
      const config = FLOOR_STYLES[floorStyle]
      floorMeshRef.current.material.color.setHex(config.color)
      floorMeshRef.current.material.roughness = config.roughness
      floorMeshRef.current.material.metalness = config.metalness
      floorMeshRef.current.material.needsUpdate = true
    }

    if (floorGridRef.current) {
      const config = FLOOR_STYLES[floorStyle]
      floorGridRef.current.visible = config.showGrid
      if (config.showGrid && config.gridColor) {
        floorGridRef.current.material.color.setHex(config.gridColor)
      }
    }

    wallsRef.current.forEach(wall => {
      if (wall) {
        wall.material.color.setHex(WALL_COLORS[wallColor])
        wall.material.needsUpdate = true
      }
    })

    if (signageGroupRef.current) {
      signageGroupRef.current.visible = showSignage
    }
  }, [floorStyle, wallColor, showSignage])

  const handleLockClick = () => {
    setShowIntro(false)
    if (rendererRef.current) {
      try {
        rendererRef.current.focus()
      } catch (e) {
        console.warn("Erro ao focar renderer:", e)
      }
    }
    if (rendererRef.current && typeof rendererRef.current.requestPointerLock === 'function') {
      try {
        const result = rendererRef.current.requestPointerLock()
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

  // D-Pad Event Handlers for on-screen controls
  const handleDpadStart = (dir) => {
    keysRef.current[dir] = true
  }
  const handleDpadStop = (dir) => {
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
                  if (rendererRef.current) {
                    try {
                      rendererRef.current.focus()
                    } catch (e) {
                      console.warn("Erro ao focar renderer:", e)
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
