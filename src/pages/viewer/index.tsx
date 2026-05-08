/**
 * WebAR — ARToolKit marker detection + getUserMedia + Three.js
 *
 * Tech stack:
 * - ARToolKit (artoolkit.min.js) → Hiro marker detection
 * - getUserMedia → camera with continuous autofocus
 * - Three.js → 3D rendering (FBX model on marker)
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './viewer.scss'

type ARStatus =
  | 'idle'
  | 'camera-requesting'
  | 'artoolkit-loading'
  | 'scanning'
  | 'detected'
  | 'tracking'
  | 'model-loading'
  | 'camera-denied'
  | 'error'

const MODEL_URL = './models/test.fbx'
const BUILD_VERSION = typeof window !== 'undefined' ? (window as any).__BUILD_VERSION__ || 'dev' : 'dev'

export default function Viewer() {
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const mixerRef = useRef<any>(null)
  const clockRef = useRef<any>(null)
  const animationIdRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const modelGroupRef = useRef<any>(null)
  const arControllerRef = useRef<any>(null)

  const [status, setStatus] = useState<ARStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const [markerVisible, setMarkerVisible] = useState(false)

  // Use refs for values that change inside animation loop
  const markerVisibleRef = useRef(false)
  const statusRef = useRef<ARStatus>('idle')

  const updateStatus = (s: ARStatus) => {
    setStatus(s)
    statusRef.current = s
  }

  const updateMarkerVisible = (v: boolean) => {
    setMarkerVisible(v)
    markerVisibleRef.current = v
  }

  const addDebug = (msg: string) => {
    const t = new Date().toLocaleTimeString()
    setDebugInfo(prev => prev ? prev + '\n[' + t + '] ' + msg : '[' + t + '] ' + msg)
    console.log('[AR] ' + msg)
  }

  const cleanup = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current)
      animationIdRef.current = 0
    }
    if (arControllerRef.current) {
      try { arControllerRef.current.dispose() } catch {}
      arControllerRef.current = null
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }
      videoRef.current.remove()
      videoRef.current = null
    }
    if (rendererRef.current) {
      rendererRef.current.dispose()
      const canvas = rendererRef.current.domElement
      canvas?.parentElement?.removeChild(canvas)
    }
    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    mixerRef.current = null
    modelGroupRef.current = null
    clockRef.current = null
    setStatus('idle')
    setErrorMsg('')
    setProgress('')
    setDebugInfo('')
    setMarkerVisible(false)
    markerVisibleRef.current = false
    statusRef.current = 'idle'
  }

  const initAR = async () => {
    try {
      setErrorMsg('')
      setDebugInfo('')
      updateStatus('camera-requesting')
      setProgress('请求摄像头权限...')

      const THREE = await import('three')
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

      // Step 1: Get camera with autofocus
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        } as any,
        audio: false,
      })

      // Try to enable continuous autofocus
      try {
        const track = stream.getVideoTracks()[0]
        const capabilities = (track as any).getCapabilities?.()
        if (capabilities?.focusMode?.includes?.('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] as any })
          addDebug('✅ Continuous autofocus enabled')
        } else {
          addDebug('⚠️ Continuous autofocus not supported, using default')
        }
      } catch (e: any) {
        addDebug('⚠️ Autofocus setup skipped: ' + e.message)
      }

      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.muted = true
      video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:0;'
      document.body.appendChild(video)
      videoRef.current = video
      await video.play()
      addDebug('Camera started (' + video.videoWidth + 'x' + video.videoHeight + ')')

      // Step 2: Initialize ARToolKit
      updateStatus('artoolkit-loading')
      setProgress('加载 ARToolKit...')

      const artoolkit = (window as any).artoolkit
      if (!artoolkit) {
        throw new Error('ARToolKit not loaded - check artoolkit.min.js')
      }
      addDebug('ARToolKit global object found')

      const vw = video.videoWidth
      const vh = video.videoHeight

      // Create ARController
      const arController = new artoolkit.ARController(vw, vh, './artoolkit/camera_para.dat')
      arControllerRef.current = arController

      // Load Hiro marker pattern — ARToolKit5 returns a Promise
      let hiroMarkerId = -1
      try {
        const result = await arController.loadMarker('./artoolkit/patt.hiro')
        hiroMarkerId = typeof result === 'number' ? result : (result?.markerId ?? -1)
        addDebug('✅ Hiro marker loaded, markerId=' + hiroMarkerId)
      } catch (e: any) {
        addDebug('⚠️ loadMarker threw (non-fatal), trying callback fallback')
        // Fallback: try the callback API for older ARToolKit5 builds
        await new Promise<void>((resolve) => {
          arController.loadMarker('./artoolkit/patt.hiro', (id: number) => {
            hiroMarkerId = id
            addDebug('✅ Hiro marker (callback), markerId=' + id)
            resolve()
          })
          setTimeout(resolve, 2000) // safety timeout
        })
      }
      if (hiroMarkerId < 0) addDebug('⚠️ hiroMarkerId still -1 — marker may still be loadable via detect()')

      addDebug('ARToolKit initialized')

      // Step 3: Create Three.js scene
      const container = document.getElementById('ar-container')
      if (!container) throw new Error('Cannot find #ar-container')

      const scene = new THREE.Scene()

      // Use camera params from ARToolKit
      const camera = new THREE.PerspectiveCamera(
        2 * Math.atan(vh / (2 * (arController as any).cameraPara || 800)) * (180 / Math.PI),
        vw / vh,
        0.1,
        1000
      )

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
      dirLight.position.set(5, 10, 7)
      scene.add(dirLight)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
      fillLight.position.set(-5, 3, -5)
      scene.add(fillLight)

      sceneRef.current = scene
      cameraRef.current = camera

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;'
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      // Step 4: Load FBX model
      updateStatus('model-loading')
      setProgress('加载 3D 模型...')

      const loader = new FBXLoader()
      loader.load(
        MODEL_URL,
        (group) => {
          addDebug('FBX loaded, children: ' + group.children.length)

          const box = new THREE.Box3().setFromObject(group)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          const scale = 1.0 / maxDim
          group.scale.setScalar(scale)
          group.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

          group.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          // Initially hidden — show only when marker detected
          group.visible = false
          modelGroupRef.current = group
          scene.add(group)

          if (group.animations && group.animations.length > 0) {
            mixerRef.current = new THREE.AnimationMixer(group)
            mixerRef.current.clipAction(group.animations[0]).play()
          }
          clockRef.current = new THREE.Clock()

          updateStatus('scanning')
          setProgress('')
          addDebug('Model loaded, waiting for marker detection...')

          // ─── Render loop ───
          let scanStartTime = Date.now()
          const SCAN_TIMEOUT_MS = 12000 // 12 秒后提示"未找到识别图"

          function animate() {
            animationIdRef.current = requestAnimationFrame(animate)

            const arCtrl = arControllerRef.current
            const vid = videoRef.current

            // ARToolKit: detect markers every frame
            if (arCtrl && vid && vid.readyState >= 2) {
              try {
                arCtrl.detect(vid)
              } catch (e: any) {
                // detect() errors are non-fatal, keep running
              }

              // ───主动查询标记数组，而非依赖事件 ───
              // arCtrl.markers 包含本帧检测到的所有标记
              const detectedMarkers: any[] = arCtrl.markers || []

              if (detectedMarkers.length > 0) {
                // 找到任意一个已注册的标记（Hiro）
                const found = detectedMarkers[0]
                if (!markerVisibleRef.current) {
                  updateMarkerVisible(true)
                  if (statusRef.current !== 'tracking' && statusRef.current !== 'detected') {
                    updateStatus('detected')
                    addDebug('🎯 Marker detected! id=' + found.id)
                    Taro.showToast({ title: '✅ 检测到识别图！', icon: 'none', duration: 1500 })
                    setTimeout(() => updateStatus('tracking'), 600)
                  }
                }

                // 从标记矩阵更新模型位置
                if (modelGroupRef.current && found.matrix) {
                  const m = found.matrix
                  // ARToolKit 矩阵是列主序，转换为 Three.js 行主序
                  const threeMat = new THREE.Matrix4()
                  threeMat.set(
                    m[0], m[4], m[8], m[12],
                    m[1], m[5], m[9], m[13],
                    m[2], m[6], m[10], m[14],
                    m[3], m[7], m[11], m[15]
                  )
                  threeMat.decompose(
                    modelGroupRef.current.position,
                    modelGroupRef.current.quaternion,
                    modelGroupRef.current.scale
                  )
                  // 缩放到合理大小
                  modelGroupRef.current.scale.setScalar(0.5)
                }
              } else {
                // 本帧未检测到标记
                if (markerVisibleRef.current) {
                  updateMarkerVisible(false)
                  if (statusRef.current !== 'scanning') {
                    updateStatus('scanning')
                    addDebug('❌ Marker lost')
                  }
                }

                // 超时提示
                const elapsed = Date.now() - scanStartTime
                if (elapsed > SCAN_TIMEOUT_MS) {
                  // 仅提示一次
                  scanStartTime = Date.now() // reset so it fires again after another interval
                  addDebug('⏰ Scan timeout — marker not found in ' + (SCAN_TIMEOUT_MS / 1000) + 's')
                  Taro.showToast({ title: '⚠️ 未找到识别图，请对准 Hiro 图案', icon: 'none', duration: 3000 })
                }
              }
            }

            // Show/hide model based on marker visibility
            if (modelGroupRef.current) {
              modelGroupRef.current.visible = markerVisibleRef.current
            }

            const delta = clockRef.current?.getDelta() || 0
            mixerRef.current?.update(delta)
            renderer.render(scene, camera)
          }
          animate()

          addDebug('Model loaded, entering scan mode...')
          Taro.showToast({ title: '📷 AR 就绪，请对准识别图', icon: 'none', duration: 2000 })
        },
        (xhr) => {
          const pct = xhr.total > 0 ? Math.round((xhr.loaded / xhr.total) * 100) : 0
          setProgress('加载模型 ' + pct + '%')
        },
        (err) => {
          addDebug('FBX load failed: ' + err)
          updateStatus('error')
          setErrorMsg('3D model load failed: ' + (err?.message || String(err)))
        }
      )

      // ARToolKit marker event — kept as supplementary (some builds fire this)
      arController.addEventListener('getMarker', (e: any) => {
        const marker = e.data?.marker
        if (marker && marker.id >= 0) {
          if (!markerVisibleRef.current) {
            updateMarkerVisible(true)
            if (statusRef.current !== 'tracking') {
              updateStatus('detected')
              addDebug('🎯 [event] Marker detected! id=' + marker.id)
              Taro.showToast({ title: '✅ 检测到识别图！', icon: 'none', duration: 1500 })
              setTimeout(() => updateStatus('tracking'), 600)
            }
          }
          if (modelGroupRef.current && marker.matrix) {
            const m = marker.matrix
            const threeMat = new THREE.Matrix4()
            threeMat.set(
              m[0], m[4], m[8], m[12],
              m[1], m[5], m[9], m[13],
              m[2], m[6], m[10], m[14],
              m[3], m[7], m[11], m[15]
            )
            threeMat.decompose(
              modelGroupRef.current.position,
              modelGroupRef.current.quaternion,
              modelGroupRef.current.scale
            )
            modelGroupRef.current.scale.setScalar(0.5)
          }
        } else {
          if (markerVisibleRef.current) {
            updateMarkerVisible(false)
            updateStatus('scanning')
            addDebug('❌ [event] Marker lost')
          }
        }
      })
    } catch (err: any) {
      console.error('[AR] Init error:', err)
      addDebug('Fatal error: ' + err.message)
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        updateStatus('camera-denied')
        setErrorMsg('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问')
      } else {
        updateStatus('error')
        setErrorMsg(err?.message || String(err))
      }
    }
  }

  const handleReset = () => {
    cleanup()
  }

  useEffect(() => {
    return () => { cleanup() }
  }, [])

  const statusLabel: Record<ARStatus, string> = {
    idle: '待启动',
    'camera-requesting': '请求摄像头',
    'artoolkit-loading': '加载 ARToolKit',
    scanning: '扫描识别图中',
    detected: '检测到标记',
    tracking: '追踪中',
    'model-loading': '加载模型',
    'camera-denied': '权限被拒',
    error: '错误',
  }

  const canStart = status === 'idle'

  return (
    <View className="viewer-page">
      <View id="ar-container" className="ar-container" />

      {/* Version badge — top-right */}
      <View className="version-badge">
        <Text className="version-text">v{BUILD_VERSION}</Text>
      </View>

      {/* Idle hint */}
      {status === 'idle' && (
        <View className="camera-hint">
          <Text className="hint-text">🥽 WebAR 识别图体验</Text>
          <Text className="hint-hint">点击「启动 AR」，对准 Hiro 识别图</Text>
        </View>
      )}

      {/* Loading states */}
      {(status === 'camera-requesting' || status === 'artoolkit-loading' || status === 'model-loading') && (
        <View className="status-overlay">
          <View className="loading-spinner" />
          <Text className="status-text">{statusLabel[status]}</Text>
          {progress && <Text className="progress-text">{progress}</Text>}
        </View>
      )}

      {/* Scanning overlay */}
      {status === 'scanning' && (
        <View className="scan-overlay">
          <View className="scan-frame">
            <View className="scan-corner tl" />
            <View className="scan-corner tr" />
            <View className="scan-corner bl" />
            <View className="scan-corner br" />
            <Text className="scan-text">📷 对准识别图</Text>
            <Text className="scan-sub">请将摄像头对准 Hiro 标记图案</Text>
          </View>
        </View>
      )}

      {/* Marker detected feedback */}
      {status === 'detected' && (
        <View className="detect-feedback found">
          <Text className="detect-text">✅ 检测到识别图！</Text>
        </View>
      )}

      {/* Tracking indicator */}
      {status === 'tracking' && (
        <View className="track-indicator">
          <View className="track-dot" />
          <Text className="track-text">追踪中</Text>
        </View>
      )}

      {/* Marker lost hint */}
      {!markerVisible && status === 'scanning' && (
        <View className="marker-lost-hint">
          <Text className="lost-text">未检测到识别图，请调整角度</Text>
        </View>
      )}

      {/* Camera denied */}
      {status === 'camera-denied' && (
        <View className="status-overlay error">
          <Text className="status-text">📵 摄像头权限被拒绝</Text>
          <Text className="progress-text">{errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>请在浏览器设置中允许摄像头访问后重试</Text>
        </View>
      )}

      {/* Error */}
      {status === 'error' && (
        <View className="status-overlay error">
          <Text className="status-text">❌ 错误</Text>
          <Text className="progress-text">{errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>点击「重新启动」重试</Text>
        </View>
      )}

      {/* Control bar */}
      <View className="control-bar">
        <View className="status-row">
          <View className={'status-dot ' + (
            status === 'tracking' || status === 'detected' ? 'green' :
            status === 'error' || status === 'camera-denied' ? 'red' :
            'yellow'
          )} />
          <Text className="status-label">{statusLabel[status]}</Text>
          {progress && <Text className="progress-label">{progress}</Text>}
        </View>
        <View className="btn-group">
          {canStart && (
            <View className="btn primary" onClick={initAR}>启动 AR</View>
          )}
          {['camera-denied', 'error', 'tracking', 'detected', 'scanning'].includes(status) && (
            <View className="btn warn" onClick={handleReset}>重新启动</View>
          )}
        </View>
      </View>

      {/* Debug panel */}
      {debugInfo && (
        <View className="debug-panel">
          <Text className="debug-title">📋 调试日志</Text>
          <Text className="debug-content">{debugInfo}</Text>
        </View>
      )}

      {/* Info bar */}
      <View className="info-bar">
        <Text className="info-text">ARToolKit + Three.js | Hiro Marker | v{BUILD_VERSION}</Text>
      </View>
    </View>
  )
}
