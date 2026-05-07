/**
 * WebAR 页面 - 图像识别 + 3D 模型叠加
 * 基于 AR.js + Three.js
 *
 * 【保留 BlackHole SDK 接口注释】如需恢复黑洞引擎，注释掉下方 AR 代码段，
 * 取消 src/components/blackhole-loader.ts 的引用即可。
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './viewer.scss'

// ─── AR 场景类型声明 ───────────────────────────────────────────────────────
declare const ARjs: any

type ARStatus =
  | 'idle'
  | 'camera-requesting'
  | 'camera-denied'
  | 'ar-inited'
  | 'marker-detected'
  | 'model-loading'
  | 'model-ready'
  | 'error'

const MODEL_URL = '/models/test.fbx'
const MARKER_URL = '/images/marker.png'   // 识别图（需自行放置）
const DEFAULT_MARKER_PATTERN = 'https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/images/hiro.png'

export default function Viewer() {
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const arMarkerRef = useRef<any>(null)
  const mixerRef = useRef<any>(null)
  const clockRef = useRef<any>(null)
  const animationIdRef = useRef<number>(0)
  const modelGroupRef = useRef<any>(null)

  const [status, setStatus] = useState<ARStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')
  const [markerFound, setMarkerFound] = useState(false)

  // ─── 初始化 AR 场景 ────────────────────────────────────────────────────
  const initAR = async () => {
    try {
      setStatus('camera-requesting')
      setProgress('请求摄像头权限...')

      // 动态 import Three.js（避免 SSR 报错）
      const THREE = await import('three')
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

      // 动态加载 AR.js（通过 CDN script 注入）
      await loadARjsScript()

      // ── 获取 DOM 元素 ──────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.shadowMap.enabled = true

      const container = document.getElementById('ar-container')
      if (!container) throw new Error('找不到 #ar-container')
      container.appendChild(renderer.domElement)

      // ── 场景 & 相机 ────────────────────────────────────────────────
      const scene = new THREE.Scene()
      const camera = new THREE.Camera()

      // 光照
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
      dirLight.position.set(2, 4, 3)
      dirLight.castShadow = true
      scene.add(dirLight)

      // ── AR 控制器 ─────────────────────────────────────────────────
      // sourceType: webcam | video | image
      const arSession = await ARjs.init({
        renderer,
        scene,
        camera,
        sourceType: 'webcam',
        detectionMode: 'mono_and_matrix',
        matrixCodeType: '3x3',
        // patternRatio: 0.7,
        debugUIEnabled: false,
        maxDetectionRate: 60,
        canvasWidth: window.innerWidth,
        canvasHeight: window.innerHeight,
      })

      // 隐藏 AR.js 默认的黄框调试覆盖层
      arSession.parameters.sourceVideoElement.style.opacity = '0'
      arSession.parameters.sourceVideoElement.style.position = 'fixed'
      arSession.parameters.sourceVideoElement.style.top = '0'
      arSession.parameters.sourceVideoElement.style.left = '0'

      // ── 识别图（图像模式，检测指定图片）────────────────────────────
      // 如使用 Hiro/Kanji 等内置图案，改为 patternUrl
      // const markerControls = new ARjs.MarkerControls(arSession, camera, {
      //   type: 'pattern',
      //   patternUrl: DEFAULT_MARKER_PATTERN,
      //   changeMatrixMode: 'cameraTransformMatrix',
      // })

      // ── 自动模式（检测任意平面/图像）───────────────────────────────
      // 当前使用 ARjs 默认的 Hiro 图案识别
      const markerControls = new ARjs.MarkerControls(arSession, camera, {
        type: 'pattern',
        patternUrl: DEFAULT_MARKER_PATTERN,
        changeMatrixMode: 'cameraTransformMatrix',
        minConfidence: 0.7,
      } as any)

      markerControls.addEventListener('markerFound', () => {
        console.log('[AR] ✅ Marker detected')
        setMarkerFound(true)
        if (modelGroupRef.current) modelGroupRef.current.visible = true
        Taro.showToast({ title: '识别到标记！', icon: 'success', duration: 1000 })
      })

      markerControls.addEventListener('markerLost', () => {
        console.log('[AR] 🔍 Marker lost')
        setMarkerFound(false)
        if (modelGroupRef.current) modelGroupRef.current.visible = false
      })

      rendererRef.current = renderer
      sceneRef.current = scene
      cameraRef.current = camera
      arMarkerRef.current = markerControls

      // ── 加载 FBX 模型 ──────────────────────────────────────────────
      setStatus('model-loading')
      setProgress('加载模型...')
      setStatus('model-loading')

      const loader = new FBXLoader()
      loader.load(
        MODEL_URL,
        (group) => {
          console.log('[AR] FBX loaded, children:', group.children.length)

          // 自动居中 + 缩放适配
          const box = new THREE.Box3().setFromObject(group)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          const scale = 1.0 / maxDim * 1.5  // 适配到约 1.5 单位
          group.scale.setScalar(scale)

          // 底部对齐 y=0
          group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

          // 默认隐藏，等待 marker 检测到再显示
          group.visible = false
          group.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          modelGroupRef.current = group
          scene.add(group)

          // 动画混合器
          if (group.animations && group.animations.length > 0) {
            mixerRef.current = new THREE.AnimationMixer(group)
            mixerRef.current.clipAction(group.animations[0]).play()
          }

          clockRef.current = new THREE.Clock()

          setStatus('model-ready')
          setProgress('')
          Taro.showToast({ title: '模型加载完成', icon: 'success', duration: 1500 })

          // 开始渲染循环
          animate()
        },
        (xhr) => {
          const pct = Math.round((xhr.loaded / xhr.total) * 100)
          setProgress(`加载模型 ${pct}%`)
        },
        (err) => {
          console.error('[AR] FBX load error:', err)
          setStatus('error')
          setErrorMsg('FBX 模型加载失败: ' + (err?.message || String(err)))
        }
      )

      // ── 渲染循环 ──────────────────────────────────────────────────
      function animate() {
        animationIdRef.current = requestAnimationFrame(animate)
        const delta = clockRef.current?.getDelta() || 0
        mixerRef.current?.update(delta)
        renderer.render(scene, camera)
      }

      setStatus('ar-inited')

    } catch (err: any) {
      console.error('[AR] Init error:', err)
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setStatus('camera-denied')
        setErrorMsg('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问')
      } else {
        setStatus('error')
        setErrorMsg(err?.message || String(err))
      }
    }
  }

  // ─── 加载 AR.js CDN Script ──────────────────────────────────────────────
  const loadARjsScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 避免重复加载
      if (typeof ARjs !== 'undefined') { resolve(); return }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/ar.js@2.2.2/three.js/build/ar.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('AR.js CDN 加载失败，请检查网络'))
      document.head.appendChild(script)
    })
  }

  // ─── 重置 ───────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    if (rendererRef.current) {
      rendererRef.current.dispose()
      const canvas = rendererRef.current.domElement
      canvas?.parentElement?.removeChild(canvas)
    }
    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    arMarkerRef.current = null
    mixerRef.current = null
    modelGroupRef.current = null
    setStatus('idle')
    setErrorMsg('')
    setProgress('')
    setMarkerFound(false)
  }

  // ─── 清理 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
      rendererRef.current?.dispose()
    }
  }, [])

  // ─── 状态映射 ───────────────────────────────────────────────────────────
  const statusLabel: Record<ARStatus, string> = {
    idle: '待启动',
    'camera-requesting': '请求摄像头',
    'camera-denied': '权限被拒',
    'ar-inited': 'AR 已就绪',
    'marker-detected': '识别到标记',
    'model-loading': '加载模型',
    'model-ready': '运行中',
    error: '错误',
  }

  const canStart = status === 'idle'

  return (
    <View className="viewer-page">
      {/* ── AR 渲染容器 ────────────────────────────────────────────── */}
      <View id="ar-container" className="ar-container" />

      {/* ── 摄像头预览覆盖层 ──────────────────────────────────────── */}
      <View className="camera-hint">
        <Text className="hint-text">📷 AR 需摄像头权限，请对准识别图</Text>
        <Text className="hint-hint">推荐用 Hiro 图案（手机屏幕显示 https://git.io/fxZH2）</Text>
      </View>

      {/* ── 状态悬浮层 ────────────────────────────────────────────── */}
      {(status === 'camera-requesting' || status === 'model-loading') && (
        <View className="status-overlay">
          <View className="loading-spinner" />
          <Text className="status-text">{statusLabel[status]}</Text>
          {progress && <Text className="progress-text">{progress}</Text>}
        </View>
      )}

      {status === 'camera-denied' && (
        <View className="status-overlay error">
          <Text className="status-text">📵 {statusLabel[status]}</Text>
          <Text className="progress-text">{errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>点击下方「重新启动」按钮重试</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="status-overlay error">
          <Text className="status-text">❌ {errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>点击下方「重新启动」按钮</Text>
        </View>
      )}

      {/* ── 模型控制栏 ────────────────────────────────────────────── */}
      <View className="control-bar">
        <View className="status-row">
          <View className={`status-dot ${
            status === 'model-ready' ? 'green' :
            status === 'error' || status === 'camera-denied' ? 'red' :
            'yellow'
          }`} />
          <Text className="status-label">{statusLabel[status]}</Text>
          {markerFound && (
            <Text className="marker-badge">🎯 识别图已追踪</Text>
          )}
          {progress && (
            <Text className="progress-label">{progress}</Text>
          )}
        </View>

        <View className="btn-group">
          {canStart && (
            <View className="btn primary" onClick={initAR}>启动 AR</View>
          )}
          {['camera-denied', 'error', 'model-ready', 'ar-inited'].includes(status) && (
            <View className="btn warn" onClick={handleReset}>重新启动</View>
          )}
        </View>
      </View>

      {/* ── 模型加载完成后手势提示 ───────────────────────────────── */}
      {status === 'model-ready' && (
        <View className="gesture-hints">
          <Text className="hint">👆 单指旋转 | 🤏 双指缩放平移</Text>
        </View>
      )}

      {/* ── 模型信息 ─────────────────────────────────────────────── */}
      <View className="info-bar">
        <Text className="info-text">
          📦 {MODEL_URL} | BlackHole SDK 接口已保留（备用）
        </Text>
      </View>
    </View>
  )
}
