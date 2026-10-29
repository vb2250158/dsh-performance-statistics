# DSH Performance Statistics

[English](README_en.md) · MIT

DeepSeek Harness 的独立性能统计插件。点击输入框下方的统计按钮，弹窗查看耗时饼图、阶段耗时明细、逐次辅助模型调用、首个输出等待、输出速度和 Token 用量。超过 1 秒的耗时显示为秒，最多三位小数；1 秒及以下显示为毫秒。

## 安装与迁移

适用于 DSH 0.2.1 系列公开插件 API，已在 0.2.1-rc.3 验证。通过 DSH 的插件管理器安装本仓库，或使用受支持的 CLI：

```sh
dsh plugin --profile web add github:vb2250158/dsh-performance-statistics#v0.1.7
```

安装后启用 **Performance statistics / 性能统计**，重新打开网页。发送一条消息，轮次结束后点击统计按钮；辅助模型卡片可展开，饼图和图例可点击筛选。

从聊天增强插件迁移时，请同时升级到 `dsh-chat-enhancement >=0.3.81`。0.3.80 及此前带统计功能的版本会与本插件争用同一投影和按钮，不能同时启用。本插件不依赖聊天增强；Jev 的用途和规则标签需要 `dsh-jev-context-gate >=0.1.37`。

旧会话无需转换。本插件继续读取 `plugin:dsh-chat-enhancement/timing`，保留 `chatSessionTiming` 投影和可选 `chatStageTiming` 服务名称；新记录使用 `plugin:dsh-performance-statistics/timing`。停用插件撤销监听、服务和按钮，不删除已有记录。

## 可以看到什么

Rabi 钩子可展开到「插件 → 会话开始／提交消息／回复结束 → 连接与请求 → 服务端步骤」。选中钩子环节后，逐次卡片立即列出每次耗时、HTTP 状态及成功、失败、阻止、继续处理或结果待核对状态。`dsh-rabiroute-agent >=0.13.42` 采集地址提示、Host 状态查询、请求前后身份核对和接口请求；支持计时的 Rabi Manager 进一步提供计划续推、回复保存、改动提醒、计划完成与投递耗时。

逐次钩子卡片的标题、状态和说明统一留有内边距；展开后的连接与后台步骤分块排列，长名称自动换行，窄屏使用单列，耗时始终与所属步骤放在一起。

旧日志仍能查看原有钩子事件与总耗时；内部步骤未采集时明确提示，不事后推算。服务端相对计时放入所属请求区间，请求剩余时间保留为未细分部分；各级子图按独占时间分配，合计等于父项。投影版本 8 自动回放旧记录，不改写历史会话。

- 输入和提示词准备、模型选择、输入预处理、请求准备、上下文检查与整理。
- 辅助模型、模型首 token 等待、推理、正文和工具参数输出、流结束与消息提交。
- 工具分发、前置检查、执行、后处理、结果提交、步骤切换、轮次收尾、压缩、Rabi 钩子和重试。
- 每次辅助调用的插件、用途、规则名称与 ID、模型、开始时间、总耗时、首 token 等待、首 token 后耗时、失败或中断状态。

每毫秒只归属一个饼图阶段，嵌套测量优先，并行工具按时间并集计入。子饼图使用同一份独占耗时分配，子项与未记录部分之和等于父项。总量覆盖完整日志中已结束的轮次；进行中的轮次结束后计入。首个模型输出等待从轮次开始算起，包含准备和推理片段，不包含入队前与浏览器渲染时间。

选中环或图例后，下方追加该环节的插件饼图；继续选中插件可显示操作子饼图。父图始终保留，切换上级会清除旧分支。耗时与本级占比并排显示，口径放在名称下方；不再显示底部明细表。

未记录的内部调用无法事后补采。投影版本 4 会回放已有名称和计时记录；只有外层阶段的旧日志仍标明缺失。更细的协作式输入预处理名称由可选公开服务 `agentPreStepTiming` 及宿主的[配套采集点补丁](host-patches/pre-step-timing.patch)提供，Jev 自有操作需要 0.1.41 或以上；原生概率 API 每次请求会单独计入辅助模型，显示模型、用途与规则，整包返回不虚构首 token。补丁覆盖指令加载、技能读取、会话引用、时间上下文和可选终端查询；不改变瀑布决策，也不修改 Agent 循环。

插件启用后注册的预处理监听器会记录自身工作，扣除 `next()` 下游和已独立测量的协作区间。只提供部分子步骤计时的监听器仍保留其余准备与收尾耗时；重叠子步骤只扣除一次。

## 隐私

计时信息保存到本地会话日志，只包含时间、模型路由、插件、工具、钩子、用户配置的规则名称与 ID，以及结果状态。不会为统计保存提示词、工具参数、回复或凭据，不缓存模型流，不上传遥测；会话原有的正常记录行为由 DSH 管理。分享日志前应检查自定义名称中的个人信息。

## 开发与验证

`src/` 是源码，`lib/` 是随 Git 发布的可复现产物；构建不需要额外打包依赖。使用已构建的 DSH checkout 运行集成验证：

```sh
node scripts/build.mjs
DSH_SOURCE_ROOT=/path/to/deepseek-harness node --test tests/*.test.mjs
DSH_SOURCE_ROOT=/path/to/deepseek-harness node tests/session-timing.host-smoke.mjs
```

PowerShell 使用 `$env:DSH_SOURCE_ROOT='C:/path/to/deepseek-harness'`。DOM 测试使用 checkout 的 React、JSDOM 和公开 primitives。Host smoke 使用真实 Agent 循环与合成模型，不调用付费 API。覆盖并发会话、流取消和失败、旧记录兼容、投影回放、耗时去重、交互及卸载清理。

其他插件可选接入准确用途标签：

```js
const timing = ctx.get('chatStageTiming')
const options = { provider, model, messages, signal }
const stream = timing
  ? timing.stream({ plugin: 'my-plugin', operation: 'before', rules: [{ id: 'rule-id', title: 'Rule label' }] }, () => ctx.llm.stream(options))
  : ctx.llm.stream(options)
for await (const chunk of stream) { /* consume normally */ }
```

非模型子步骤可在已有 Agent 阶段内调用 `timing.run({ plugin: 'my-plugin', operation: 'catalog-snapshot' }, () => loadCatalog())`；缺少服务或没有活动阶段时直接执行原任务。该接口返回异步任务的原结果，保留原错误，不记录任务参数或返回内容。兼容旧统计服务时检查 `timing?.run` 是否存在。

标签通过异步上下文传递，不加入提供方请求。逐片段转发保持对象、取消及错误语义。观察器不要求根作用域存在模型服务，通过公开全局事件监听 Agent 的模型请求；写入使用实际会话实例的公开 `append` 兼容入口，避免跨安装包 Session 类的私有成员冲突。

此功能提取自 [dsh-chat-enhancement](https://github.com/vb2250158/dsh-chat-enhancement)，保留 MIT 许可。

预处理提供方可显式记录自己的工作，不包含下游 `next()` 的执行时间：

```js
const decision = await next()
const work = () => prepareInput(decision)
return ctx.get('agentPreStepTiming')?.run(
  { agent, turn, step }, { plugin: 'my-plugin', operation: 'input-loading' }, work,
) ?? work()
```

显式位置避免全局前置监听器在外层异步上下文之外执行时丢失归属。服务缺失时执行原任务；只保存名称、时间及结果状态。

非流式辅助模型可使用 `timing.request({ plugin, operation, provider, model, transport: 'native-decisions' }, task)`。它从活动异步上下文取得会话位置，记录完整请求耗时，不保存请求和响应内容，也不推算首 token。

旧宿主还可通过公开 `internal/listener` 注册拦截，对统计插件启用后新建的 Agent 采集各组件的自有预处理时间：下游 `next()` 的等待会扣除，协作式计时不会重复记录，卸载后旧包装直接委托。该路径不读取或改写既有监听器列表，已注册的旧回调无法事后补采；热安装后需刷新预设声明，再创建会话采集。配套宿主补丁提供更细的操作名称。

热安装统计插件后，已存在的预设修订不会重新注册监听器。通过已登录的 Connection 向 `/api/dsh-performance-statistics/refresh-presets` 发送 POST，可使用公开 Fiber 生命周期刷新预设声明；配置不变，已有 Agent 保留原修订，后续会话使用新修订。调用失败返回 503，应先检查预设激活诊断；旧历史无法补采。

失败重试的等待在下一次请求开始时结束；后续模型等待和输出分别计时。升级后投影会从原日志重算，原始会话记录不变。

弹窗第二行左侧显示当前会话标题，右侧显示统计范围与轮次、步数；重命名后同步更新，长标题自动换行。

技能筛选调用展开后显示候选名称、相关性分数、排名、保留或剔除结果以及当次规则参数。候选列表分批显示；旧日志提示未采集。评分属于一次批量请求，不提供逐项耗时或文字理由。

打开统计弹窗即可查看正在执行的 Rabi 钩子、当前阶段、累计等待及已记录的超时上限；阶段完成或失败按实际进度更新，钩子结束后从进行中区域移除。进度事件不计入饼图时长。失败调用默认展开分段时间线；未收到响应时不显示 HTTP 0 为成功，有结构化记录时区分超时、取消和其他失败并显示请求 ID。旧记录仅显示采集到的失败阶段，不根据耗时推测原因，也不补造服务端细分。
