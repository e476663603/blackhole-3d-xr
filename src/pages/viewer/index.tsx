import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './viewer.scss';

const SDK_BASE = '/sdk';

// ========== SunrtCloud 数据集配置（从 XHR 请求中获取） ==========
const SDK_CONFIG = {
  commonUrl: 'https://bim.sunrtcloud.com',
  datasetId: 'b3a8f0de-2b7b-4e7a-9b3a-c1e2f8d3a4b5',
  resourcesAddress: 'https://bim.sunrtcloud.com/ModuleDir/ProjectData/b3a8f0de-2b7b-4e7a-9b3a-c1e2f8d3a4b5',
  userName: '',
  passWord: '',
};

declare global {
  interface Window {
    CreateBlackHoleWebSDK: (module: any) => void;
    CreateModuleRE2: any; // RealBIMWeb.js 导出
  }
}

type S = 'idle' | 'sdk-loading' | 'sdk-ready' | 'engine-init' | 'engine-ready' | 'model-loading' | 'model-ready' | 'error';

export default function Viewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moduleRef = useRef<any>(null);
  const [status, setStatus] = useState<S>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState('');
  const [canvasH, setCanvasH] = useState(65); // vh

  // 事件监听
  useEffect(() => {
    const onEngineCreated = (e: any) => {
      console.log('[BH] Engine created:', e.detail);
      if (e.detail.succeed) {
        setStatus('engine-ready');
        setCanvasH(65);
        Taro.showToast({ title: '引擎就绪', icon: 'success', duration: 1500 });
      } else {
        setStatus('error');
        setErrorMsg('引擎创建失败: ' + (e.detail.info || ''));
      }
    };
    const onProgress = (e: any) => {
      setProgress(`${e.detail.progress}% ${e.detail.info || ''}`);
      console.log('[BH] Progress:', e.detail.progress, e.detail.info);
    };
    const onLoadFinish = (e: any) => {
      console.log('[BH] Load finish:', e.detail);
      if (e.detail.succeed) {
        setStatus('model-ready');
        setCanvasH(65);
        Taro.showToast({ title: '模型加载完成', icon: 'success' });
      } else {
        setStatus('error');
        setErrorMsg('模型加载失败: ' + (e.detail.info || ''));
      }
    };
    const onSystemReady = () => console.log('[BH] System ready');
    const onCameraMove = () => {/* camera move log */}
    const onSelChanged = (e: any) => console.log('[BH] Selection:', e.detail);

    document.addEventListener('RESystemEngineCreated', onEngineCreated);
    document.addEventListener('REDataSetLoadProgress', onProgress);
    document.addEventListener('REDataSetLoadFinish', onLoadFinish);
    document.addEventListener('RESystemReady', onSystemReady);
    document.addEventListener('RECameraMove', onCameraMove);
    document.addEventListener('RESelectChanged', onSelChanged);

    return () => {
      document.removeEventListener('RESystemEngineCreated', onEngineCreated);
      document.removeEventListener('REDataSetLoadProgress', onProgress);
      document.removeEventListener('REDataSetLoadFinish', onLoadFinish);
      document.removeEventListener('RESystemReady', onSystemReady);
      document.removeEventListener('RECameraMove', onCameraMove);
      document.removeEventListener('RESelectChanged', onSelChanged);
    };
  }, []);

  // 加载 SDK（必须按顺序：RealBIMWeb.js → BlackHole3D.js）
  const loadSDK = useCallback(async () => {
    setStatus('sdk-loading');
    setProgress('');
    try {
      if (window.CreateBlackHoleWebSDK) { setStatus('sdk-ready'); return; }

      // Step 1: 先加载 RealBIMWeb.js（定义 CreateModuleRE2）
      setProgress('加载 RealBIMWeb.js...');
      const s1 = document.createElement('script');
      s1.src = `${SDK_BASE}/RealBIMWeb.js`;
      document.head.appendChild(s1);
      await new Promise<void>((ok, no) => {
        s1.onload = () => ok();
        s1.onerror = () => no(new Error('RealBIMWeb.js 加载失败'));
      });

      // 等待 CreateModuleRE2 就绪
      await new Promise<void>((ok, no) => {
        let elapsed = 0;
        const c = () => {
          if (window.CreateModuleRE2) { ok(); return; }
          elapsed += 100;
          if (elapsed > 10000) { no(new Error('CreateModuleRE2 未就绪超时')); return; }
          setTimeout(c, 100);
        };
        c();
      });
      console.log('[BH] RealBIMWeb.js loaded, CreateModuleRE2 ready');

      // Step 2: 再加载 BlackHole3D.js（依赖 CreateModuleRE2）
      setProgress('加载 BlackHole3D.js...');
      const s2 = document.createElement('script');
      s2.src = `${SDK_BASE}/BlackHole3D.js`;
      document.head.appendChild(s2);
      await new Promise<void>((ok, no) => {
        s2.onload = () => ok();
        s2.onerror = () => no(new Error('BlackHole3D.js 加载失败'));
      });

      // 等待 CreateBlackHoleWebSDK 就绪
      await new Promise<void>((ok, no) => {
        let elapsed = 0;
        const c = () => {
          if (window.CreateBlackHoleWebSDK) { ok(); return; }
          elapsed += 50;
          if (elapsed > 10000) { no(new Error('CreateBlackHoleWebSDK 未就绪超时')); return; }
          setTimeout(c, 50);
        };
        c();
      });

      setStatus('sdk-ready');
      Taro.showToast({ title: 'SDK 加载成功', icon: 'success', duration: 1500 });
    } catch (e: any) {
      console.error('[BH] SDK load error:', e);
      setStatus('error'); setErrorMsg(e.message || 'SDK加载失败');
    }
  }, []);

  // 初始化引擎
  const initEngine = useCallback(async () => {
    if (!window.CreateBlackHoleWebSDK) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setStatus('engine-init');
    setProgress('初始化渲染器...');

    try {
      const Module: any = {
        canvas,
        locateFile: (fn: string) => {
          if (fn.endsWith('.js') || fn.endsWith('.wasm')) return `${SDK_BASE}/${fn}`;
          return fn;
        },
        mainScriptUrlOrBlob: `${SDK_BASE}/RealBIMWeb.js`,
        print: (t: string) => console.log('[BH]', t),
        printErr: (t: string) => console.warn('[BH]', t),
        preRun: [(m: any) => {
          // 预加载 assets.bin 到内存文件系统
          try { m.FS_createPreloadedFile('/', 'assets.bin', `${SDK_BASE}/assets.bin`, true, false); } catch(e) {}
        }],
      };

      window.CreateBlackHoleWebSDK(Module);
      setProgress('加载 WASM 模块...');

      // 等待 WASM 就绪
      await new Promise<void>((ok, no) => {
        let el = 0;
        const t = setInterval(() => {
          el += 200;
          if (Module.RealBIMWeb && typeof Module.initEngineSys === 'function') {
            clearInterval(t);
            ok();
          } else if (el > 30000) {
            clearInterval(t);
            no(new Error('WASM 模块加载超时（30s）'));
          }
        }, 200);
      });

      const sysInfo = new Module.RESysInfo();
      sysInfo.workerjsPath = `${SDK_BASE}/RealBIMWeb_Worker.js`;
      sysInfo.renderWidth = canvas.clientWidth || window.innerWidth;
      sysInfo.renderHieght = canvas.clientHeight || Math.floor(window.innerHeight * 0.65);
      sysInfo.commonUrl = SDK_CONFIG.commonUrl;
      sysInfo.userName = SDK_CONFIG.userName || '';
      sysInfo.passWord = SDK_CONFIG.passWord || '';
      sysInfo.mainWndName = 'BlackHole3D';

      setProgress('启动渲染引擎...');
      const result = Module.initEngineSys(sysInfo);
      if (!result) throw new Error('initEngineSys 返回 false');

      Module.setOperationMode(1); // 触控模式
      moduleRef.current = Module;
      console.log('[BH] Engine init done, waiting for RESystemEngineCreated...');
    } catch (e: any) {
      setStatus('error'); setErrorMsg(e.message || '引擎初始化失败');
      console.error('[BH] Engine init error:', e);
    }
  }, []);

  // 加载模型
  const loadModel = useCallback(() => {
    const M = moduleRef.current;
    if (!M) return;
    setStatus('model-loading');
    setProgress('开始加载模型...');
    try {
      const ds = new M.REDataSet();
      ds.dataSetId = SDK_CONFIG.datasetId;
      ds.resourcesAddress = SDK_CONFIG.resourcesAddress;
      console.log('[BH] Loading dataset:', ds.dataSetId, ds.resourcesAddress);
      M.Model.loadDataSet([ds], true);
    } catch (e: any) {
      setStatus('error'); setErrorMsg(e.message || '模型加载异常');
    }
  }, []);

  const resetCamera = useCallback(() => {
    const M = moduleRef.current;
    if (!M) return;
    try { M.Camera.setCamLocateDefault(); } catch(e) {}
  }, []);

  const fitView = useCallback(() => {
    const M = moduleRef.current;
    if (!M) return;
    try { M.Camera.setCamLocateToBound(); } catch(e) {}
  }, []);

  const explodeView = useCallback(() => {
    const M = moduleRef.current;
    if (!M) return;
    try {
      const v = M.BIM.getDataseExplodeView(SDK_CONFIG.datasetId);
      if (v) M.Camera.setCamLocateTo(v);
    } catch(e) {}
  }, []);

  const statusMap: Record<S, string> = {
    idle: '待初始化', 'sdk-loading': 'SDK 加载中', 'sdk-ready': 'SDK 就绪',
    'engine-init': '引擎初始化', 'engine-ready': '引擎就绪',
    'model-loading': '加载模型', 'model-ready': '模型就绪', error: '错误',
  };

  return (
    <View className="viewer-page">
      {/* 3D 渲染区域 */}
      <View className="canvas-container" style={{ height: `${canvasH}vh` }}>
        <canvas
          ref={canvasRef}
          id="canvas"
          className="engine-canvas"
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />

        {['sdk-loading', 'engine-init', 'model-loading'].includes(status) && (
          <View className="status-overlay">
            <View className="loading-spinner" />
            <Text className="status-text">{statusMap[status]}</Text>
            {progress && <Text className="progress-text">{progress}</Text>}
          </View>
        )}
        {status === 'error' && (
          <View className="status-overlay error">
            <Text className="status-text">❌ {errorMsg}</Text>
            <Text className="progress-text" style={{ marginTop: 8, fontSize: 11 }}>点击下方按钮重试</Text>
          </View>
        )}
      </View>

      {/* 控制栏 */}
      <View className="control-bar">
        <View className="status-row">
          <View className={`status-dot ${status === 'model-ready' ? 'green' : status === 'error' ? 'red' : 'yellow'}`} />
          <Text className="status-label">{statusMap[status]}</Text>
          {progress && status !== 'idle' && status !== 'error' && (
            <Text className="progress-label">{progress}</Text>
          )}
        </View>

        <View className="btn-group">
          {status === 'idle' && <View className="btn primary" onClick={loadSDK}>加载 SDK</View>}
          {status === 'sdk-ready' && <View className="btn primary" onClick={initEngine}>初始化引擎</View>}
          {status === 'engine-ready' && <View className="btn primary" onClick={loadModel}>加载模型</View>}
          {status === 'model-ready' && (
            <>
              <View className="btn" onClick={resetCamera}>复位</View>
              <View className="btn" onClick={fitView}>适配</View>
              <View className="btn" onClick={explodeView}>拆分</View>
            </>
          )}
          {['sdk-ready', 'error'].includes(status) && status !== 'idle' && (
            <View className="btn warn" onClick={() => { setStatus('idle'); setErrorMsg(''); setProgress(''); }}>重置</View>
          )}
        </View>
      </View>

      {/* 手势提示 */}
      {status === 'model-ready' && (
        <View className="gesture-hints">
          <Text className="hint">👆 单指旋转 | 🤏 双指缩放 | ✋ 双指平移</Text>
        </View>
      )}

      {/* 数据集信息 */}
      <View className="info-bar">
        <Text className="info-text">
          {SDK_CONFIG.datasetId ? `📦 ${SDK_CONFIG.datasetId}` : '⚙️ 未配置数据集'}
        </Text>
      </View>
    </View>
  );
}
