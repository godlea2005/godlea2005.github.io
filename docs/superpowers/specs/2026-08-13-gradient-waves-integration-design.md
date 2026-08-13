# Gradient Waves 首页背景接入设计

## 目标

将 React Bits `GradientWaves-JS-CSS` 官方组件作为个人网站首页首屏的动态背景。现有音乐页、留言板、OAuth、项目内容区与路由逻辑保持不变。

## 来源与依赖

- 注册表：`https://reactbits.dev/r/GradientWaves-JS-CSS.json`
- 组件变体：JavaScript + plain CSS
- 运行依赖：`ogl@^1.0.11`
- 源码保持官方结构，只做项目接入所需的 TypeScript 声明兼容，不修改 Shader 行为。

## 组件边界

- 新增独立 `GradientWaves` 目录，包含 JSX 和 CSS。
- `StatusScene` 负责首页首屏结构，并将 `GradientWaves` 渲染为绝对定位的背景层。
- 首屏文字、入口链接和状态信息位于 Canvas 上方，保持键盘与鼠标可操作。
- 背景层不拦截页面链接；组件内部的鼠标视差仍通过 Canvas 接收指针坐标。

## 配置

严格使用用户给定配置：

- `horizonColor="#7656f6"`
- `waveColor="#ee4be9"`
- `crestColor="#ffffff"`
- `speed={0.55}`
- `amplitude={2.05}`
- `waveScale={0.6}`
- `waveRatio={0.9}`
- `swell={35}`
- `turbulence={20}`
- `tilt={1}`
- `zoom={1.0}`
- `height={6}`
- `fogDepth={18}`
- `detail="medium"`
- `brightness={1.0}`
- `opacity={1.0}`
- `mouseInteraction={true}`
- `parallaxStrength={0.5}`
- `grain={true}`
- `grainIntensity={0.05}`

## 视觉与响应式

- 动态背景覆盖完整首页首屏区域，而不是固定的 600px 演示容器。
- 首屏增加轻微深色遮罩以维持深色与浅色主题下的文字对比度。
- 桌面端维持现有两列内容结构；手机端背景填满首屏并保留当前内容顺序。
- 如果浏览器没有 WebGL 2，保留静态渐变底色，页面内容仍可正常使用。

## 验证

- `npm run build` 必须通过。
- Playwright 检查桌面与 390px 手机视口。
- 确认 Canvas 存在、尺寸正确、页面链接可点击、控制台没有组件运行错误。
- 验证切换到音乐页和留言页时首页背景被卸载，不产生残留 Canvas 或 WebGL 上下文。
