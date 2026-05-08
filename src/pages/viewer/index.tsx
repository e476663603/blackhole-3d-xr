/**
 * WebAR 页面 — WebXR inline 模式 + hit-test 平面检测
 * 
 * 技术栈：
 * - WebXR Device API (inline 模式) → AR 会话（magic window）
 * - XRHitTestSource → 现实平面检测，模型放置在检测到的平面上
 * - Three.js → 3D 渲染（FBX 模型）
 * - getUserMedia 降级 → 设备不支持 WebXR 时的保底方案
 * 
 * 策略优先级：
 * 1. WebXR immersive-ar + hit-test（最佳体验，需设备支持）
 * 2. WebXR inline + hit-test（magic window，大多数手机支持）
 * 3. getUserMedia + Three.js（保底，纯摄像头叠加）
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './viewer.scss'

type ARStatus =
  | 'idle'
  | 'checking-xr'
  | 'xr-starting'
  | 'camera-requesting'
  | 'ar-inited'
  | 'hit-testing'
  | 'model-loading'
  | 'model-ready'
  | 'fallback'
  | 'camera-denied'
  | 'error'

type XRMode = 'none' | 'immersive-ar' | 'inline' | 'fallback'

const MODEL_URL = '/models/test.fbx'
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
  const xrSessionRef = useRef<XRSession | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const reticleRef = useRef<any>(null)

  const [status, setStatus] = useState<ARStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [progress, setProgress] = useState('')
  const [xrMode, setXRMode] = useState<XRMode>('none')
  const [debugInfo, setDebugInfo] = useState('')

  const addDebug = (msg: string) => {
    const t = new Date().toLocaleTimeString()
    setDebugInfo(prev => prev ? `${prev}\n[${t}] ${msg}` : `[${t}] ${msg}`)
    console.log(`[XR] ${msg}`)
  }

  // ─── 清理资源 ────────────────────────────────────────────────────────────
  const cleanup = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current)
      animationIdRef.current = 0
    }

    // 结束 XR session
    if (xrSessionRef.current) {
      try { xrSessionRef.current.end() } catch {}
      xrSessionRef.current = null
    }
    if (hitTestSourceRef.current) {
      try { hitTestSourceRef.current.cancel() } catch {}
      hitTestSourceRef.current = null
    }

    // 停止摄像头
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }
      videoRef.current.remove()
      videoRef.current = null
    }

    // 清理渲染器
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current.xr.enabled = false
      const canvas = rendererRef.current.domElement
      canvas?.parentElement?.removeChild(canvas)
    }

    rendererRef.current = null
    sceneRef.current = null
    cameraRef.current = null
    mixerRef.current = null
    modelGroupRef.current = null
    clockRef.current = null
    reticleRef.current = null

    setStatus('idle')
    setErrorMsg('')
    setProgress('')
    setXRMode('none')
    setDebugInfo('')
  }

  // ─── 启动 AR ─────────────────────────────────────────────────────────────
  const initAR = async () => {
    try {
      setErrorMsg('')
      setDebugInfo('')
      setStatus('checking-xr')
      setProgress('检测 WebXR 支持...')

      const THREE = await import('three')
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')

      // ═══ 第一步：检测 WebXR 支持情况 ═══
      const xrSupported = !!navigator.xr
      addDebug(`navigator.xr 存在: ${xrSupported}`)

      let immersiveARSupported = false
      let inlineSupported = false

      if (xrSupported) {
        try {
          immersiveARSupported = await navigator.xr!.isSessionSupported('immersive-ar')
          addDebug(`immersive-ar 支持: ${immersiveARSupported}`)
        } catch (e: any) {
          addDebug(`immersive-ar 检测异常: ${e.message}`)
        }

        try {
          inlineSupported = await navigator.xr!.isSessionSupported('inline')
          addDebug(`inline 支持: ${inlineSupported}`)
        } catch (e: any) {
          addDebug(`inline 检测异常: ${e.message}`)
        }
      }

      // ═══ 第二步：按优先级选择 XR 模式 ═══
      let chosenMode: XRMode = 'fallback'
      let sessionMode: XRSessionMode = 'inline'

      if (immersiveARSupported) {
        chosenMode = 'immersive-ar'
        sessionMode = 'immersive-ar'
        addDebug('选择 immersive-ar 模式')
      } else if (inlineSupported) {
        chosenMode = 'inline'
        sessionMode = 'inline'
        addDebug('选择 inline 模式 (magic window)')
      } else {
        chosenMode = 'fallback'
        addDebug('WebXR 不可用，使用 getUserMedia 降级')
      }

      setXRMode(chosenMode)

      // ═══ 第三步：创建 Three.js 场景 ═══
      const container = document.getElementById('ar-container')
      if (!container) throw new Error('找不到 #ar-container')

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        1000
      )
      camera.position.set(0, 1.6, 3) // 人眼高度

      // 光照
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
      dirLight.position.set(5, 10, 7)
      scene.add(dirLight)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
      fillLight.position.set(-5, 3, -5)
      scene.add(fillLight)

      sceneRef.current = scene
      cameraRef.current = camera

      // ═══ 创建 hit-test 标记圆环 ═══
      const reticleGeom = new THREE.RingGeometry(0.08, 0.1, 32)
      reticleGeom.rotateX(-Math.PI / 2)
      const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 })
      const reticle = new THREE.Mesh(reticleGeom, reticleMat)
      reticle.visible = false
      reticle.matrixAutoUpdate = false
      scene.add(reticle)
      reticleRef.current = reticle

      // ═══ 第四步A：WebXR 路径 ═══
      if (chosenMode !== 'fallback') {
        setStatus('xr-starting')
        setProgress(`启动 ${chosenMode} 会话...`)

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.xr.enabled = true
        renderer.domElement.style.cssText = `
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          z-index: 1;
        `
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        try {
          // inline 模式也需要摄像头，这里先获取
          if (chosenMode === 'inline') {
            setStatus('camera-requesting')
            setProgress('请求摄像头权限...')
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            })
            const video = document.createElement('video')
            video.srcObject = stream
            video.setAttribute('playsinline', '')
            video.setAttribute('webkit-playsinline', '')
            video.muted = true
            video.style.cssText = `
              position: fixed; top: 0; left: 0;
              width: 100%; height: 100%;
              object-fit: cover; z-index: 0;
            `
            document.body.appendChild(video)
            videoRef.current = video
            await video.play()
            addDebug('摄像头已启动（inline 模式背景）')

            // 视频作为场景背景
            const videoTexture = new THREE.VideoTexture(video)
            videoTexture.minFilter = THREE.LinearFilter
            const bgGeom = new THREE.PlaneGeometry(2, 2)
            const bgMat = new THREE.MeshBasicMaterial({ map: videoTexture, depthWrite: false })
            const bgMesh = new THREE.Mesh(bgGeom, bgMat)
            bgMesh.renderOrder = -1
            bgMesh.onBeforeRender = (r: any) => {
              // 让背景平面始终填满相机视野
              bgMesh.position.copy(r.xr.getCamera(camera).position)
              bgMesh.quaternion.copy(r.xr.getCamera(camera).quaternion)
              bgMesh.translateZ(-0.5)
            }
            scene.add(bgMesh)
          }

          // 请求 XR session
          const session = await navigator.xr!.requestSession(sessionMode, {
            requiredFeatures: chosenMode === 'immersive-ar' ? ['local-floor'] : [],
            optionalFeatures: ['hit-test', 'dom-overlay', 'light-estimation'],
            // inline 模式的 domOverlay 配置
            ...(chosenMode === 'inline' ? {} : {}),
          })

          xrSessionRef.current = session
          addDebug(`XR ${chosenMode} 会话已创建`)

          const refSpaceType = chosenMode === 'immersive-ar' ? 'local-floor' : 'viewer'
          const refSpace = await session.requestReferenceSpace(refSpaceType)
          addDebug(`参考空间 ${refSpaceType} 已获取`)

          await renderer.xr.setSession(session)
          renderer.xr.setReferenceSpaceType(refSpaceType)

          // ═══ 设置 hit-test ═══
          let hitTestActive = false
          try {
            if ('requestHitTestSource' in session) {
              const viewerSpace = await session.requestReferenceSpace('viewer')
              const hitTestSource = await session.requestHitTestSource!({
                space: viewerSpace,
                entityTypes: ['plane', 'point'],
              })
              hitTestSourceRef.current = hitTestSource
              hitTestActive = true
              addDebug('hit-test 已启用')
            } else {
              addDebug('hit-test 不可用（浏览器不支持 requestHitTestSource）')
            }
          } catch (e: any) {
            addDebug(`hit-test 启用失败: ${e.message}`)
          }

          setStatus('ar-inited')
          setProgress('加载 FBX 模型...')

          // ═══ 加载模型 ═══
          setStatus('model-loading')
          const loader = new FBXLoader()
          loader.load(
            MODEL_URL,
            (group) => {
              addDebug(`FBX 加载完成, 子对象: ${group.children.length}`)

              const box = new THREE.Box3().setFromObject(group)
              const center = box.getCenter(new THREE.Vector3())
              const size = box.getSize(new THREE.Vector3())
              const maxDim = Math.max(size.x, size.y, size.z)
              const scale = 1.0 / maxDim
              group.scale.setScalar(scale)
              group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

              group.traverse((child: any) => {
                if (child.isMesh) {
                  child.castShadow = true
                  child.receiveShadow = true
                }
              })

              // 初始位置：相机前方 2 米
              group.position.set(0, 0, -2)
              modelGroupRef.current = group
              scene.add(group)

              if (group.animations && group.animations.length > 0) {
                mixerRef.current = new THREE.AnimationMixer(group)
                mixerRef.current.clipAction(group.animations[0]).play()
              }
              clockRef.current = new THREE.Clock()

              setStatus(hitTestActive ? 'hit-testing' : 'model-ready')
              setProgress(hitTestActive ? '点击画面放置模型到检测到的平面' : '')
              Taro.showToast({ title: '模型加载完成', icon: 'success', duration: 1500 })

              // XR 渲染循环
              renderer.setAnimationLoop((timestamp: number, frame?: XRFrame) => {
                if (frame && hitTestSourceRef.current && reticle) {
                  const results = frame.getHitTestResults(hitTestSourceRef.current)
                  if (results.length > 0) {
                    const hit = results[0]
                    const hitPose = hit.getHitPose(refSpace)
                    if (hitPose) {
                      reticle.visible = true
                      reticle.matrix.fromArray(hitPose.transform.matrix)

                      // 点击放置模型
                      if (status === 'hit-testing' || modelGroupRef.current) {
                        // 模型跟随 hit-test 位置
                        const pos = new THREE.Vector3()
                        pos.setFromMatrixPosition(reticle.matrix)
                        if (modelGroupRef.current) {
                          modelGroupRef.current.position.copy(pos)
                          modelGroupRef.current.position.y += 0.1 // 稍微抬高
                        }
                      }
                      if (status === 'hit-testing') {
                        setStatus('model-ready')
                        setProgress('')
                        addDebug('模型已放置到检测平面')
                      }
                    }
                  }
                }

                const delta = clockRef.current?.getDelta() || 0
                mixerRef.current?.update(delta)
                renderer.render(scene, camera)
              })
            },
            (xhr) => {
              const pct = xhr.total > 0 ? Math.round((xhr.loaded / xhr.total) * 100) : 0
              setProgress(`加载模型 ${pct}%`)
            },
            (err) => {
              addDebug(`FBX 加载失败: ${err}`)
              setStatus('error')
              setErrorMsg('FBX 模型加载失败: ' + (err?.message || String(err)))
            }
          )

          // session 结束事件
          session.addEventListener('end', () => {
            addDebug('XR 会话已结束')
            cleanup()
          })

        } catch (xrErr: any) {
          addDebug(`XR 会话失败: ${xrErr.name}: ${xrErr.message}`)
          
          // 如果 immersive-ar 失败，尝试 inline
          if (chosenMode === 'immersive-ar') {
            addDebug('immersive-ar 失败，降级到 inline 模式...')
            setXRMode('inline')
            // 重新走 inline 流程
            cleanup()
            initInlineMode(THREE, FBXLoader, container)
            return
          }

          // inline 也失败，降级到 getUserMedia
          addDebug('WebXR 失败，降级到 getUserMedia...')
          cleanup()
          initFallbackMode(THREE, FBXLoader)
          return
        }
        return
      }

      // ═══ 第四步B：getUserMedia 降级路径 ═══
      initFallbackMode(THREE, FBXLoader)

    } catch (err: any) {
      console.error('[AR] Init error:', err)
      addDebug(`致命错误: ${err.message}`)
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setStatus('camera-denied')
        setErrorMsg('摄像头权限被拒绝，请在浏览器设置中允许摄像头访问')
      } else {
        setStatus('error')
        setErrorMsg(err?.message || String(err))
      }
    }
  }

  // ─── inline 模式启动（从 immersive-ar 降级）─────────────────────────────
  const initInlineMode = async (THREE: any, FBXLoader: any, container: HTMLElement) => {
    try {
      setStatus('camera-requesting')
      setProgress('请求摄像头权限（inline 模式）...')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.muted = true
      video.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover; z-index: 0;
      `
      document.body.appendChild(video)
      videoRef.current = video
      await video.play()
      addDebug('摄像头已启动（inline 降级）')

      const scene = sceneRef.current
      const camera = cameraRef.current

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.xr.enabled = true
      renderer.domElement.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 1;
      `
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      // inline session
      const session = await navigator.xr!.requestSession('inline', {
        optionalFeatures: ['hit-test'],
      })
      xrSessionRef.current = session
      addDebug('inline 会话已创建（降级）')

      const refSpace = await session.requestReferenceSpace('viewer')
      await renderer.xr.setSession(session)
      renderer.xr.setReferenceSpaceType('viewer')

      // hit-test
      let hitTestActive = false
      try {
        if ('requestHitTestSource' in session) {
          const viewerSpace = await session.requestReferenceSpace('viewer')
          const hitTestSource = await session.requestHitTestSource!({
            space: viewerSpace,
            entityTypes: ['plane', 'point'],
          })
          hitTestSourceRef.current = hitTestSource
          hitTestActive = true
          addDebug('hit-test 已启用（inline 降级）')
        }
      } catch (e: any) {
        addDebug(`hit-test 失败（inline）: ${e.message}`)
      }

      setStatus('model-loading')
      setProgress('加载 FBX 模型...')

      loadAndStartModel(THREE, FBXLoader, renderer, scene, camera, refSpace, hitTestActive)
    } catch (err: any) {
      addDebug(`inline 模式也失败: ${err.message}`)
      initFallbackMode(THREE, FBXLoader)
    }
  }

  // ─── getUserMedia 降级模式 ─────────────────────────────────────────────
  const initFallbackMode = async (THREE: any, FBXLoader: any) => {
    setXRMode('fallback')
    addDebug('使用 getUserMedia 降级模式')

    try {
      setStatus('camera-requesting')
      setProgress('请求摄像头权限...')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.muted = true
      video.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover; z-index: 0;
      `
      document.body.appendChild(video)
      videoRef.current = video
      await video.play()

      setProgress('摄像头已启动，初始化 3D 场景...')

      const container = document.getElementById('ar-container')
      if (!container) throw new Error('找不到 #ar-container')

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 2000)
      camera.position.set(0, 0, 5)

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
      dirLight.position.set(3, 5, 4)
      scene.add(dirLight)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
      fillLight.position.set(-3, 2, -4)
      scene.add(fillLight)

      sceneRef.current = scene
      cameraRef.current = camera

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.domElement.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 1; pointer-events: none;
      `
      container.appendChild(renderer.domElement)
      rendererRef.current = renderer

      setStatus('model-loading')
      setProgress('加载 FBX 模型...')

      const loader = new FBXLoader()
      loader.load(
        MODEL_URL,
        (group) => {
          addDebug(`FBX 加载完成（降级模式）`)

          const box = new THREE.Box3().setFromObject(group)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          const scale = 1.5 / maxDim
          group.scale.setScalar(scale)
          group.position.set(-center.x * scale, -box.min.y * scale - 0.3, -center.z * scale)

          group.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          modelGroupRef.current = group
          scene.add(group)

          if (group.animations && group.animations.length > 0) {
            mixerRef.current = new THREE.AnimationMixer(group)
            mixerRef.current.clipAction(group.animations[0]).play()
          }
          clockRef.current = new THREE.Clock()

          setStatus('model-ready')
          setProgress('')
          Taro.showToast({ title: '模型加载完成（降级模式）', icon: 'success', duration: 1500 })

          function animate() {
            animationIdRef.current = requestAnimationFrame(animate)
            const delta = clockRef.current?.getDelta() || 0
            mixerRef.current?.update(delta)
            renderer.render(scene, camera)
          }
          animate()
        },
        (xhr) => {
          const pct = xhr.total > 0 ? Math.round((xhr.loaded / xhr.total) * 100) : 0
          setProgress(`加载模型 ${pct}%`)
        },
        (err) => {
          addDebug(`FBX 加载失败: ${err}`)
          setStatus('error')
          setErrorMsg('FBX 模型加载失败: ' + (err?.message || String(err)))
        }
      )
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setStatus('camera-denied')
        setErrorMsg('摄像头权限被拒绝')
      } else {
        setStatus('error')
        setErrorMsg(err?.message || String(err))
      }
    }
  }

  // ─── 模型加载 + XR 渲染循环通用方法 ─────────────────────────────────────
  const loadAndStartModel = (
    THREE: any, FBXLoader: any,
    renderer: any, scene: any, camera: any,
    refSpace: XRReferenceSpace, hitTestActive: boolean
  ) => {
    const loader = new FBXLoader()
    loader.load(
      MODEL_URL,
      (group) => {
        addDebug(`FBX 加载完成, 子对象: ${group.children.length}`)

        const box = new THREE.Box3().setFromObject(group)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 1.0 / maxDim
        group.scale.setScalar(scale)
        group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)

        group.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // 初始位置：相机前方 2 米
        group.position.set(0, 0, -2)
        modelGroupRef.current = group
        scene.add(group)

        if (group.animations && group.animations.length > 0) {
          mixerRef.current = new THREE.AnimationMixer(group)
          mixerRef.current.clipAction(group.animations[0]).play()
        }
        clockRef.current = new THREE.Clock()

        setStatus(hitTestActive ? 'hit-testing' : 'model-ready')
        setProgress(hitTestActive ? '点击画面放置模型到检测平面' : '')
        Taro.showToast({ title: '模型加载完成', icon: 'success', duration: 1500 })

        renderer.setAnimationLoop((timestamp: number, frame?: XRFrame) => {
          if (frame && hitTestSourceRef.current && reticleRef.current) {
            const results = frame.getHitTestResults(hitTestSourceRef.current)
            if (results.length > 0) {
              const hit = results[0]
              const hitPose = hit.getHitPose(refSpace)
              if (hitPose) {
                reticleRef.current.visible = true
                reticleRef.current.matrix.fromArray(hitPose.transform.matrix)

                const pos = new THREE.Vector3()
                pos.setFromMatrixPosition(reticleRef.current.matrix)
                if (modelGroupRef.current) {
                  modelGroupRef.current.position.copy(pos)
                  modelGroupRef.current.position.y += 0.1
                }
                if (status === 'hit-testing') {
                  setStatus('model-ready')
                  setProgress('')
                  addDebug('模型已放置到检测平面')
                }
              }
            }
          }

          const delta = clockRef.current?.getDelta() || 0
          mixerRef.current?.update(delta)
          renderer.render(scene, camera)
        })
      },
      (xhr) => {
        const pct = xhr.total > 0 ? Math.round((xhr.loaded / xhr.total) * 100) : 0
        setProgress(`加载模型 ${pct}%`)
      },
      (err) => {
        addDebug(`FBX 加载失败: ${err}`)
        setStatus('error')
        setErrorMsg('FBX 模型加载失败: ' + (err?.message || String(err)))
      }
    )
  }

  // ─── 重置 ───────────────────────────────────────────────────────────────
  const handleReset = () => {
    cleanup()
  }

  // ─── 组件卸载清理 ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  // ─── 状态映射 ───────────────────────────────────────────────────────────
  const statusLabel: Record<ARStatus, string> = {
    idle: '待启动',
    'checking-xr': '检测 WebXR',
    'xr-starting': '启动 XR',
    'camera-requesting': '请求摄像头',
    'ar-inited': 'AR 已就绪',
    'hit-testing': '平面检测中',
    'model-loading': '加载模型',
    'model-ready': '运行中',
    fallback: '降级模式',
    'camera-denied': '权限被拒',
    error: '错误',
  }

  const modeLabel: Record<XRMode, string> = {
    none: '',
    'immersive-ar': '🥽 Immersive AR',
    inline: '📱 Inline XR',
    fallback: '📷 降级模式',
  }

  const canStart = status === 'idle'

  return (
    <View className="viewer-page">
      {/* AR 渲染容器 */}
      <View id="ar-container" className="ar-container" />

      {/* 版本号徽章 */}
      <View className="version-badge">
        <Text className="version-text">v{BUILD_VERSION}</Text>
      </View>

      {/* XR 模式指示器 */}
      {xrMode !== 'none' && (
        <View className="xr-mode-badge">
          <Text className="xr-mode-text">{modeLabel[xrMode]}</Text>
        </View>
      )}

      {/* 摄像头提示（仅 idle 状态） */}
      {status === 'idle' && (
        <View className="camera-hint">
          <Text className="hint-text">🥽 WebXR AR 体验</Text>
          <Text className="hint-hint">点击「启动 AR」开始</Text>
        </View>
      )}

      {/* 状态悬浮层 — 加载中 */}
      {(status === 'checking-xr' || status === 'xr-starting' || status === 'camera-requesting' || status === 'model-loading') && (
        <View className="status-overlay">
          <View className="loading-spinner" />
          <Text className="status-text">{statusLabel[status]}</Text>
          {progress && <Text className="progress-text">{progress}</Text>}
        </View>
      )}

      {/* hit-testing 提示 */}
      {status === 'hit-testing' && (
        <View className="hit-test-overlay">
          <View className="hit-test-hint">
            <Text className="hit-test-text">🎯 扫描周围平面...</Text>
            <Text className="hit-test-sub">移动手机缓慢扫描，检测到平面后模型将自动放置</Text>
          </View>
        </View>
      )}

      {/* 摄像头被拒 */}
      {status === 'camera-denied' && (
        <View className="status-overlay error">
          <Text className="status-text">📵 摄像头权限被拒绝</Text>
          <Text className="progress-text">{errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>请在浏览器设置中允许摄像头访问后重试</Text>
        </View>
      )}

      {/* 错误 */}
      {status === 'error' && (
        <View className="status-overlay error">
          <Text className="status-text">❌ 错误</Text>
          <Text className="progress-text">{errorMsg}</Text>
          <Text className="progress-text" style={{ marginTop: 8 }}>点击「重新启动」重试</Text>
        </View>
      )}

      {/* 运行中提示 */}
      {status === 'model-ready' && (
        <View className="gesture-hints">
          <Text className="hint">✅ AR 运行中 — {modeLabel[xrMode]}</Text>
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
          {xrMode !== 'none' && <Text className="marker-badge">{modeLabel[xrMode]}</Text>}
          {progress && <Text className="progress-label">{progress}</Text>}
        </View>

        <View className="btn-group">
          {canStart && (
            <View className="btn primary" onClick={initAR}>启动 AR</View>
          )}
          {['camera-denied', 'error', 'model-ready', 'ar-inited', 'hit-testing'].includes(status) && (
            <View className="btn warn" onClick={handleReset}>重新启动</View>
          )}
        </View>
      </View>

      {/* 调试信息（可展开） */}
      {debugInfo && (
        <View className="debug-panel">
          <Text className="debug-title">📋 调试日志</Text>
          <Text className="debug-content">{debugInfo}</Text>
        </View>
      )}

      {/* 信息栏 */}
      <View className="info-bar">
        <Text className="info-text">WebXR + Three.js | {MODEL_URL}</Text>
      </View>
    </View>
  )
}
