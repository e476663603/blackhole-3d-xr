# Task: 重写为 WebXR AR（immersive-ar）

## Objective
用户明确要求使用 **WebXR AR**（`navigator.xr` API），而非 JSARToolKit5/AR.js 等第三方框架。

## 技术方案
- **WebXR Device API**: `navigator.xr.requestSession('immersive-ar')`
- **Three.js**: 3D 渲染 + FBX 模型加载
- **XRHitTestSource**: 表面检测（可选，用于放置模型）
- **降级策略**: immersive-ar → inline (magic window) → 不支持提示

## 关键实现
1. `checkXRSupport()` — 检测 `isSessionSupported('immersive-ar')` 和 `'inline'`
2. `initThreeScene()` — Three.js WebGLRenderer 启用 `xr.enabled = true`, `alpha = true`
3. `loadModel()` — FBXLoader 加载 test.fbx，失败用 MeshNormalMaterial 立方体替代
4. `requestXRSession()` — 核心入口，请求 immersive-ar session，绑定 renderer
5. XR 帧循环 — 使用 `session.requestAnimationFrame(onXRFrame)` 渲染

## 清理项
- 移除 JSARToolKit5 所有依赖（artoolkit.min.js, artoolkit.three.js）
- 移除 HtmlInjectPlugin 脚本注入逻辑
- 移除 webpack externals 配置

## Files Changed
- `src/pages/viewer/index.tsx` — 完全重写为 WebXR AR 实现
- `config/index.ts` — 移除 artoolkit 相关配置和插件

## Deploy
- Commit: `a9ffead` on gh-pages branch
- URL: https://e476663603.github.io/blackhole-3d-xr/

## Status
✅ 已部署，等待手机验证 WebXR AR 是否正常启动
