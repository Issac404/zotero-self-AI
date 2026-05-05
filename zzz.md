# zotero-self-AI 功能清单

## 一、核心功能

### 1. AI 论文总结 / 笔记生成
从 Zotero 条目提取 PDF 内容，发送至 LLM 分析/总结，将结果转换为 Markdown/HTML 笔记保存到条目下，自动添加 `AI-Generated` 标签。

- **触发方式**: 右键菜单「召唤AI管家进行分析」、仪表盘批量扫描、任务队列
- **总结模式**:
  - `single` — 单次对话总结（默认，Token 消耗最少）
  - `multi_concat` — 多轮拼接（分轮深入提问，拼接所有回答）
  - `multi_summarize` — 多轮总结（多轮对话后再汇总精炼）
- **笔记策略**: `skip`（跳过已有笔记）、`overwrite`（覆盖）、`append`（追加）
- **核心文件**: `src/modules/noteGenerator.ts`, `src/modules/llmClient.ts`, `src/utils/prompts.ts`

### 2. 一图总结
为论文生成学术概念海报图片。流程：提取 PDF → LLM 生成视觉描述 → 生图 API 生成图片 → 保存为附件笔记（标签 `AI-Image-Summary`）。

- **触发方式**: 右键菜单、任务队列、侧边栏按钮、总结完成后自动触发（可选）
- **支持模型**: Gemini (gemini-3-pro-image-preview) / OpenAI 兼容生图接口
- **核心文件**: `src/modules/imageSummaryService.ts`, `src/modules/imageClient.ts`, `src/modules/imageNoteGenerator.ts`

### 3. 思维导图
从论文生成层次化思维导图，LLM 输出 Markdown 结构化列表，使用 markmap 渲染为可视化导图。

- **触发方式**: 右键菜单、任务队列、侧边栏按钮
- **导出格式**: PNG（高清2倍分辨率）、OPML（可导入 XMind/幕布等工具）
- **核心文件**: `src/modules/mindmapService.ts`, `addon/content/mindmap.html`

### 4. 文献综述
对分类下多篇论文综合分析，生成综述报告。

- **两阶段流程**:
  1. 填表阶段 — 为每篇论文按模板填写结构化表格（研究问题/方法/发现/局限等）
  2. 综述生成 — 汇总所有表格，生成综合文献综述笔记（`AI-Review` 标签）
- **支持功能**: 针对性提问、仅选特定表格行追加、引用标注 `[1][2]` 自动转为跳转链接
- **核心文件**: `src/modules/literatureReviewService.ts`, `src/modules/views/LiteratureReviewView.ts`

### 5. 填表
为单篇或多篇论文按 Markdown 表格模板填写结构化信息，保存为子笔记（`AI-Table` 标签）。

- **触发方式**: 右键菜单、任务队列、侧边栏「重新填表」按钮、单篇总结后自动触发（可选）
- **核心文件**: `src/modules/literatureReviewService.ts`

### 6. PDF 处理模式
三种 PDF 提取方式，通过 `pdfProcessMode` 偏好设置切换：

| 模式 | 说明 |
|------|------|
| `base64` | PDF 二进制 Base64 编码，直接发送给多模态大模型（推荐，适用于 Gemini 等） |
| `text` | Zotero 全文索引提取纯文本，适用于不支持 PDF 上传的模型 |
| `mineru` | 本地 MinerU OCR 服务，高质量还原公式/表格/排版 |

- **核心文件**: `src/modules/pdfExtractor.ts`, `src/modules/mineruIntegration.ts`

### 7. 自动扫描
后台监听 Zotero `item-add` 事件，检测到新文献（有 PDF 且无 AI 笔记）时自动加入任务队列。

- 默认关闭，在仪表盘「界面设置」中开启
- 带重试机制（等待 PDF 附件就绪）
- **核心文件**: `src/modules/autoScanManager.ts`

### 8. 任务队列
单例队列管理器，统一管理所有后台 AI 处理任务。

- **6 种任务类型**: summary、imageSummary、mindmap、tableFill、review、targetedQuestion
- **特性**: 优先级队列、批量处理、可配置间隔、重试机制、进度回调、持久化（重启恢复）、状态机（pending → processing → completed/failed）、统计（今日完成/失败数）
- **核心文件**: `src/modules/taskQueue.ts`, `src/modules/views/TaskQueueView.ts`

---

## 二、LLM 平台支持

| 平台 | Provider ID | 默认模型 | 特点 |
|------|-------------|----------|------|
| **Google Gemini** | `google` | gemini-2.5-pro | 多模态强，PDF 理解准确 |
| **OpenAI** | `openai` | gpt-3.5-turbo | Responses API 接口 |
| **Anthropic Claude** | `anthropic` | claude-3-5-sonnet-20241022 | Messages API |
| **OpenAI 兼容** | `openai-compat` | gpt-3.5-turbo | Chat Completions 旧接口，支持第三方 |
| **OpenRouter** | `openrouter` | google/gemma-3-27b-it | 多模型聚合平台 |
| **火山方舟** | `volcanoark` | doubao-seed-1-8-251228 | 每日免费额度 |

每个 Provider 实现 `ILlmProvider` 接口，通过 `ProviderRegistry` 自注册。
**核心目录**: `src/modules/llmproviders/`

### API Key 管理
支持每个平台配置多个 API Key，均衡轮转，失败 Key 进入冷却期（可配置），UI 中可单独禁用/启用。
**核心文件**: `src/modules/apiKeyManager.ts`

---

## 三、UI 界面

### 主窗口（标签页式对话框）

| 标签页 | 功能描述 | 核心文件 |
|--------|----------|----------|
| **仪表盘** | 运行状态、统计卡片（总计/今日/待处理/失败/成功率）、最近活动列表 | `DashboardView.ts` |
| **总结** | 实时流式输出 AI 总结，Markdown + KaTeX 渲染，自动滚动，追问面板 | `SummaryView.ts` |
| **任务队列** | 任务列表、状态筛选、搜索、进度条、重试/删除/优先、详情面板 | `TaskQueueView.ts` |
| **文献综述** | 分类选择、论文树形勾选、综述名称/提示词配置、模板选择、预设管理 | `LiteratureReviewView.ts` |
| **设置** | API/提示词/数据管理三个子页面 | `SettingsView.ts` |

**打开方式**: 工具栏按钮、右键菜单「AI 管家仪表盘」、偏好设置中的按钮

### 设置子页面

| 页面 | 配置内容 |
|------|----------|
| **API 设置** | Provider 选择、各平台 API URL/Key/Model、温度/topP/maxTokens、多 Key 管理、连接测试、超时/冷却配置、PDF 处理模式、MinerU 服务器地址/Key |
| **提示词设置** | 总结模式、总结提示词（支持变量）、多轮提示词（可配4轮+最终总结）、表格模板、填表/综述提示词、一图总结提示词、思维导图提示词、预设管理 |
| **数据管理** | 任务批次大小/间隔、统计信息、清除已完成/全部任务、设置导入导出、恢复默认 |

### PDF 阅读器工具栏
在 PDF 阅读器顶部插入按钮，点击可打开主窗口追问当前论文。

---

## 四、侧边栏功能（ItemPaneSection）

侧边栏在 Zotero 右侧条目面板中注册为自定义区块（`self-ai-chat-section`），头部显示「AI 管家」。选中文献条目时显示，包含以下功能区：

### 操作按钮栏
- **📝 完整追问** — 打开主窗口 Summary 视图，加载当前文献进入完整对话（保存记录）
- **💬 快速提问** — 在侧边栏内展开内联聊天区，对话不保存，适合临时提问
- **刷新按钮** — 重新加载所有侧边栏内容（笔记、图片、思维导图）

### AI 笔记预览区
- 可折叠标题栏（折叠状态持久化保存）
- **字体缩放**: A− / A+ 按钮（10-20px 范围）
- **主题切换**: GitHub（默认）/ 红印 Redstriking 两种 Markdown 渲染主题
- **复制 Markdown**: 一键复制原始笔记内容到剪贴板
- **可拖拽调整高度**: 底部拖拽手柄，高度持久化保存
- **Markdown 渲染**: 通过 marked 库渲染，支持标题/列表/表格/代码块等
- **KaTeX 公式渲染**: 自动渲染 `$...$`（行内）和 `$$...$$`（块级）LaTeX 公式，长公式自动横向滚动
- 无笔记时显示"一键召唤 AI 管家生成"入口

### 表格填写区
- 可折叠，显示 `AI-Table` 标签状态徽章
- **重新填表按钮** — 删除旧表重新生成
- HTML 表格渲染，带边框样式

### 一图总结展示区
- 可折叠，紫色主题标题
- 内联显示生成的学术海报图片
- 无图片时显示"生成一图总结"按钮
- 支持点击放大预览（独立窗口）
- 下载保存按钮

### 思维导图区
- 可折叠，绿色主题标题
- **iframe 沙箱渲染**: 通过 `mindmap.html` 独立页面加载 markmap 库，使用 postMessage 通信
- 支持交互操作（缩放、平移）
- **导出功能**: PNG 图片导出、OPML 大纲导出
- 可拖拽调整高度
- 无思维导图时显示"生成思维导图"按钮

### 内联快速聊天区
- 默认隐藏，点击「快速提问」展开
- 200px 可滚动消息区域
- 文本输入框 + 发送按钮
- 携带当前文献 PDF 内容和完整对话历史
- 支持流式响应

### PDF 解析流水线（PdfSplitView）
- 标题：「PDF 解析流水线」
- **阶段 1** — 「发送 PDF 至 MinerU」按钮，上传到本地 MinerU 服务器解析，显示进度和状态
- **阶段 2** — 展示 MinerU 提取的源文本（可编辑 textarea）
- **阶段 3** — 「启动 VLM 推理」按钮，将 Markdown + 图片发送给多模态大模型
- **阶段 4** — 显示最终 AI 笔记结果
- 状态区域：带颜色的信息/成功/错误消息

### 自动刷新
侧边栏监听任务队列完成事件，当前文献相关任务完成时自动刷新（500ms 防抖）。

---

## 五、其他特性

- **明暗主题适配**: 自动检测 Zotero 主题和系统偏好，CSS 变量驱动，完美适配亮色/暗色模式
- **国际化**: 中英文双语支持（Mozilla Fluent FTL 格式）
- **配置持久化**: 所有设置自动保存到 Zotero 偏好系统，重启不丢失
- **提示词版本管理**: 内置提示词更新时自动迁移用户设置
- **设置导入导出**: 支持 JSON 格式导入导出所有配置
- **KaTeX 字体**: 内置 60 个 KaTeX 字体文件，确保公式在所有平台正常渲染
- **Markdown 主题**: GitHub 和红印两种 CSS 主题，支持热切换
