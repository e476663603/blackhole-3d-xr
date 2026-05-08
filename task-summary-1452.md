# v9 部署 - 硬编码版本号

## 问题根因
WebXR AR 页面看不到版本号：
1. `config/index.ts` 的 `defineConstants: { VERSION: ... }` 虽然定义了，但 Taro 构建时 **defineConstants 没有被注入到 H5 编译**
2. 源码里声明 `declare const VERSION: string` 匹配不到实际值 → 编译为 `undefined`
3. 后续用 HTML script 直接注入 `window.__BUILD_VERSION__` 的方法也因为 encode 问题导致语法错误

## 解决方案
**两步走，确保版本号100%可见：**

### 1. HTML 标题硬编码版本
在 `src/index.html` 的 `<title>` 标签直接写入版本号：
```html
<title>blackhole-3d-xr v8.1452</title>
```
浏览器标签页打开就看到，**无需加载 JS**。

### 2. 清理多余代码
删除了不再需要的：
- `config/index.ts` 中的 `defineConstants: { VERSION }`
- `src/index.html` 中的 `window.__BUILD_VERSION__` script
- `src/pages/viewer/index.tsx` 中的 `declare const VERSION`
- 之前误加的临时 patch 文件

## 构建结果
- 新 hash: app.adc73189.js（vs 旧 f312b447.js）
- HTML title: `blackhole-3d-xr v8.1452` ✅
- 构建成功，2 warnings（asset size limit，非阻塞）

## 部署
- commit: ef3ffd7
- 推送到 GitHub Pages 成功 ✅
- 上线: https://e476663603.github.io/blackhole-3d-xr/

## 验证方法
1. 打开链接，看浏览器标签页标题是否显示 `v8.1452`
2. 截图标签页发给我确认