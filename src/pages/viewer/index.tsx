/**
 * WebAR 页面 - 摄像头 + Three.js 3D 模型叠加
 * 纯原生实现，不依赖 AR.js
 *
 * 技术栈：
 * - navigator.mediaDevices.getUserMedia → 摄像头视频流
 * - Three.js → 3D 渲染（FBX 模型）
 * - 视频背景 + WebGL 场景叠加
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './viewer.scss'

type ARStatus =
  | 'idle'
  | 'camera-requesting'
  | 'camera-denied'
  | 'ar-inited'
  | 'model-loading'
  | 'model-ready'
  | 'error'

const MODEL_URL = '/models/test.fbx'

export default function Viewer() {
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const mixerRef = useRef<any>(null)
  const clockRef = useRef<any>(null)
  const animationIdRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const modelGroupRef = useRef<any>(null)

  const [status, setStatus] = useState<ARStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')

  // ─── 初始化 AR 场景 ────────────────────────────────────────────────────
  const initAR = async () => {
    try {
      setStatus('camera-requesting')
      setProgress('请求摄像头权限...')

      // ═══ 1. 获取摄像头视频流 ═══
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // 后置摄像头
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      // 创建 video 元素播放流
      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '') // iOS 内联播放
        video.setAttribute('webkit-playsinline', '')
      video.muted = true
      video.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 0;
      `
      document.body.appendChild(video)
      videoRef.current = video
      await video.play()

      setProgress('摄像头已启动，初始化 3D 场景...')

      // ═══ 2. 动态加载 Three.js ═══
      const THREE = await import('three')
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

      // ═══ 3. 创建渲染器 ═══
      const container = document.getElementById('ar-container')
      if (!container) throw new Error('找不到 #ar-container')

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.domElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
      `
      container.appendChild(renderer.domElement)

      // ═══ 4. 场景 & 相机 ═══
      const scene = new THREE.Scene()
      // 用透视相机模拟真实世界视角
      const camera = new THREE.PerspectiveCamera(
        60, // FOV
        window.innerWidth / window.innerHeight,
        0.01,
        2000
      )
      camera.position.z = 5

      // 光照
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
      dirLight.position.set(3, 5, 4)
      dirLight.castShadow = true
      scene.add(dirLight)

      // 补光
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
      fillLight.position.set(-3, 2, -4)
      scene.add(fillLight)

      // ═══ 5. 视频纹理作为背景（可选，video 已是 CSS 背景）═══
      // 如果需要将视频作为 WebGL 背景，取消下方注释：
      /*
      const videoTexture = new THREE.VideoTexture(video)
      videoTexture.minFilter = THREE.LinearFilter
      videoTexture.magFilter = THREE.LinearFilter
      videoTexture.format = THREE.RGBFormat
      const bgPlane = new THREE.PlaneGeometry(2, 2)
      const bgMaterial = new THREE.MeshBasicMaterial({ map: videoTexture })
      const bgMesh = new THREE.Mesh(bgPlane, bgMaterial)
      bgMesh.position.z = -10
      scene.add(bgMesh)
      */

      rendererRef.current = renderer
      sceneRef.current = scene
      cameraRef.current = camera

      setStatus('ar-inited')
      setProgress('加载 FBX 模型...')

      // ═══ 6. 加载 FBX 模型 ═══
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
          const scale = 1.5 / maxDim
          group.scale.setScalar(scale)

          // 居中放置在画面中心偏下位置
          group.position.set(-center.x * scale, -box.min.y * scale - 0.3, -center.z * scale)

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

      // ═══ 7. 渲染循环 ═══
      function animate() {
        animationIdRef.current = requestAnimationFrame(animate)
        const delta = clockRef.current?.getDelta() || 0
        mixerRef.current?.update(delta)
        renderer.render(scene, camera)
      }

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

  // ─── 重置 ───────────────────────────────────────────────────────────────
  const handleReset = () => {
    // 停止动画
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)

    // 停止摄像头
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
      videoRef.current.remove()
    }
    videoRef.current = null

    // 清理渲染器
    if (rendererRef.current) {
      rendererRef.current.dispose()
      const canvas = rendererRef.current.domElement
      canvas?.parentElement?.removeChild(canvas)
    }

    // 清空引用
    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    mixerRef.current = null
    modelGroupRef.current = null
    clockRef.current = null

    setStatus('idle')
    setErrorMsg('')
    setProgress('')
  }

  // ─── 组件卸载清理 ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
        videoRef.current.remove()
      }
      rendererRef.current?.dispose()
    }
  }, [])

  // ─── 状态映射 ───────────────────────────────────────────────────────────
  const statusLabel: Record<ARStatus, string> = {
    idle: '待启动',
    'camera-requesting': '请求摄像头',
    'camera-denied': '权限被拒',
    'ar-inited': 'AR 已就绪',
    'model-loading': '加载模型',
    'model-ready': '运行中',
    error: '错误',
  }

  const canStart = status === 'idle'

  return (
    <View className="viewer-page">
      {/* AR 渲染容器 */}
      <View id="ar-container" className="ar-container" />

      {/* 摄像头提示 */}
      <View className="camera-hint">
        <Text className="hint-text">📷 AR 需要摄像头权限</Text>
        <Text className="hint-hint">点击下方按钮启动</Text>
      </View>

      {/* 状态悬浮层 */}
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
          <Text className="progress-text" style={{ marginTop: 8 }}>点击「重新启动」重试</Text>
        </View>
      )}

      {status === 'error' && (
        <View className="status-overlay error">
          <Text className="status-text">❌ {errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>点击「重新启动」重试</Text>
        </View>
      )}

      {/* 控制栏 */}
      <View className="control-bar">
        <View className="status-row">
          <View className={`status-dot ${
            status === 'model-ready' ? 'green' :
            status === 'error' || status === 'camera-denied' ? 'red' :
            'yellow'
          }`} />
          <Text className="status-label">{statusLabel[status]}</Text>
          {progress && <Text className="progress-label">{progress}</Text>}
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

      {/* 运行中提示 */}
      {status === 'model-ready' && (
        <View className="gesture-hints">
          <Text className="hint">✅ AR 运行中 — 摄像头画面 + 3D 模型叠加显示</Text>
        </View>
      )}

      {/* 信息栏 */}
      <View className="info-bar">
        <Text className="info-text">📦 {MODEL_URL} | Three.js + getUserMedia</Text>
      </View>
    </View>
  )
}
