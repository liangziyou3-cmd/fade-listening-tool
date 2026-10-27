# Fade Listening — MVP 产品与技术设计文档

**版本：** v1.2（2026-10-27，MVP 范围收敛稿；基于 v1.0 初稿与 v1.1 补充）  
**用途：** 团队对齐、Fade 预处理 Skill 设计、Codex Web App 开发  
**阶段：** 两周内可试用 MVP  
**核心决定：** 当前不开发独立的 Learner Mode / 学习者内容库；用户先在 ChatGPT/Codex 中运行 Skill，下载内容 ZIP，再在 Web 页面上传 ZIP 并使用。Web 内仍需保留最小的学习状态，以实现自适应；它不是单独的用户角色或账户系统。

## 1. 产品定位与目标

Fade Listening 是一个针对外语视频的自适应双语字幕学习 Web App。用户准备一份带时间戳的目标语言字幕（SRT/VTT 或兼容格式），通过离线 AI Skill 完成句子重建、第二语言翻译、语言知识点标注、文化信息整理、分段测验和重点词汇总结，导出标准 ZIP 内容包。用户在网页中上传该 ZIP，系统使用 YouTube 官方 IFrame Player 播放对应视频，在播放器**下方**显示自定义字幕，根据观看操作和测验结果调整隐藏策略。

**要验证的假设：** 在保持视频观看体验的同时，基于语言知识点和理解反馈的字幕淡出，比单纯开关字幕更有助于进行听力练习。MVP 不声称已证明长期语言能力提升。

**研究依据：** 既有 NUS 学生观察发现娱乐内容可自然触发语言练习；CLS 泰语教师反馈课时有限、课外练习不足，且初学者可能难以跟上真实视频及文字。首轮演示可使用西班牙语视频；未来需按语言与水平验证适用性，不能把所有语言的难度标签等同处理。

## 2. 当前范围与非目标

### 2.1 P0 必须实现
- 离线 Skill 接收已有时间戳字幕及 YouTube URL / video ID、目标语言和翻译语言；生成可验证的 ZIP。
- ZIP 包含 manifest、双语字幕与语言标签、测验、重点词汇、文化注释、审核报告。
- Web 通过文件选择器上传 ZIP，客户端解压、验证、展示导入摘要。
- 使用 YouTube IFrame Player 播放允许嵌入的视频；字幕显示在播放器外部下方。
- 句级时间同步；同一句中可按字符区间隐藏词/短语，但无需词级时间戳。
- Basic / Balanced / Challenge 三档（建议 UI 名称 More Support / Balanced / Challenge）；Reveal 当前句、More Support、Less Support。
- 按检查点弹出测验；开始前 10 秒基于**播放进度**显示倒计时；允许跳过。
- 测验评分、错题解释、轻量奖励效果；测验和操作信号更新后续字幕隐藏政策。
- 无需登录；最小用户状态存在浏览器会话 / localStorage 中。

### 2.2 暂不实现
- 网站内运行 Skill 或调用 AI API；用户提供任意视频链接并自动提取字幕/音频；商业视频下载、硬字幕去除。
- 独立 Learner Mode、内容商城、教师后台、账号、云端共享、多人同步。
- 实时 AI 逐词推理、精确声学听力诊断、强制前测、跨设备学习记录。
- 完整浏览器插件；未来可探索，但不属于当前交付。

## 3. 端到端用户流程

**准备阶段（Web 外）：** 取得有权使用的字幕文件 → 运行 Fade Preprocessor Skill → 生成 ZIP + 人工审核报告 → 审核与修正 → 下载 ZIP。

**网站阶段：** 打开 Web → 上传 ZIP → 验证 → 预览视频/语言/时长/检查点 → 选择初始支持强度（默认 Balanced，可改）→ 播放 → Reveal 或调节支持 → Checkpoint 倒计时 → 暂停并选择测试/跳过 → 得分与错题解释/奖励 → 更新策略 → 继续播放 → 完成后显示摘要。

没有独立学习者模式，不意味着没有学习状态。当前上传者即使用者，所有状态只作用于当前浏览器的当前内容包。

## 4. Skill 输入、处理步骤和输出

### 4.1 输入
**必填：** 带时间戳字幕（优先 SRT/VTT）；目标语言 BCP-47 或 ISO 代码（如 `es`）；翻译语言（如 `en`）；YouTube video ID 或 URL（用于 manifest）。

**可选：** 视频总时长、视频标题、已有翻译、内容简介、课程水平参考、文化注释来源、视频授权备注。**不要求输入单个学习者水平**；Skill 生成的是可复用的内容分析，而非个体隐藏策略。

### 4.2 处理管线
1. **解析与规范化：** 解析时间戳、检查单调性、处理字幕格式；只有开始时间时可暂以下一 cue 开始时间推断结束时间，并在审核报告标记；最后一 cue 必须由可靠时长确定。
2. **句子重建：** 把跨 cue 的文本合并成完整句子，尽量不改写台词；保留原 cue ID 列表。只有字幕时无法可靠识别真实镜头切换或语气。
3. **翻译：** 按完整句子生成英语/第二语言译文，继承原句起止时间；标记有歧义或低置信度的翻译。
4. **语言分析：** 标注词汇、语法、惯用表达、文化/语用；给出相对难度 `1–5`、隐藏资格、剧情重要性、字符范围。难度是内容估计，非用户掌握度。
5. **文化注释：** 只在有明确依据时生成；关联字幕 ID，说明背景及可选来源；不确定内容进入审核队列。
6. **分段测验：** 每 900 秒一个目标检查点；不满 900 秒仍在结尾生成一次。尽量落在句子边界，不能只凭字幕判断场景切换。每个检查点 3–5 题，包含剧情理解、词义、表达识别、必要时文化理解。每题关联 `annotation_ids` 或 `subtitle_ids`；没有充分依据时不得虚构答案。
7. **重点内容：** 按难度分级汇总词汇与表达，附翻译、出现位置和解释，去重。
8. **校验与导出：** JSON Schema、跨文件引用、时间范围、字符范围、题目选项及答案索引检查；生成 `review-report.md`；审核通过后打包 ZIP。

### 4.3 特别注意：句级显示与句内隐藏
播放器每次显示一个完整句级 cue；其中若干字符区间可以隐藏。无需逐词音频时间戳。字符区间使用 **Unicode code point 索引（0 起始，end 排他）**，Skill 验证切片与 `text` 一致；JS 前端必须按 `Array.from(source_text)` 切片，避免 UTF-16 与 emoji/组合字符造成偏移。对于泰语等无空格分词语言，必须由分析与人工审核确定边界。

## 5. Fade Content Package v1.0

ZIP 根目录结构：

```text
fade-spanish-demo.zip
├── manifest.json
├── subtitles.json
├── quizzes.json
├── vocabulary.json
├── culture.json
└── review-report.md
```

所有文件为 UTF-8；前五个 JSON 是应用数据，审核报告只供内容制作者检查。每个文件固定 `schema_version: "1.0"`，引用必须一致。不要在 ZIP 中包含可执行 JS/HTML。

### 5.1 manifest.json 示例
```json
{
  "schema_version": "1.0",
  "content_id": "spanish-lola-demo-001",
  "title": "Lola y Ana — Demo",
  "video": {
    "provider": "youtube",
    "video_id": "REPLACE_WITH_REAL_VIDEO_ID",
    "duration_seconds": 1800,
    "caption_policy": "original_cc_off_recommended"
  },
  "languages": {"source": "es", "translation": "en"},
  "assessment_interval_seconds": 900,
  "files": {
    "subtitles": "subtitles.json",
    "quizzes": "quizzes.json",
    "vocabulary": "vocabulary.json",
    "culture": "culture.json"
  },
  "content_version": "1.0.0",
  "review_status": "approved"
}
```
`duration_seconds` 必须与视频实际时长核对；示例 ID 和时长仅为占位。上传时拒绝 `review_status` 非 `approved` 的包，或在测试环境明确警告。

### 5.2 subtitles.json 示例
```json
{
  "schema_version": "1.0",
  "content_id": "spanish-lola-demo-001",
  "cues": [
    {
      "id": "s001",
      "start": 8.0,
      "end": 15.0,
      "source_cue_ids": ["raw001", "raw002", "raw003"],
      "source_text": "Esta es la historia de Lola y Ana, que comparten un piso en España.",
      "translation_text": "This is the story of Lola and Ana, who share an apartment in Spain.",
      "annotations": [
        {
          "id": "a001",
          "text": "comparten un piso",
          "start_char": 39,
          "end_char": 56,
          "category": "expression",
          "difficulty": 2,
          "hide_eligible": true,
          "story_importance": "medium",
          "concept_id": "share_apartment",
          "review_status": "approved"
        }
      ],
      "culture_note_ids": []
    }
  ]
}
```
**重要：** 以上字符偏移是字段结构示意，必须由校验脚本重新计算并确认，不能直接将示意值投入正式内容包。实际导出时所有注释 `review_status` 必须为 `approved`。禁止重叠隐藏区间，除非后续明确实现优先级规则。

### 5.3 quizzes.json 示例
```json
{
  "schema_version": "1.0",
  "content_id": "spanish-lola-demo-001",
  "checkpoints": [
    {
      "id": "cp001",
      "target_time": 900,
      "trigger_time": 898,
      "covered_start": 0,
      "covered_end": 898,
      "question_ids": ["q001"],
      "skippable": true
    }
  ],
  "questions": [
    {
      "id": "q001",
      "checkpoint_id": "cp001",
      "type": "expression_meaning",
      "category": "expression",
      "prompt": "What does 'comparten un piso' mean?",
      "options": ["They share an apartment", "They buy a house", "They leave Spain"],
      "correct_option_index": 0,
      "explanation": "Compartir un piso means to share an apartment.",
      "related_subtitle_ids": ["s001"],
      "related_annotation_ids": ["a001"],
      "evidence": "s001"
    }
  ]
}
```
检查点时间只是示意；实际 3 分钟视频必须在视频结束时生成终点测验，不得保留 900 秒节点。每个检查点至少 3 道题（上例只展示 1 道）。如果用户跳过，记录 `skipped`，不当作答错。

### 5.4 vocabulary.json 示例
```json
{
  "schema_version": "1.0",
  "content_id": "spanish-lola-demo-001",
  "items": [
    {
      "id": "v001",
      "source": "compartir un piso",
      "translation": "to share an apartment",
      "category": "expression",
      "difficulty": 2,
      "related_annotation_ids": ["a001"],
      "related_subtitle_ids": ["s001"],
      "notes": "Common housing expression."
    }
  ]
}
```

### 5.5 culture.json 示例
```json
{
  "schema_version": "1.0",
  "content_id": "spanish-lola-demo-001",
  "notes": [
    {
      "id": "c001",
      "subtitle_id": "s001",
      "title": "Shared apartments",
      "body": "The phrase 'compartir un piso' refers to sharing an apartment; its cultural relevance depends on context.",
      "trigger_time": 8.0,
      "display_mode": "on_demand",
      "source_reference": null,
      "review_status": "needs_review"
    }
  ]
}
```
文化信息不是每句必填；无可信依据时可输出空数组。示例文化说明须人工核实后才批准展示。

### 5.6 review-report.md 内容
记录输入来源、字幕重建前后数量、时长与时间戳疑点、翻译歧义、注释字符偏移、文化事实核查、题目答案依据、授权状态、最终审核签名/日期。审核报告不自动成为可靠性证明。

## 6. Web App 页面与交互规格

### 6.1 导入页（唯一入口）
- 上传 `.zip`，浏览器使用 JSZip 解压；限制压缩包大小、文件数、解压总大小及路径，防止 ZIP bomb / path traversal。
- 使用 Zod 或 JSON Schema 验证五个 JSON；检查 schema_version、content_id 一致、时间戳、索引、引用关系、YouTube ID 格式。
- 显示具体错误：文件、字段、原因；验证失败不能进入播放。
- 成功后显示标题、语言、视频 ID、预计时长、字幕数、检查点数、内容审核状态，按钮 `Start Learning`。
- P0 可只存内存；刷新需重新上传。P1 用 IndexedDB 保存导入包与练习状态。

### 6.2 播放页
- YouTube 官方 IFrame Player API，嵌入允许播放的视频；不遮挡或覆盖 YouTube 播放器。Fade 字幕与控制区位于 iframe **外部下方**。
- 原 YouTube CC 建议用户关闭；不能假定所有视频都能由 API 强制关闭 CC。若存在硬字幕，提示该视频不适合 Fade。
- 通过 `getCurrentTime()` 定期同步（例如 100–250ms 轮询；按实际性能调整）；使用二分查找当前 cue；处理暂停、缓冲、seek、播放速度变化、结束。
- 字幕显示整句原文及可选译文；目标语言按隐藏策略遮挡指定片段；译文默认隐藏/按需展开，避免始终显示翻译抵消听力练习。
- Reveal：仅临时显示当前 cue 的隐藏内容，并记录 cue / annotation IDs；切换 cue 自动恢复策略。
- More Support / Less Support：调整之后字幕的强度并记录操作；与 Reveal 不重复。
- 当前档位显示 `More Support / Balanced / Challenge`，其中 More Support=最多支持，Challenge=最少支持；具体策略仍根据类别权重个性化。
- 文化提示只在有注释时显示小图标，点击展开，不自动遮挡视频；可在学习总结中再次查看。

### 6.3 Checkpoint / Quiz
- 每 900 秒附近的自然句末节点触发；不足 900 秒的视频在结尾测验。
- 到达节点前 10 秒，**基于视频时间**显示提示和倒计时；暂停时倒计时停止，seek 跨过节点时只触发一次并处理用户选择。
- 到节点暂停播放器，用户可 `Start Quiz` 或 `Skip`；跳过不更新对应知识置信度。
- 测验支持单选题、答案检查、正确答案与解释、关联知识点；错题记录分类。奖励动画可使用 CSS / Lottie 轻量效果，尊重 `prefers-reduced-motion`。
- 测验后显示分数、错题、关联词汇与下一段字幕策略摘要；点击继续恢复播放。

### 6.4 完成页
展示已完成的检查点、答题正确率、Reveal 次数、各类别待练习项和词汇总结；不得将“不 Reveal”直接等同“听懂”。奖励仅鼓励参与和可观察进步，不作未经验证的学习能力宣称。

## 7. 自适应隐藏策略（规则引擎 v1）

### 7.1 最小用户状态
```json
{
  "content_id": "spanish-lola-demo-001",
  "mode": "balanced",
  "category_support": {"vocabulary": 0.5, "grammar": 0.5, "expression": 0.5, "culture": 0.5},
  "reveals": [],
  "quiz_attempts": [],
  "completed_checkpoint_ids": [],
  "skipped_checkpoint_ids": []
}
```
`category_support` 越高代表保留字幕的倾向越强；它不是语言能力测量百分比。

### 7.2 隐藏政策
- 候选仅限 `hide_eligible=true` 且 `review_status=approved` 的 span；保护关键剧情信息及未验证注释。
- Basic / Balanced / Challenge 只控制基础隐藏预算（如每句最多 0/1/2 个片段，示意值）；不生成三份静态字幕。
- 结合 `difficulty`、`category_support`、同概念的近期错误和 Reveal 历史决定优先级。较难、常错、常 Reveal 的内容**更应显示**；较熟悉的内容才优先隐藏。
- 策略采用确定性排序（同一输入、同一状态得到相同结果），便于测试与复现。
- 测验错题：对关联类别及 `concept_id` 小幅增加 support；答对题目只做保守降低 support，不能因一道题就判定“已学会”。
- 跳过测验：不更新掌握度，仅保留用户手动支持偏好。
- 视频播放中不调用 LLM；更新规则可在测验结束后立即本地计算。

### 7.3 可测试的验收案例
A. 点击 Reveal 后只恢复当前 cue；下一 cue 不受影响。  
B. 点击 More Support 后，后续 cue 隐藏数量不增加。  
C. 某表达相关题答错后，该表达或同 `concept_id` 在后续 cue 中更倾向保留。  
D. 跳过测验不改变类别学习估计。  
E. 视频暂停时 checkpoint 倒计时不前进。  
F. 重新导入另一 content_id 不串用旧内容状态。

## 8. 技术实现架构

| 层 | 建议技术 | 职责 |
|---|---|---|
| Skill | ChatGPT/Codex Skill + Python | 解析字幕、AI 翻译分析、生成 JSON、校验和打 ZIP |
| 前端 | React + TypeScript + Vite | 页面、播放器外字幕、控制、测验、结果 |
| 视频 | YouTube IFrame Player API | 播放、暂停、获取当前时间、结束事件 |
| 导入 | File API + JSZip + Zod | 客户端 ZIP 解压、结构验证 |
| 策略 | 纯 TypeScript | 字幕可见性、测验评分、状态更新 |
| 存储 | React state / localStorage；P1 IndexedDB | 当前会话与导入内容 |
| 部署 | Vercel 静态站点 | 免费子域名试用，无运行时 AI API |

YouTube 嵌入必须遵守官方嵌入及开发者政策，视频可否嵌入、字幕是否可关闭、是否有硬字幕需要逐个验证。Skill 不抓取未授权视频或字幕；当前以用户合法取得的字幕为输入。

## 9. Codex 项目目录建议

```text
fade-listening/
├── public/
├── src/
│   ├── pages/ImportPage.tsx
│   ├── pages/PlayerPage.tsx
│   ├── components/YoutubePlayer.tsx
│   ├── components/FadeSubtitlePanel.tsx
│   ├── components/SubtitleControls.tsx
│   ├── components/CheckpointPrompt.tsx
│   ├── components/QuizDialog.tsx
│   ├── components/ResultPanel.tsx
│   ├── content/importPackage.ts
│   ├── content/schemas.ts
│   ├── engine/visibilityPolicy.ts
│   ├── engine/assessment.ts
│   ├── engine/sessionState.ts
│   └── types/fade.ts
├── tests/
└── package.json
```

Skill 单独维护：
```text
fade-preprocessor/
├── SKILL.md
├── agents/openai.yaml
├── references/content-schema.md
├── references/annotation-rules.md
├── references/quiz-guidelines.md
├── scripts/parse_subtitles.py
├── scripts/validate_package.py
└── scripts/package_content.py
```

## 10. 两周开发里程碑

| 时间 | 交付与验收 |
|---|---|
| Day 1–2 | 冻结 Schema v1.0；准备一段合法字幕及对应视频；输出并验证首个 ZIP |
| Day 3–4 | ZIP 上传、客户端解压和结构验证；导入摘要页 |
| Day 5–6 | YouTube IFrame 播放、句级字幕同步、Reveal 和档位控制 |
| Day 7–8 | Checkpoint 倒计时、暂停、跳过、Quiz 与评分 |
| Day 9–10 | 自适应规则、文化提示、词汇总结、奖励效果 |
| Day 11–12 | 端到端测试、seek/暂停/重复触发边界测试、移动端适配 |
| Day 13–14 | NUS 用户测试、修复关键问题、Vercel 部署、演示脚本 |

**降级策略：** 若时间不足，优先保留 ZIP 导入、视频同步、Reveal、一次测验和下一段策略变化；延后文化弹窗、动画、IndexedDB。若 YouTube 无法嵌入或 CC 无法关闭，改用有权使用的本地视频文件作为备选播放器，不阻塞整体闭环。

## 11. 验收与研究评估

**工程验收：** 合法 ZIP 导入成功；非法 ZIP 给出明确错误；字幕与播放同步；隐藏与 Reveal 即时；测验可触发/跳过；分数准确；状态更新可解释；部署后手机与电脑可用。

**研究指标：** 测验理解正确率、Reveal 次数、用户选择支持强度的频率、观看中断体验、对文化提示和奖励的主观评价。小样本需报告原始人数及任务，不宜仅报告百分比。不要把 Subtitle Independence Rate 单独等同于真实听力能力。

**隐私与安全：** MVP 不收集真实姓名和账号；交互历史默认仅本地存储。ZIP 导入不执行任意代码、不渲染未净化 HTML；限制解压资源；不把内容包自动上传云端。题目答案在前端可见，因此仅适合练习，不适合正式考试。

## 12. 需在编码前冻结的决策

1. **Schema v1.0**：字段名、枚举、字符索引、时间戳精度、跨文件引用、验证错误格式。
2. **字幕双语策略**：原语言为 Fade 主对象；译文默认按需显示，避免答案一直可见。
3. **档位名称与隐藏预算**：Basic/Balanced/Challenge 的可见性含义及初始默认值。
4. **Checkpoint 行为**：跳过、seek、重复播放、视频结束时的处理。
5. **首个真实样例**：选一段可以嵌入、没有硬字幕、字幕来源可使用的视频，审核至少一份完整 ZIP。

## 13. 开发资源

- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- JSZip: https://stuk.github.io/jszip/
- Zod: https://zod.dev/
- Vite: https://vite.dev/
- Vercel: https://vercel.com/docs

以上是技术入口；实际平台条款与服务能力以开发时官方文档为准。

---

# v1.1 补充：可执行产品规格

> 本节是在 v1.0 基础上的增量补充。它把产品目标转成可开发、可验收的需求，并补充首个原型在真实用户测试前需要冻结的行为。若本节与前文存在冲突，以本节的更具体定义为准；原有文件契约仍保持 v1.0 兼容。

## 14. 用户、场景与核心任务

### 14.1 主要用户

**课外练习的大学语言学习者**：希望使用真实视频练习听力，但不希望一开始就面对完全无字幕的内容。用户通常没有账号，也不应被要求理解内容包、模型或规则引擎。

### 14.2 内容制作者

内容制作者可以是教师、研究人员或个人学习者。其工作发生在 Web App 外部：准备合法字幕、运行 Skill、人工审核并导入 ZIP。MVP 不提供内容制作者后台，因此所有审核责任由内容制作者承担。

### 14.3 用户故事

| 编号 | 用户故事 | 验收结果 |
|---|---|---|
| US-01 | 作为学习者，我想知道一个 ZIP 是否可用，再开始播放。 | 导入后显示标题、语言、时长、字幕数、检查点数和审核状态；失败时显示文件级错误。 |
| US-02 | 作为学习者，我想先听，再在需要时恢复某个词或短语。 | 当前句可单独 Reveal；下一句不继承临时 Reveal。 |
| US-03 | 作为学习者，我想调整整体支持强度。 | 切换档位只影响尚未播放或尚未 Reveal 的后续句子，并显示当前档位含义。 |
| US-04 | 作为学习者，我想知道测验为什么在这里出现。 | 倒计时显示目标时间和覆盖范围；测验题目带字幕或注释依据。 |
| US-05 | 作为学习者，我想跳过不适合当前状态的测验。 | 跳过被记录为 `skipped`，不增加错题或改变掌握估计。 |
| US-06 | 作为内容制作者，我想在导出前发现引用和字符偏移问题。 | 校验脚本阻止无效 ZIP，并输出可定位到文件、字段和 ID 的错误。 |

## 15. 产品成功标准与观测指标

### 15.1 MVP 成功标准

首轮用户测试以“能否顺利完成闭环”为主，不以学习效果证明为目标。满足以下条件才进入下一轮迭代：

1. 3–5 名目标用户中，至少 4 人能在无口头指导下完成导入、开始播放、Reveal、完成或跳过一次检查点。
2. 关键流程没有阻断性错误：ZIP 能导入、字幕能跟随播放、暂停/seek 后不重复触发检查点。
3. 至少 80% 的用户能解释 More Support、Balanced、Challenge 的区别，并能说出自己为什么选择某个档位。
4. 内容制作者能在 10 分钟内定位一条校验错误，并修复后重新打包。

### 15.2 事件与指标

所有事件默认只保存在本机，不含姓名、邮箱或原始字幕内容。建议事件结构：`event_name`、`content_id`、`session_id`、`client_timestamp`、`video_time`、`payload`。

| 事件 | 关键字段 | 用途 |
|---|---|---|
| `package_imported` | 文件大小、验证耗时、cue 数 | 观察导入成功率和性能 |
| `package_rejected` | 错误代码、文件名、字段路径 | 定位内容制作问题 |
| `play_started` / `play_completed` | 起止时间、播放秒数 | 观察实际完成时长 |
| `reveal_clicked` | cue_id、annotation_id、mode | 观察即时求助需求 |
| `support_mode_changed` | from、to、video_time | 观察支持档位是否易懂 |
| `checkpoint_started` / `skipped` / `completed` | checkpoint_id、耗时 | 观察测验打断和完成情况 |
| `quiz_answered` | question_id、结果、attempt_index | 观察题目质量和错误类型 |

不将 `reveal_clicked` 的减少或“不 Reveal”直接解释为听力能力提升；研究报告必须同时说明任务、样本数和视频难度。

## 16. 功能需求明细

### 16.1 导入与验证

**P0-IMP-01** 仅接受 `.zip`，并在浏览器内解压。拒绝嵌套压缩包、可执行文件、HTML、脚本和路径包含 `..` 的条目。

**P0-IMP-02** 限制压缩包大小、条目数和解压后总大小。建议初始值：压缩包 ≤ 10 MB、条目 ≤ 50、解压后 ≤ 50 MB；超过限制时显示可理解的错误码。

**P0-IMP-03** 验证顺序固定为：文件存在性 → JSON 语法 → schema → `content_id` → 时间与字符范围 → 跨文件引用 → 业务规则。错误按文件路径和 JSON 路径排序，避免每次提示顺序变化。

**P0-IMP-04** 导入成功后生成不可变的 `content_snapshot`。播放过程中不重新读取用户选择的文件，也不修改 ZIP 内数据。

**P0-IMP-05** `review_status != approved` 时阻止进入正式学习流；测试环境可以显示“仅供测试”警告，但必须明确这是非正式内容。

### 16.2 播放与字幕

**P0-PLY-01** 播放器状态以 YouTube IFrame API 返回值为准。前端轮询只负责同步界面，不自行推进视频时间。

**P0-PLY-02** 同一时刻最多显示一个 cue。无当前 cue 时显示空状态，不沿用上一句，避免 seek 后出现错误字幕。

**P0-PLY-03** 在播放、暂停、缓冲、播放速率变化和 seek 后均重新计算当前 cue；`currentTime` 变化超过 250 ms 时应更新字幕。

**P0-PLY-04** 视频错误、禁止嵌入、网络失败和视频已删除时显示恢复动作：重新加载、复制 video ID、或返回导入页。错误不应丢失当前本地状态。

**P0-PLY-05** 翻译默认为收起状态；点击后只展开当前 cue 的翻译。翻译开关状态属于会话 UI 偏好，不写入内容包。

### 16.3 支持与隐藏

**P0-SUP-01** 三档名称和含义固定为：

| UI 名称 | 内部值 | 默认隐藏预算 | 说明 |
|---|---|---:|---|
| More Support | `basic` | 0 | 全部显示，适合首次尝试或需要完整提示时 |
| Balanced | `balanced` | 1 | 每句最多隐藏 1 个合格片段，默认档位 |
| Challenge | `challenge` | 2 | 每句最多隐藏 2 个合格片段，不隐藏整句 |

预算是上限，不是必须隐藏的数量；当前句没有合格片段时应完整显示。

**P0-SUP-02** 每个隐藏 span 必须在渲染前通过 `Array.from(source_text)` 建立 code point 数组。禁止直接使用 JS UTF-16 字符串下标处理内容包中的 offset。

**P0-SUP-03** 选择候选后使用稳定排序：`priority_score desc → difficulty desc → annotation_id asc`。同一输入和状态必须产生相同结果。

**P0-SUP-04** Reveal 只改变当前 cue 的显示状态，并写入一次事件；切换 cue 后恢复策略显示。重复点击不累计多次 Reveal。

**P0-SUP-05** UI 可显示简短解释，例如“已根据当前档位隐藏”或“该表达此前答错，暂时保留提示”。解释不暴露内部分数，也不声称用户掌握度。

### 16.4 Checkpoint 与测验

**P0-QUIZ-01** 默认检查点间隔建议为 600 秒（10 分钟），允许内容包通过 `assessment_interval_seconds` 覆盖；有效范围建议 480–720 秒。原有 900 秒包仍可导入，以 manifest 值为准。

**P0-QUIZ-02** 检查点必须同时有 `trigger_time` 和 `resume_time`。`trigger_time` 用于倒计时与触发，`resume_time` 用于暂停后从自然句末继续；缺少 `resume_time` 时由校验脚本拒绝正式包。

**P0-QUIZ-03** 到达 `trigger_time - 10` 秒时显示提示。提示只根据视频时间推进；播放器暂停、缓冲或没有有效 `currentTime` 时不推进倒计时。

**P0-QUIZ-04** 每个检查点包含 3–5 道题，单次测验默认最多 2 分钟。测验中禁止重复触发同一检查点；seek 跨过节点时标记 `pending_review`，允许用户补做或继续。

**P0-QUIZ-05** 每道题必须有可读的答案解释和 evidence。答题后先显示结果，再由用户点击“继续播放”，避免答案动画自动跳过。

**P0-QUIZ-06** 题目选项顺序在会话内保持稳定；若未来随机化，必须在状态中保存随机种子，以便复现结果。

## 17. 播放器与检查点状态机

### 17.1 播放状态

```text
READY
  └─ play → PLAYING
PLAYING ─ pause/buffer → PAUSED_OR_BUFFERING
PAUSED_OR_BUFFERING ─ resume → PLAYING
PLAYING ─ checkpoint trigger → CHECKPOINT_PENDING
CHECKPOINT_PENDING ─ start quiz → QUIZ_ACTIVE
CHECKPOINT_PENDING ─ skip → RESUME_PENDING
QUIZ_ACTIVE ─ submit last answer → QUIZ_RESULT
QUIZ_RESULT ─ continue → RESUME_PENDING
RESUME_PENDING ─ seek/play → PLAYING
PLAYING ─ video end → COMPLETED
任意状态 ─ player error → PLAYER_ERROR
```

### 17.2 状态约束

- `CHECKPOINT_PENDING`、`QUIZ_ACTIVE`、`QUIZ_RESULT` 时禁止自动恢复播放。
- `QUIZ_ACTIVE` 中关闭页面或刷新，当前测验标记为 `abandoned`，不计入正确或错误；MVP 可要求重新上传后从头开始。
- `COMPLETED` 后不再触发新的检查点，但允许回看已完成内容。
- 同一 `checkpoint_id` 的状态只能按 `pending → started/skipped → completed/abandoned` 方向变化。

## 18. 内容包契约补充

### 18.1 manifest 建议增加字段

保持现有字段兼容，建议在 v1.1 内容包中增加：

```json
{
  "package_format": "fade-content",
  "min_app_version": "0.1.0",
  "created_at": "2026-10-27T00:00:00Z",
  "source": {
    "subtitle_filename": "source.srt",
    "license_note": "User-provided subtitle; use permission confirmed"
  },
  "capabilities": {
    "culture_notes": true,
    "translation": true,
    "quiz": true
  }
}
```

`min_app_version` 用于在未来发现兼容性问题时提前阻止导入；MVP 只需校验是否存在并在摘要中显示。

### 18.2 错误代码

错误代码应稳定，文案可以本地化。最低集合：

| 代码 | 含义 |
|---|---|
| `ZIP_TOO_LARGE` | 压缩包或解压后资源超过限制 |
| `MISSING_FILE` | 根目录缺少必需文件 |
| `INVALID_JSON` | JSON 无法解析 |
| `SCHEMA_MISMATCH` | 字段类型、枚举或必填字段不符合 schema |
| `CONTENT_ID_MISMATCH` | 文件之间内容包 ID 不一致 |
| `TIME_RANGE_INVALID` | cue、检查点或注释时间越界/倒序 |
| `CHAR_OFFSET_INVALID` | 字符范围无法切出预期文本 |
| `REFERENCE_NOT_FOUND` | 题目、词汇或文化注释引用不存在 |
| `REVIEW_REQUIRED` | 内容未达到 approved 状态 |
| `VIDEO_NOT_EMBEDDABLE` | 播放器无法嵌入该视频 |

## 19. 可访问性与响应式要求

- 所有播放器外控制、档位按钮、Reveal、翻译开关和测验操作支持键盘访问，并有可见焦点。
- 遮挡字幕不能只使用颜色表达状态；至少同时使用文字、边框或图标。
- 文字与背景满足 WCAG AA 对比度；字幕字号在移动端不得小于 16 px，允许用户放大。
- `prefers-reduced-motion: reduce` 时关闭奖励动画和倒计时弹跳效果。
- 移动端以单列布局为默认：播放器、字幕、支持控制、检查点信息依次排列；横屏时允许字幕区域保持可读宽度。
- 测验错误提示使用 `aria-live`，焦点在打开对话框后移到题干，关闭后返回触发按钮。

## 20. 失败场景与恢复策略

| 场景 | 用户看到的结果 | 是否允许继续 |
|---|---|---|
| ZIP 缺文件 | 显示文件名和修复建议 | 否 |
| 字幕 offset 错误 | 显示 cue/annotation ID 和期望片段 | 否 |
| 视频禁止嵌入 | 显示原因与返回导入按钮 | 否 |
| 网络临时失败 | 保留导入摘要和本地状态，提供重试 | 视播放器恢复而定 |
| seek 越过检查点 | 显示“已跳过，可补做” | 是 |
| 刷新页面 | MVP 清空当前内存会话并提示重新上传；若启用 IndexedDB 则恢复 | 是 |
| 浏览器不支持 API | 显示兼容性提示和最低要求 | 否 |

## 21. 测试矩阵

### 21.1 自动化测试

- schema：缺文件、类型错误、枚举错误、`content_id` 不一致。
- 时间：cue 重叠、倒序、越过视频总时长、最后 cue 无可靠结束时间。
- offset：ASCII、emoji、组合字符、泰语等无空格语言；确认 code point 切片结果。
- 规则：三档预算、候选排序、错题后 support 增加、跳过不更新、同状态确定性。
- 检查点：暂停倒计时、重复触发防护、seek 跨越、视频结束补测验。

### 21.2 手工验收

1. 使用现有 `fade-spanish-demo.zip` 完成一次完整流程。
2. 在 0.5x、1x、1.5x 播放速率下检查字幕同步。
3. 在 cue 中间暂停、拖动到前后 1 秒，确认无残留字幕和重复弹窗。
4. 在手机窄屏和键盘操作下完成一次 Reveal 与测验。
5. 导入第二个 `content_id`，确认上一包的 Reveal、错题和检查点状态不串用。

## 22. 研发拆分与交付物

| 迭代 | 交付物 | 完成定义 |
|---|---|---|
| Sprint 0 | Schema、错误代码、demo fixture | 校验脚本与前端共享同一字段契约 |
| Sprint 1 | ZIP 导入和摘要 | 合法包成功，非法包给出稳定错误 |
| Sprint 2 | 播放器与字幕同步 | 播放/暂停/seek/倍速均无明显漂移 |
| Sprint 3 | 隐藏、Reveal、翻译 | 三档策略和当前句 Reveal 可复现 |
| Sprint 4 | Checkpoint 与 Quiz | 倒计时、暂停、跳过、评分和解释完成 |
| Sprint 5 | 本地状态与完成页 | 重载行为明确，报告不夸大能力 |
| Sprint 6 | 可用性与部署 | 3–5 人测试完成，阻断问题关闭 |

每个迭代结束都应更新 `README.md` 的运行方式和已知限制，避免 PRD、原型和内容包行为漂移。

## 23. 待冻结决策（带推荐值）

| 决策 | 推荐值 | 决策理由 |
|---|---|---|
| 默认检查点间隔 | 600 秒 | 更接近 8–12 分钟练习段，降低一次测验打断长度 |
| 默认支持档 | `balanced` | 兼顾首次可用与听力挑战；导入摘要允许用户更改 |
| 翻译默认状态 | 当前 cue 收起 | 避免用户直接阅读译文而跳过听力 |
| 刷新后的状态 | P0 重新上传；P1 IndexedDB 恢复 | 先降低数据持久化复杂度 |
| 硬字幕视频 | 显示警告并允许返回 | 硬字幕不可由 Fade 控制，不能假装已被隐藏 |
| 题目随机化 | P0 不随机 | 便于复现、测试和解释 |
| 隐藏 span 重叠 | 拒绝正式包 | 避免前端优先级规则制造不可解释结果 |
| 文化注释 | 只显示 `approved` | 降低错误事实和语用误导风险 |

## 24. v1.1 变更摘要

- 把学习者、内容制作者和两类核心任务明确分开。
- 增加用户故事、成功标准、事件指标和稳定错误代码。
- 明确导入限制、播放器状态机、检查点状态机和失败恢复行为。
- 将支持档位、Reveal、offset、题目证据和测验触发规则转成可验收需求。
- 补充 manifest 兼容字段、可访问性、响应式和测试矩阵。
- 推荐把默认检查点从 900 秒调整为 600 秒，同时保留对现有 900 秒内容包的兼容。

**文档状态：** v1.1 draft，已纳入 LinguaEdge 参考案例的可见信息架构；待产品、内容审核和前端实现负责人共同冻结第 23 节决策后进入编码基线。

## 25. 参考案例：LinguaEdge 的信息架构借鉴

### 25.1 参考来源与可观察信息

参考小红书笔记《文科生第一次尝试用Claude Code搭建网站》（LinguaEdge）。页面介绍将其描述为一站式英语口语学习网站；视频画面可见顶部学习类别导航、课程/材料列表，以及中央视频学习区。笔记评论提及视频播放和听写。该参考只用于借鉴网站的信息组织方式，不视为对其全部功能、实现或学习效果的验证。

### 25.2 可借鉴的产品结构

LinguaEdge 的可见结构让用户能从学习类别进入材料，再进入实际练习。Fade 可以借鉴这条浅层导航路径，并将其映射到自身内容：

```text
Fade Listening
├── 内容入口
│   ├── 导入内容包（P0）
│   ├── 最近练习 / 示例内容（本地会话级，P1）
│   └── 按语言或主题筛选已导入内容（P2）
├── 学习工作区
│   ├── 当前视频与字幕
│   ├── 字幕支持控制与 Reveal
│   ├── 译文、词汇、文化注释
│   └── 下一个检查点
└── 本次练习回顾
    ├── 已完成 / 跳过的检查点
    ├── 错题与证据
    └── 待复习表达
```

### 25.3 对现有页面结构的调整建议

- **内容入口页：** 保持 ZIP 导入为主入口；当本机有示例包或最近导入包时，可以用课程卡片呈现标题、目标语言、主题、时长、内容审核状态和继续练习动作。P0 不建立云端课程库或用户账户。
- **学习工作区：** 桌面端采用“内容导航 / 主学习区”的层级：侧栏显示当前内容包的章节或检查点，主区域保留视频播放器、播放器下方字幕、支持控制和检查点状态。若内容包没有章节信息，按时间区间或字幕段落分组生成简单目录，不声称是场景切分。
- **移动端：** 侧栏改为顶部内容选择或抽屉；视频和字幕仍是首要区域，不能为了复刻参考案例而把播放器缩小到难以观看。
- **练习回顾：** 继续使用本地完成页，提供回看错题片段、复习词汇和再次练习的入口；不变成综合学习仪表盘，也不展示未验证的能力排名。

### 25.4 保留 Fade 的产品定位

参考案例包含面向英语口语的综合学习平台形态；Fade Listening 仍聚焦“外语视频听力 + 经审核的双语字幕淡出 + 可即时恢复支持 + 基于内容证据的短测验”。因此：

- 可借鉴课程入口、材料列表、清楚的学习工作区和练习后回顾。
- 不把开放式口语对话、AI 口语评分、通用听写工具、多个技能课程频道加入 P0。
- 不以“功能更多”作为产品目标；新增模块必须帮助用户更好地完成当前视频听力练习闭环。
- “最近练习”若进入 P1，只能保存本地元数据与进度；内容包和学习状态不自动上传。

### 25.5 对里程碑的影响

此参考不增加两周 MVP 的工程范围。P0 继续沿用第 6 节的单一导入入口、学习播放器和完成页。页面信息架构可在现有原型中渐进演进：

1. 先把导入页的示例包呈现为明确的内容卡片，并展示语言、时长、审核状态。
2. 播放页加入内容标题与本包检查点导航，不改变播放器外字幕和视频时间同步。
3. 完成页增加“回看错题片段 / 复习表达 / 再练一次”的动作。
4. 只有在用户测试证明确有多内容管理需求后，再增加最近练习或本地内容库。

## 26. v1.2 今晚至明天下午的 MVP 范围冻结

### 26.1 目标与交付物

短期目标不是做一个完整语言学习平台，而是在明天下午前尽量跑通一次可演示的单集听力练习。只交付两个相互配合的东西：

1. **Fade Preprocessor Skill**：接收用户已经取得的带时间戳字幕、视频信息和语言对；分析并生成学习内容数据，做确定性校验后打成 ZIP。
2. **Fade Listening Web App**：上传 Skill 输出的 ZIP，播放对应的 YouTube 视频，在播放器下方同步显示字幕，按本地规则隐藏语言片段，并完成视频结束后的测验。

网页端不调用 AI API。AI 分析使用用户自己已有的 ChatGPT、Codex 或其他工具；Web App 不需要 API Key、账号、后端或模型服务。

### 26.2 明确的输入前提

- 用户已通过现成工具取得带时间戳的字幕；Fade 不负责从 YouTube 抓取字幕、转录音频或下载视频。
- 输入可以是如下格式的时间戳文本；时间戳表示字幕片段开始时间：

```text
[00:00:08] Esta es la historia de Lola y Ana que
[00:00:11] comparten un piso en España tienen un
[00:00:15] vecino Pablo a Pablo le gusta Lola y a
```

- 用户提供视频 URL / video ID、字幕文件、目标语言和翻译语言。首个演示使用用户已选定的西语短剧：`cICqwDkewYo`，单集约 20 多分钟。
- 该视频没有内嵌字幕；Fade 显示的是包内字幕。YouTube 自带 CC 不是产品字幕来源，是否可关闭不构成该样例的前置条件；若画面存在硬字幕，内容制作者需在审核报告中记录。

### 26.3 Skill 的最小职责

Skill 的职责是把“原始带时间戳字幕”整理成“可审核、可播放、可出题的学习内容包”，而不是自动生成完整课程：

1. 解析时间戳文本，检查时间顺序、空行、重复时间和不合理间隔。
2. 根据上下文重建句子边界，保留每条原始字幕的来源 ID 和时间范围；重建不确定处标记审核。
3. 生成目标语言原文与翻译语言译文。
4. 标注值得用于 Fade 的词汇/表达，包括文本范围、词性或语言类别、难度级别、翻译/释义、是否允许隐藏及审核状态。可包括名词、动词、形容词、语法结构和惯用表达。
5. 词汇等级作为可解释的内容估计，不代表学习者水平。采用 CEFR 时需标注其为近似标签；对没有可靠 CEFR 资源的语言，允许输出 `unknown` 并要求人工复核，不能把跨语言的难度标签当成完全等价。
6. 只在有根据时加入文化/语用注释；不确定项标记待审核，不进入正式展示。
7. 基于本集字幕和已审核知识点生成**集后测验**。每题必须关联字幕或知识点证据；没有依据时不出题。
8. 执行 JSON、引用、时间范围和字符 offset 校验，生成审核报告并打包 ZIP。

Skill P0 输出仍采用 `manifest.json`、`subtitles.json`、`quizzes.json`、`vocabulary.json`、`culture.json` 和 `review-report.md`。如要实现可靠词性与词汇等级筛选，标注中需增加明确字段，例如 `part_of_speech`、`level_system`、`level` 和 `lemma`；不要只把这些信息埋在自由文本说明中。

### 26.4 Web App 的最小职责

- 上传并校验 Skill 生成的 ZIP，展示内容标题、语言、视频、字幕数量、词汇/表达标注数和审核状态。
- 嵌入已选定的 YouTube 视频，并根据实际播放时间显示当前句级字幕；字幕位于播放器下方。
- 按内容包内审核通过的注释和用户选择的规则隐藏文本片段。最小规则应支持按语言标签筛选，例如“隐藏 B1 的名词和动词”；具体选项由包内实际标签决定，未标注或未审核内容默认显示。
- 提供 Reveal 当前句、完整支持/显示译文等学习控制；隐藏不得阻止用户恢复文本。
- 视频播放完成后出现本集测验；允许用户逐题作答、查看解释和证据，并查看本次练习摘要。
- 学习状态与设置只在当前浏览器本地保存；刷新后是否恢复不属于最小闭环要求。

### 26.5 单集测验与原检查点设计的取舍

明天下午演示版采用**视频结束后的集后测验**。不要求中途每 900 秒或 600 秒暂停，也不要求本集切成多个检查点。原因是当前验证重点为“字幕分析包 → 视频同步和淡出 → 内容相关测验”这一整条链路，避免 checkpoint 调度成为首轮实现阻塞。

如果 20 多分钟的完整视频不适合一次测试，可在测试流程中选择短片段或把视频 seek 到指定范围演示；不因此在 P0 里增加分段管理、断点续播或多检查点系统。多检查点可保留为后续版本选项。

### 26.6 今晚至明天下午的执行顺序

| 顺序 | 交付 | 明天下午前的完成定义 |
|---|---|---|
| 1 | 冻结最小数据结构 | 输入格式、词性/级别标签、隐藏 offset、测验证据字段可供 Skill 和 Web 共用 |
| 2 | 准备一个真实内容包 | 使用目标西语短剧的字幕生成 ZIP；校验通过，至少抽查句子、offset 和题目依据 |
| 3 | 完成 Web 主链路 | ZIP 导入 → 播放器加载 → 当前字幕同步 → 至少一种按标签隐藏 → Reveal |
| 4 | 完成集后测验 | 视频结束后可答题、显示解释并看到练习摘要 |
| 5 | 做一次演示验收 | 用目标视频验证导入、播放、字幕时间大体匹配、隐藏/Reveal 和测验闭环 |

若时间不足，优先保证真实包可导入、播放器与字幕同步、至少一种明确隐藏规则和一组有证据的集后题目。文化弹窗、奖励动画、多档自适应、持久化、最近练习、课程筛选与多语言复杂支持均不阻塞本次演示。

### 26.7 对前文范围的解释

本节是本轮开发的最高优先级范围。前文的 900 秒/600 秒 checkpoint、多 checkpoint 状态机、IndexedDB、最近练习/本地内容库以及课程筛选属于后续设计候选，不是明天下午前必须交付的 P0。仍保留两个关键原则：内容由 Skill 预处理并经审核；播放中 Web App 只执行确定性本地规则，不调用 AI。

**当前交付判断：** 这条架构可行，且比在 Web App 中集成 AI API 更适合短周期原型。最大实现风险集中在字幕断句/标注质量、字符范围正确性、YouTube 视频时间同步和真实内容包校验；优先把这些做成可见、可复现的闭环。

## 27. 当前核心功能与优先级

### 27.1 一句话定义

Fade Listening 当前不是口语平台，也不是通用语言学习平台。它是一个**把带时间戳字幕加工成可交互听力练习的工具**：Skill 负责内容准备，Web App 负责视频播放、字幕淡出、即时恢复和测验。

### 27.2 P0：明天下午前必须完成

#### A. Fade Preprocessor Skill

1. **读取字幕文件**：支持 `[HH:MM:SS] text`、SRT 或已约定的兼容格式。
2. **规范化时间戳**：检查顺序、重复、空文本和异常间隔。
3. **句子重建**：将跨多条时间戳的字幕整理为可读句子，同时保留原始 cue 来源和时间范围。
4. **语言分析标注**：至少输出文本片段、词性/类别、难度或等级、翻译/释义、`hide_eligible`、审核状态和字符 offset。
5. **生成双语字幕**：原文、译文、时间范围和标注放入统一 JSON。
6. **生成一组集后测验**：每题基于字幕或标注证据，带正确答案和解释。
7. **校验并打包 ZIP**：检查 JSON、字符范围、引用关系和审核状态。

#### B. Fade Listening Web App

1. **上传 ZIP 并验证**：缺文件、JSON 错误、引用错误和未审核内容要明确报错。
2. **加载 YouTube 视频**：使用包内 video ID 播放目标视频。
3. **按播放时间显示字幕**：字幕在播放器下方，至少做到句级同步。
4. **按规则隐藏片段**：优先实现一种清楚的规则，例如选择一个等级后隐藏对应的已审核词汇/表达。
5. **Reveal**：当前句点击后恢复隐藏片段，并立即记录行为。
6. **显示译文**：默认收起，用户主动展开。
7. **集后测验**：视频结束或手动结束后显示题目，支持答题、评分、解释和证据。
8. **练习摘要**：显示答题结果、Reveal 次数和待复习表达。

### 27.3 P1：核心闭环跑通后再做

- More Support / Balanced / Challenge 三档支持强度。
- 按词性、等级、难度、表达类别组合筛选隐藏规则。
- 错题和 Reveal 影响后续隐藏策略。
- 文化注释弹窗和词汇复习面板。
- 播放中途 checkpoint 测验。
- 本地保存内容包和练习进度。
- 更完整的错误展示、移动端适配和键盘可访问性。

这些功能会提升体验，但不应阻塞第一条真实内容的导入、播放、隐藏和测验闭环。

### 27.4 P2：暂不进入当前原型

- 口语录音、AI 口语评分、对话练习。
- 通用听写模式、语音识别和发音分析。
- 账号、云端同步、教师后台、班级管理。
- 内容商城、公开课程库、推荐系统。
- 网页内调用 AI API 或实时 AI 推理。
- 自动抓取 YouTube 字幕、下载视频、去除硬字幕。
- 多人协作、排行榜、社交功能和商业化能力。

### 27.5 优先级判断规则

开发中遇到取舍时，按以下顺序判断：

1. 是否直接支持“字幕包 → 播放 → 字幕淡出 → Reveal → 测验”这条链路？如果不支持，降为 P1 或 P2。
2. 是否需要新的外部服务、账号或 AI API？如果需要，当前版本不做。
3. 是否会影响字幕时间同步、字符 offset 或内容包校验？如果会，优先修复，因为这是整个产品的基础。
4. 是否只是视觉装饰或平台化能力？放到核心闭环验证之后。

### 27.6 最终 P0 验收清单

- [ ] 用户可以用目标西语短剧的真实字幕生成 ZIP。
- [ ] Web App 可以成功导入该 ZIP，并显示内容摘要。
- [ ] YouTube 视频可以播放，字幕跟随视频时间出现。
- [ ] 至少一种已审核语言片段会按规则隐藏。
- [ ] 用户可以 Reveal 当前句并看到完整文本。
- [ ] 译文可以按需展开。
- [ ] 视频结束后可以完成一组有证据的测验。
- [ ] 练习结果可以在页面上看懂，且不被描述成语言能力诊断。

**结论：** 当前最重要的不是做更多学习功能，而是证明一个内容包可以稳定驱动一次完整的听力练习。只要 P0 验收清单跑通，Fade Listening 的产品方向就有了可演示、可测试的第一版。
