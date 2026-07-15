// galgame-companion v0.3.1 — built 2026-07-15T10:19:58.736Z
(() => {
  // src/env.js
  var SCRIPT_NAME = "School-Companion";
  var VERSION = "0.3.1";
  var DOC = typeof window !== "undefined" && window.parent && window.parent.document || document;
  var topWindow = typeof window !== "undefined" && window.parent || window;
  var DEBUG = true;
  var log = {
    info: (...a) => {
      if (DEBUG) console.log(`[${SCRIPT_NAME}]`, ...a);
    },
    warn: (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a),
    error: (...a) => console.error(`[${SCRIPT_NAME}]`, ...a)
  };

  // src/i18n-dict.js
  var DICT = {
    // --- common actions / buttons ---
    "导入": "Import",
    "导出": "Export",
    "发送": "Send",
    "确定": "OK",
    "试听": "Preview",
    "全屏": "Fullscreen",
    "关于": "About",
    "下一句": "Next",
    "快进": "Fast-forward",
    "刷新视图": "Refresh view",
    "视图已刷新": "View refreshed",
    "复制全部": "Copy all",
    "重绘当前": "Redraw current",
    "查看提示词": "View prompt",
    "添加角色": "Add Character",
    "生成背景图片": "Generate Background",
    "保存音色列表": "Save voice list",
    // --- top-level sections ---
    "基础设置": "Basic settings",
    "显示设置": "Display settings",
    "世界书设置": "Worldbook Settings",
    "资源管理": "Asset management",
    "模型管理": "Model management",
    "快捷键": "Shortcuts",
    "立绘设置": "Sprite settings",
    "快进设置": "Fast-forward settings",
    "连接配置": "Connection profile",
    "第二次生成配置": "Second-pass config",
    "当前角色卡独立设置": "Per-character-card settings",
    "插件发布地址": "Plugin release page",
    // --- galgame mode / choices ---
    "进入 Galgame 模式": "Enter Galgame Mode",
    "正在开启 Galgame 模式...": "Entering Galgame mode...",
    "Galgame 模式已开启": "Galgame mode enabled",
    "Galgame 模式已关闭": "Galgame mode disabled",
    "请先开启 Galgame 模式": "Enable Galgame mode first",
    "请选择行动": "Choose an action",
    "剧情选项": "Story choices",
    "剧情回顾": "Story recap",
    "沉浸模式": "Immersive mode",
    "自由对话": "Free chat",
    "自由输入": "Free input",
    "自动播放": "Auto-play",
    "简化图书绘本模式": "Simplified picture-book mode",
    "智能判断主界面显示": "Smart main-view detection",
    // --- enhanced mode / worldbook ---
    "加强模式": "Enhanced mode",
    "启用加强模式": "Enable enhanced mode",
    "加强模式提示词": "Enhanced mode prompt",
    "两次生成策略：内容创作 + COT格式化": "Two-pass strategy: content creation + COT formatting",
    "不使用任何世界书": "Don't use any worldbook",
    "不使用自定义世界书(默认选择)": "Don't use custom worldbook (default)",
    "使用以下世界书：": "Use the following worldbook:",
    "使用当前模型": "Use current model",
    "使用当前连接配置": "Use current connection profile",
    "使用当前预设": "Use current preset",
    "使用酒馆代理": "Use SillyTavern proxy",
    "模型": "Model",
    "预设": "Preset",
    "模型切换模式": "Model switch mode",
    "严格切换": "Strict switch",
    "暂无可用的世界书": "No worldbooks available",
    "暂无提示词记录": "No prompt records yet",
    // --- TTS / voices ---
    "TTS引擎": "TTS Engine",
    "TTS配音": "TTS Voice",
    "启用TTS配音": "Enable TTS voice",
    "TTS引擎已切换": "TTS engine switched",
    "TTS引擎已切换，COT已更新": "TTS engine switched, COT updated",
    "GPT-SoVITS（api_v2.py）设置": "GPT-SoVITS (api_v2.py) Settings",
    "set_model 接口": "set_model endpoint",
    "API地址": "API URL",
    "音色列表（JSON）": "Voice list (JSON)",
    "音色列表 JSON 解析失败": "Voice list JSON parse failed",
    "音色列表必须是数组": "Voice list must be an array",
    "默认音色": "Default voice",
    "默认女声列表": "Default female voice list",
    "默认男声列表": "Default male voice list",
    "男声/女声": "Male/Female voice",
    "该音色已在列表中": "Voice already in list",
    "请先切换为 GPT-SoVITS": "Switch to GPT-SoVITS first",
    "请先配置至少一个可用音色（refAudioPath 不能为空）": "Configure at least one usable voice first (refAudioPath cannot be empty)",
    "上方仅用于挑选候选音色，选中后会立即加入下方列表。": "The list above is only for picking candidate voices; selecting one adds it to the list below.",
    "当前为空（从上方选择音色即可加入）。": "Currently empty (select a voice above to add).",
    "选择后立即加入列表": "Adds to the list immediately when selected",
    "中日双语模式": "Chinese-Japanese bilingual mode",
    "按“中文文本[JP]日文文本”输出（兼容【JP】）；未命中时自动回退原文朗读。": 'Output as "Chinese[JP]Japanese" (【JP】 also accepted); falls back to the original when no marker.',
    "(切段自动朗读)": "(Auto-read on segment)",
    "(失败不回退)": "(No fallback on failure)",
    "(显示中文，TTS发送日文)": "(Show Chinese, TTS speaks Japanese)",
    // --- image / background generation ---
    "ComfyUI 背景生成": "ComfyUI Background Generation",
    "NovelAI 背景生成": "NovelAI Background Generation",
    "大香蕉背景生成": "Big Banana background generation",
    "Wallhaven 背景搜索": "Wallhaven Background Search",
    "图片生成中...": "Generating image...",
    "质量档位": "Quality level",
    "High（高画质）": "High (High quality)",
    "Balanced（默认）": "Balanced (Default)",
    "Mobile（省电）": "Mobile (Power saving)",
    "1:1（正方形）": "1:1 (Square)",
    "2:3（默认竖版）": "2:3 (Default portrait)",
    "3:4（常用竖版）": "3:4 (Common portrait)",
    "4:5（偏方竖版）": "4:5 (Tall-ish portrait)",
    "9:16（长竖版）": "9:16 (Tall portrait)",
    "none（不自动切换）": "none (No auto-switch)",
    "(漫画风格)": "(Comic style)",
    // --- display / appearance ---
    "文本显示": "Text display",
    "文字特效": "Text effect",
    "文字描边": "Text stroke",
    "发光效果": "Glow effect",
    "打字机显示": "Typewriter effect",
    "打字速度": "Typing speed",
    "打字音效": "Typing sound",
    "对话字体": "Dialogue font",
    "字体大小": "Font size",
    "对话框缩放": "Dialogue box scale",
    "对话框透明度": "Dialogue box opacity",
    "背景图填充": "Background fill",
    "底部渐变遮罩": "Bottom gradient overlay",
    "毛玻璃背景": "Frosted glass background",
    "独立文字背景": "Separate text background",
    "界面皮肤": "UI skin",
    "情境样式": "Scene style",
    "底栏缩放": "Bottom bar scale",
    "Cover (填满裁剪)": "Cover (Fill / crop)",
    "Contain (完整显示)": "Contain (Fit)",
    "(cover填满/contain完整)": "(cover = fill / contain = fit)",
    // --- fonts ---
    "现代黑体（默认）": "Modern sans-serif (default)",
    "思源宋体": "Source Han Serif",
    "霞鹜文楷": "LXGW WenKai",
    "经典楷体": "Classic Kai",
    "等宽字体": "Monospace",
    // --- skins ---
    "墨染千秋（中国古风）": "Ink Dynasty (Chinese classical)",
    "心之怪盗（女神异闻录）": "Phantom Thieves (Persona)",
    "苍穹之庭（日式奇幻）": "Azure Court (Japanese fantasy)",
    "樱色物语（经典Galgame）": "Sakura Story (Classic Galgame)",
    // --- sprites / Live2D ---
    "显示立绘": "Show sprites",
    "立绘大小": "Sprite size",
    "立绘间距": "Sprite spacing",
    "无立绘时显示添加框": "Show add-box when no sprite",
    "Live2D 版权与使用声明": "Live2D Copyright & Usage Notice",
    "垂直位置": "Vertical position",
    "(左右距离)": "(Horizontal distance)",
    "(底部偏移)": "(Bottom offset)",
    "添加立绘": "Add sprite",
    // --- effects ---
    "Pixi特效": "Pixi Effects",
    "启用特效": "Enable effects",
    "说话者光晕": "Speaker glow",
    "气泡指示器": "Bubble indicator",
    "阴影增强": "Shadow boost",
    "(轮廓发光)": "(Outline glow)",
    // --- fast-forward / playback ---
    "快进速度": "Fast-forward speed",
    "播放间隔": "Playback interval",
    "并发上限": "Concurrency limit",
    "切场景自动清空": "Auto-clear on scene change",
    "切换设置": "Switch settings",
    // --- audio ---
    "音效音量": "Sound volume",
    // --- toasts / status ---
    "消息已发送": "Message sent",
    "已复制到剪贴板": "Copied to clipboard",
    "复制失败": "Copy failed",
    "生成中": "Generating",
    "正在初始化...": "Initializing...",
    "正在重新生成...": "Regenerating...",
    "重新生成失败": "Regenerate failed",
    "未找到重新生成按钮": "Regenerate button not found",
    "快速回退中...": "Rewinding...",
    "已快进到最后": "Fast-forwarded to end",
    "已回退到最早AI楼层": "Rewound to earliest AI message",
    "已是最早AI楼层": "Already at earliest AI message",
    "已添加音色：": "Voice added:",
    "标题背景上传成功": "Title background uploaded",
    "标题背景上传失败": "Title background upload failed",
    "暂无历史记录": "No history yet",
    "点击空白处关闭": "Click outside to close",
    // --- mobile menu labels (custom-skin-footer-buttons.js) ---
    "历史": "Log",
    "退出": "Exit",
    "原界面": "Original UI",
    "设置": "Settings",
    "存档": "Save",
    "读档": "Load",
    "时间线": "Timeline",
    "上一段": "Prev",
    "下一段": "Next",
    "选项": "Choices",
    // --- misc ---
    "全局Debug日志": "Global debug log",
    "当前表情": "Current Expression",
    "无": "None",
    "默认": "Default",
    "（不指定）": "(Not specified)",
    "(关闭后不可点击上传)": "(Cannot upload when disabled)",
    "(隐藏其他楼层)": "(Hide other messages)",
    "关闭：简单对话格式，表情在结尾": "Off: simple dialogue format, expression at end",
    "开启：对话格式含TTS属性，表情在开头": "On: dialogue format with TTS attributes, expression at start",
    "(纯文本对话框，不解析角色/旁白/表情，不显示立绘/Live2D)": "(Plain-text dialogue; no character/narration/expression parsing, no sprites/Live2D)",
    "旁白": "Narration",
    "许可协议（CC BY-NC-SA 4.0）": "License (CC BY-NC-SA 4.0)",
    "法律合规声明": "Legal compliance notice",
    // ═══ v0.3 harvest (live v2.1, 2026-07-15) — galgame chrome only. Deliberately SKIPPED:
    // story text, speaker labels, ST preset/lorebook entry names, Tavern Helper's own UI,
    // and TTS voice names (proper nouns). ═══
    // --- asset manager: tabs / packs / sprites ---
    "立绘管理": "Sprite Manager",
    "背景管理": "Background Manager",
    "生图配置": "Image Gen Config",
    "指定BGM": "BGM Playlist",
    "自定义模块": "Custom Modules",
    "未定义": "Undefined",
    "当前角色": "Current character",
    "无立绘": "No sprite",
    "点击上传立绘": "Click to upload sprite",
    "表情标签": "Expression tags",
    "暂无已指定角色": "No characters assigned yet",
    "删除角色": "Delete character",
    "批量上传": "Batch upload",
    "添加背景": "Add background",
    "新建图包": "New pack",
    "管理图包": "Manage packs",
    "切换图包": "Switch pack",
    "转移到其他图包": "Move to another pack",
    "仅当前图包资源": "Current pack assets only",
    "暂无背景，点击上方按钮添加": "No backgrounds yet — add one with the buttons above",
    '背景图将根据 <background scene="场景名" /> 标签自动匹配': 'Backgrounds auto-match the <background scene="name" /> tag',
    "导入资源": "Import assets",
    "导出资源": "Export assets",
    "本地压缩包导入": "Import local zip",
    "远程压缩包导入": "Import remote zip",
    "从GitHub导入": "Import from GitHub",
    "导入远程链接JSON": "Import remote JSON link",
    "导出本地压缩包": "Export local zip",
    "导出GitHub资源包": "Export GitHub asset pack",
    "导出打包角色卡(JSON)": "Export bundled character card (JSON)",
    "导入 JSON": "Import JSON",
    // --- image gen config ---
    "背景图来源": "Background source",
    "关闭": "Off",
    "ComfyUI 文生图": "ComfyUI text-to-image",
    "API 地址": "API URL",
    "测试连接": "Test connection",
    "工作流管理 (.json)": "Workflow manager (.json)",
    "暂无导入的工作流": "No workflows imported",
    "默认角色 Workflow": "Default character workflow",
    "默认背景 Workflow": "Default background workflow",
    "默认 Checkpoint 模型": "Default checkpoint model",
    "(加载中...)": "(Loading...)",
    "内置 SDXL Turbo": "Built-in SDXL Turbo",
    "负面提示词": "Negative prompt",
    "刷新模型列表": "Refresh model list",
    "点击刷新获取模型列表": "Click refresh to fetch the model list",
    "默认提示词前缀": "Default prompt prefix",
    "默认提示词后缀": "Default prompt suffix",
    "大香蕉": "Big Banana",
    "大香蕉生图模块": "Big Banana image-gen module",
    "NovelAI 生图": "NovelAI image gen",
    "Wallhaven 壁纸搜索": "Wallhaven wallpaper search",
    "反代 API 地址": "Proxy API URL",
    "反代 API Key": "Proxy API Key",
    "API Key（可选）": "API Key (optional)",
    "留空使用公开 API": "Leave blank for the public API",
    "手机或 AI 官网用": "For mobile or the AI vendor site",
    "通过反代 API 生成背景图片，生成后自动保存到背景库。": "Generates backgrounds via the proxy API; results auto-save to the background library.",
    "生成成功后自动添加到背景资源库": "Auto-add to the background library after generation",
    "自动保存到背景库": "Auto-save to background library",
    "保存到背景库": "Save to background library",
    "手动生成背景": "Generate background manually",
    "场景名称（如：教室、森林）": "Scene name (e.g. classroom, forest)",
    "自定义提示词（可选）": "Custom prompt (optional)",
    "生成预览：": "Preview:",
    "生图COT自定义": "Image-gen COT custom rules",
    "可填写额外规则": "Optional extra rules",
    "图片尺寸": "Image size",
    "图片生成模型": "Image model",
    "生成图片比例": "Image aspect ratio",
    "选择生成CG图片的比例": "Aspect ratio for generated CGs",
    "CG模式": "CG mode",
    "开启：生成包含人物的剧情CG | 关闭：生成纯场景背景": "On: story CGs with characters | Off: pure scene backgrounds",
    "开启：允许人物关键词 | 关闭：只搜环境背景": "On: allow character keywords | Off: environment-only search",
    "指定人物外观（最多3个）": "Pin character appearances (max 3)",
    // --- wallhaven search ---
    "人物写真": "People",
    "动漫漫画": "Anime/Manga",
    "综合壁纸": "General",
    "SFW (安全)": "SFW (Safe)",
    "Sketchy (略敏感)": "Sketchy",
    "安全级别": "Safety level",
    "图片分类": "Categories",
    "自定义标签": "Custom tags",
    "多个标签用逗号分隔": "Separate tags with commas",
    "例如: cosplay, landscape, 4k": "e.g. cosplay, landscape, 4k",
    "最新上传": "Latest",
    "浏览量": "Views",
    "收藏量": "Favorites",
    "相关度": "Relevance",
    "随机": "Random",
    "排序方式": "Sort by",
    "排行榜": "Toplist",
    "排行榜时间范围": "Toplist range",
    "1天": "1 day",
    "3天": "3 days",
    "1周": "1 week",
    "1个月": "1 month",
    "3个月": "3 months",
    "6个月": "6 months",
    "1年": "1 year",
    // --- resolution / ratio options ---
    "1024 x 1024 (正方形)": "1024 x 1024 (Square)",
    "1216 x 832 (横屏 3:2)": "1216 x 832 (Landscape 3:2)",
    "832 x 1216 (竖屏 2:3)": "832 x 1216 (Portrait 2:3)",
    "1472 x 704 (宽银幕)": "1472 x 704 (Widescreen)",
    "704 x 1472 (超竖屏)": "704 x 1472 (Extra tall)",
    "16:9 (横屏)": "16:9 (Landscape)",
    "21:9 (宽银幕)": "21:9 (Widescreen)",
    "2:3 (竖屏)": "2:3 (Portrait)",
    "3:2 (横屏)": "3:2 (Landscape)",
    "3:4 (竖屏)": "3:4 (Portrait)",
    "4:3 (横屏)": "4:3 (Landscape)",
    "9:16 (竖屏)": "9:16 (Portrait)",
    // --- BGM playlist tab ---
    "指定BGM歌单（注入到COT规则）": "BGM playlist (injected into COT rules)",
    "保存歌单": "Save playlist",
    "说明：": "Notes:",
    "2. 留空并保存则取消限制，恢复原有通用 BGM 规则。": "2. Save empty to lift the restriction and restore the generic BGM rules.",
    "3. 建议填写你确认可搜索到的曲名（尽量完整、标准）。": "3. Use song titles you know are searchable (complete + standard).",
    // --- custom modules tab ---
    "地点状态栏 - 自定义内容格式要求（注入到世界书）": "Location status bar — custom content format (injected into the worldbook)",
    "时间状态栏 - 自定义内容格式要求（注入到世界书）": "Time status bar — custom content format (injected into the worldbook)",
    "保存配置": "Save config",
    "1. 保存后，若填写了内容，会自动同步到世界书并注入标签：": "1. On save, filled content auto-syncs to the worldbook and injects the tags:",
    "2. 点击状态栏弹窗只读取当前消息中的标签内容，不再直接显示这里输入的备用内容。": "2. The status-bar popup reads only the tags in the current message — it no longer shows this fallback content directly.",
    "3. 支持标准 HTML 和内联样式，建议保持简洁，不要放脚本标签。": "3. Standard HTML + inline styles supported; keep it simple, no script tags.",
    // --- status pills / shortcuts / about ---
    "未知地点": "Unknown location",
    "当前地点": "Current location",
    "当前时间": "Current time",
    "切换全屏": "Toggle fullscreen",
    "空格键 -> 下一句": "Space → Next",
    "回车键 -> 下一句": "Enter → Next",
    "Ctrl长按 -> 快进": "Hold Ctrl → Fast-forward",
    "按住快进 (Ctrl)": "Hold to fast-forward (Ctrl)",
    "Galgame界面插件 设置": "Galgame UI Plugin Settings",
    "正在打开设置...": "Opening settings...",
    "退出 Galgame 模式": "Exit Galgame Mode",
    "Galgame格式规范已更新": "Galgame format spec updated",
    "当前版本": "Current version",
    "查看教程及文档": "Docs & tutorials",
    "Discord 发布帖（点击打开）": "Discord release post (click to open)",
    "本插件相关内容遵循": "Plugin content is licensed under",
    "禁止将 Live2D 模型或相关素材用于任何商业用途。": "Live2D models and related assets may not be used commercially.",
    // --- generic small chrome ---
    "确认": "Confirm",
    "取消": "Cancel",
    "打开": "Open",
    "禁用": "Disable",
    "帮助": "Help",
    "更多操作": "More actions",
    "更新": "Update",
    "全部": "All",
    "全部类型": "All types",
    "显示/隐藏": "Show/Hide",
    "显示/隐藏立绘": "Show/Hide sprites",
    "重新生成": "Regenerate",
    "查看历史": "View history",
    "播放列表": "Playlist",
    "播放器": "Player",
    "音乐": "Music",
    "音效": "SFX",
    "播放当前曲目并停止": "Play current track then stop",
    "重复播放所有曲目": "Repeat all tracks",
    "通知设置": "Notification settings",
    "试听文本": "Preview text",
    "场景": "Scene",
    "世界书": "Worldbook",
    // ═══ v0.3.1 harvest (2026-07-15, second pass) — galgame chrome ═══
    // --- overlay tooltips (title attrs) ---
    "点击展开音乐控制": "Click to expand music controls",
    "有待选择的选项": "Choices available",
    "查看消息内嵌界面": "View embedded message UI",
    // --- sprite manager (立绘) ---
    "上传角色立绘": "Upload character sprite",
    "保存立绘": "Save sprite",
    "生成立绘": "Generate sprite",
    "使用本地ComfyUI自动生成角色立绘": "Auto-generate the sprite via local ComfyUI",
    "角色外貌基础提示词": "Base appearance prompt",
    "额外描述 (可选)": "Extra description (optional)",
    "点击选择立绘图片": "Click to choose a sprite image",
    "立绘将自动裁剪为 2:3 比例": "Sprites are auto-cropped to 2:3",
    "换图": "Replace image",
    "更换图片": "Replace image",
    "获取图片": "Fetch image",
    "本地上传": "Local upload",
    "本地文生图": "Local text-to-image",
    "远程链接": "Remote link",
    "输入图片 URL (https://...)": "Enter image URL (https://...)",
    "支持 PNG / JPG / GIF / WebP": "Supports PNG / JPG / GIF / WebP",
    "未设置，点击右侧按钮添加": "Not set — add with the button on the right",
    "将生成:": "Will generate:",
    "生成中...": "Generating...",
    "角色名称": "Character name",
    "输入角色名": "Enter character name",
    "表情类型": "Expression type",
    "重置位置": "Reset position",
    "重置": "Reset",
    "编辑": "Edit",
    // --- voice binding ---
    "TTS配音音色": "TTS voice",
    "绑定": "Bind",
    "-- 不绑定音色 --": "-- No voice --",
    "-- 使用 Workflow默认 --": "-- Use workflow default --",
    "为该角色绑定专属配音音色": "Bind a dedicated voice to this character",
    "绑定后AI会自动为该角色使用此音色配音": "Once bound, the AI voices this character with it",
    // --- image config (sentences user flagged) ---
    "Checkpoint 模型": "Checkpoint model",
    "工作流": "Workflow",
    "用户设定描述": "User persona description",
    "使用 NovelAI 官方 API 生成背景图片，需要有效的订阅和 API Key。": "Generates backgrounds via the official NovelAI API — needs a valid subscription and API Key.",
    "仅供学习研究使用。所有图片版权归原作者及 Wallhaven 所有。": "For study/research only. All image rights belong to their creators and to Wallhaven.",
    "背景图来源: ComfyUI": "Background source: ComfyUI",
    "背景图来源: NovelAI": "Background source: NovelAI",
    "背景图来源: Wallhaven": "Background source: Wallhaven",
    "背景图来源: 大香蕉": "Background source: Big Banana",
    // --- custom modules: textarea placeholders + the tag EXAMPLES it shows ---
    "<div>自定义地点介绍...</div>": "<div>Custom location intro...</div>",
    "<div>自定义时间介绍...</div>": "<div>Custom time intro...</div>",
    "<地点状态栏>...</地点状态栏>": "<Location bar>...</Location bar>",
    "<时间状态栏>...</时间状态栏>": "<Time bar>...</Time bar>"
  };
  var PATTERNS = [
    [/^自定义 · (.+)$/, (m) => `Custom · ${m[1]}`],
    [/^当前表情:\s*(.*)$/, (m) => `Current Expression: ${m[1]}`],
    [/^(.+)，COT已更新$/, (m) => `${m[1]}, COT updated`],
    [/^已自动切换试听音色：(.+)$/, (m) => `Preview voice switched: ${m[1]}`],
    [/^已选择:\s*(.*)$/, (m) => `Selected: ${m[1]}`],
    [/^背景已保存:\s*(.*)$/, (m) => `Background saved: ${m[1]}`],
    // v0.3 — dynamic counts / version toast / BGM placeholder
    [/^已保存 (\d+) 个立绘，共 (\d+) 个角色$/, (m) => `${m[1]} sprite(s) saved · ${m[2]} character(s)`],
    [/^已保存 (\d+) 个背景$/, (m) => `${m[1]} background(s) saved`],
    [/^(\d+) 个表情$/, (m) => `${m[1]} expression(s)`],
    [/^发现新版本: (.+)$/, (m) => `New version available: ${m[1]}`],
    // NOTE: a pattern hit replaces the WHOLE matched key — re-emit the example lines
    [/^每行填写一首歌曲名，例如：/, () => "One song per line, e.g.:\n夜に駆ける\nunravel\n打上花火"],
    // BGM note #1: text node before the inline <bgm> element (the "。" after it is a separate node)
    [
      /^1\.\s*每行一首歌，保存后会更新 COT：模型只能从该歌单中输出$/,
      () => "1. One song per line; on save the COT updates so the model can only output"
    ],
    [/^构建信息:\s*(.+)$/, (m) => `Build: ${m[1]}`]
    // … add more as harvest surfaces them …
  ];

  // src/i18n.js
  var HARVEST = true;
  var ATTRS = ["placeholder", "title", "aria-label"];
  var CJK = /[一-鿿㐀-䶿豈-﫿]/;
  var missing = /* @__PURE__ */ new Set();
  function exposeHarvest() {
    try {
      window.parent.__galI18nMissing = missing;
      window.parent.__galI18nDump = () => {
        const arr = [...missing].sort();
        const json = JSON.stringify(Object.fromEntries(arr.map((s) => [s, ""])), null, 2);
        console.log(`[galgame-i18n] ${arr.length} untranslated strings:
` + json);
        const blob = new Blob([json], { type: "application/json" });
        const a = DOC.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "galgame-i18n-missing.json";
        a.click();
        return arr;
      };
    } catch (e) {
      log.warn("i18n: could not expose harvest helpers on parent window:", e);
    }
  }
  function translate(raw) {
    const key = raw.trim();
    if (!key || !CJK.test(key)) return null;
    if (DICT[key] !== void 0) {
      return raw.replace(key, DICT[key]);
    }
    for (const [re, fn] of PATTERNS) {
      const m = key.match(re);
      if (m) return raw.replace(key, fn(m));
    }
    if (HARVEST) missing.add(key);
    return null;
  }
  function doTextNode(node) {
    const out = translate(node.nodeValue);
    if (out !== null && out !== node.nodeValue) node.nodeValue = out;
  }
  function doAttrs(el) {
    for (const name of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(name)) continue;
      const out = translate(el.getAttribute(name));
      if (out !== null) el.setAttribute(name, out);
    }
  }
  function sweep(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return doTextNode(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    doAttrs(root);
    const walker = DOC.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) doTextNode(n);
    if (root.querySelectorAll) {
      root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(doAttrs);
    }
  }
  var scheduled = false;
  var pending = /* @__PURE__ */ new Set();
  function flush() {
    scheduled = false;
    for (const node of pending) sweep(node);
    pending.clear();
  }
  var observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === "characterData") pending.add(mut.target);
      else if (mut.type === "attributes") pending.add(mut.target);
      else mut.addedNodes.forEach((n) => pending.add(n));
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  });
  function startI18n() {
    if (!DOC || !DOC.body) return setTimeout(startI18n, 200);
    exposeHarvest();
    sweep(DOC.body);
    observer.observe(DOC.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
    log.info("i18n active" + (HARVEST ? " (harvest mode — run __galI18nDump() when done)" : ""));
  }

  // src/menu-modal.js
  var MODAL_ID = "school-companion-modal";
  var Z_INDEX = 2147483e3;
  function closeMenuModal() {
    const el = DOC.getElementById(MODAL_ID);
    if (el) el.remove();
  }
  function openMenuModal() {
    if (DOC.getElementById(MODAL_ID)) return;
    const wrap = DOC.createElement("div");
    wrap.id = MODAL_ID;
    wrap.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX};display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);`;
    const box = DOC.createElement("div");
    box.style.cssText = "position:relative;width:min(920px,94vw);height:min(680px,90vh);background:#1a1a2e;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.6);overflow:hidden;display:flex;flex-direction:column;";
    const bar = DOC.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f3460;color:#e8e8e8;font-weight:700;flex:0 0 auto;";
    bar.innerHTML = '<span><i class="fa-solid fa-users"></i> School Menu</span><button data-school-close style="background:none;border:0;color:#e8e8e8;font-size:1.1rem;cursor:pointer;padding:4px 8px;"><i class="fa-solid fa-xmark"></i></button>';
    const body = DOC.createElement("div");
    body.style.cssText = "flex:1 1 auto;display:flex;align-items:center;justify-content:center;color:#8892b0;";
    body.textContent = "StatusMenu loads here (phase G3).";
    box.appendChild(bar);
    box.appendChild(body);
    wrap.appendChild(box);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest && e.target.closest("[data-school-close]")) {
        closeMenuModal();
      }
    });
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeMenuModal();
        DOC.removeEventListener("keydown", onKey);
      }
    };
    DOC.addEventListener("keydown", onKey);
    DOC.body.appendChild(wrap);
    log.info("menu modal opened");
  }

  // src/toolbar.js
  var ACTION = "school-stats";
  var TOOLBAR_SEL = "#gal-global-overlay .gal-bottom-toolbar";
  var MOBILE_MENU_SEL = "#gal-global-overlay #gal-mobile-menu";
  var TOOLBAR_BTN_HTML = `<button class="gal-footer-btn" data-action="${ACTION}" title="School Menu"><i class="fa-solid fa-users"></i> <span class="gal-btn-text">MENU</span></button>`;
  var MOBILE_BTN_HTML = `<button class="gal-menu-btn" data-action="${ACTION}"><i class="fa-solid fa-users"></i> Menu</button>`;
  function injectInto(sel, html) {
    const bar = DOC.querySelector(sel);
    if (!bar || bar.querySelector(`[data-action="${ACTION}"]`)) return false;
    bar.insertAdjacentHTML("beforeend", html);
    return true;
  }
  function injectAll() {
    const a = injectInto(TOOLBAR_SEL, TOOLBAR_BTN_HTML);
    const b = injectInto(MOBILE_MENU_SEL, MOBILE_BTN_HTML);
    if (a || b) log.info(`button injected (toolbar=${a}, mobile=${b})`);
  }
  function startToolbar() {
    if (!DOC || !DOC.body) return setTimeout(startToolbar, 200);
    DOC.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest(`[data-action="${ACTION}"]`);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        openMenuModal();
      } catch (err) {
        log.error("menu modal failed to open:", err);
      }
    });
    let scheduled2 = false;
    const observer2 = new MutationObserver(() => {
      if (scheduled2) return;
      scheduled2 = true;
      requestAnimationFrame(() => {
        scheduled2 = false;
        injectAll();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    injectAll();
    log.info("toolbar watcher active");
  }

  // src/style.js
  var STYLE_ID = "school-companion-style";
  var CSS = `
/* Fullscreen toggle: icon-only. The EN label ("Fullscreen") outgrows the Chinese 全屏 and
   overlaps the status pills; the icon is self-explanatory. Covers both states (全屏/退出) —
   a dict blank can't, because 退出 is also the mobile menu's Exit label. */
.gal-fullscreen-btn span { display: none !important; }
`;
  function injectStyle() {
    if (!DOC || !DOC.head) return setTimeout(injectStyle, 200);
    if (DOC.getElementById(STYLE_ID)) return;
    const el = DOC.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    DOC.head.appendChild(el);
    log.info("style injected");
  }

  // src/index.js
  log.info(`v${VERSION} loading`);
  injectStyle();
  startI18n();
  startToolbar();
  log.info(`v${VERSION} ready`);
})();
