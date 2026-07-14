// galgame-companion · i18n dictionary — exact-match 中文→EN + pattern rules. v0.1
// ⚠️ Seeded from the prototype harvest against an OLDER galgame UI. Phase G1 refreshes
// this file: run harvest mode live against v2.1, machine-translate, paste the long tail
// here (GCP §2, §9-G1). Keyed by the exact RENDERED on-screen text, never source literals.

export const DICT = {
  // --- common actions / buttons ---
  '导入': 'Import', '导出': 'Export', '发送': 'Send', '确定': 'OK',
  '试听': 'Preview', '全屏': 'Fullscreen', '关于': 'About',
  '下一句': 'Next', '快进': 'Fast-forward', '刷新视图': 'Refresh view',
  '视图已刷新': 'View refreshed', '复制全部': 'Copy all', '重绘当前': 'Redraw current',
  '查看提示词': 'View prompt', '添加角色': 'Add Character', '生成背景图片': 'Generate Background',
  '保存音色列表': 'Save voice list',

  // --- top-level sections ---
  '基础设置': 'Basic settings', '显示设置': 'Display settings', '世界书设置': 'Worldbook Settings',
  '资源管理': 'Asset management', '模型管理': 'Model management', '快捷键': 'Shortcuts',
  '立绘设置': 'Sprite settings', '快进设置': 'Fast-forward settings',
  '连接配置': 'Connection profile', '第二次生成配置': 'Second-pass config',
  '当前角色卡独立设置': 'Per-character-card settings', '插件发布地址': 'Plugin release page',

  // --- galgame mode / choices ---
  'Galgame 模式已开启': 'Galgame mode enabled', 'Galgame 模式已关闭': 'Galgame mode disabled',
  '请先开启 Galgame 模式': 'Enable Galgame mode first', '请选择行动': 'Choose an action',
  '剧情选项': 'Story choices', '剧情回顾': 'Story recap', '沉浸模式': 'Immersive mode',
  '自由对话': 'Free chat', '自由输入': 'Free input', '自动播放': 'Auto-play',
  '简化图书绘本模式': 'Simplified picture-book mode', '智能判断主界面显示': 'Smart main-view detection',

  // --- enhanced mode / worldbook ---
  '加强模式': 'Enhanced mode', '启用加强模式': 'Enable enhanced mode',
  '加强模式提示词': 'Enhanced mode prompt', '两次生成策略：内容创作 + COT格式化': 'Two-pass strategy: content creation + COT formatting',
  '不使用任何世界书': "Don't use any worldbook",
  '不使用自定义世界书(默认选择)': "Don't use custom worldbook (default)",
  '使用以下世界书：': 'Use the following worldbook:',
  '使用当前模型': 'Use current model', '使用当前连接配置': 'Use current connection profile',
  '使用当前预设': 'Use current preset', '使用酒馆代理': 'Use SillyTavern proxy',
  '模型': 'Model', '预设': 'Preset', '模型切换模式': 'Model switch mode', '严格切换': 'Strict switch',
  '暂无可用的世界书': 'No worldbooks available', '暂无提示词记录': 'No prompt records yet',

  // --- TTS / voices ---
  'TTS引擎': 'TTS Engine', 'TTS配音': 'TTS Voice', '启用TTS配音': 'Enable TTS voice',
  'TTS引擎已切换': 'TTS engine switched', 'TTS引擎已切换，COT已更新': 'TTS engine switched, COT updated',
  'GPT-SoVITS（api_v2.py）设置': 'GPT-SoVITS (api_v2.py) Settings',
  'set_model 接口': 'set_model endpoint', 'API地址': 'API URL',
  '音色列表（JSON）': 'Voice list (JSON)', '音色列表 JSON 解析失败': 'Voice list JSON parse failed',
  '音色列表必须是数组': 'Voice list must be an array', '默认音色': 'Default voice',
  '默认女声列表': 'Default female voice list', '默认男声列表': 'Default male voice list',
  '男声/女声': 'Male/Female voice', '该音色已在列表中': 'Voice already in list',
  '请先切换为 GPT-SoVITS': 'Switch to GPT-SoVITS first',
  '请先配置至少一个可用音色（refAudioPath 不能为空）': 'Configure at least one usable voice first (refAudioPath cannot be empty)',
  '上方仅用于挑选候选音色，选中后会立即加入下方列表。': 'The list above is only for picking candidate voices; selecting one adds it to the list below.',
  '当前为空（从上方选择音色即可加入）。': 'Currently empty (select a voice above to add).',
  '选择后立即加入列表': 'Adds to the list immediately when selected',
  '中日双语模式': 'Chinese-Japanese bilingual mode',
  '按“中文文本[JP]日文文本”输出（兼容【JP】）；未命中时自动回退原文朗读。': 'Output as "Chinese[JP]Japanese" (【JP】 also accepted); falls back to the original when no marker.',
  '(切段自动朗读)': '(Auto-read on segment)', '(失败不回退)': '(No fallback on failure)',
  '(显示中文，TTS发送日文)': '(Show Chinese, TTS speaks Japanese)',

  // --- image / background generation ---
  'ComfyUI 背景生成': 'ComfyUI Background Generation', 'NovelAI 背景生成': 'NovelAI Background Generation',
  '大香蕉背景生成': 'Big Banana background generation', 'Wallhaven 背景搜索': 'Wallhaven Background Search',
  '图片生成中...': 'Generating image...', '质量档位': 'Quality level',
  'High（高画质）': 'High (High quality)', 'Balanced（默认）': 'Balanced (Default)', 'Mobile（省电）': 'Mobile (Power saving)',
  '1:1（正方形）': '1:1 (Square)', '2:3（默认竖版）': '2:3 (Default portrait)', '3:4（常用竖版）': '3:4 (Common portrait)',
  '4:5（偏方竖版）': '4:5 (Tall-ish portrait)', '9:16（长竖版）': '9:16 (Tall portrait)',
  'none（不自动切换）': 'none (No auto-switch)', '(漫画风格)': '(Comic style)',

  // --- display / appearance ---
  '文本显示': 'Text display', '文字特效': 'Text effect', '文字描边': 'Text stroke',
  '发光效果': 'Glow effect', '打字机显示': 'Typewriter effect', '打字速度': 'Typing speed',
  '打字音效': 'Typing sound', '对话字体': 'Dialogue font', '字体大小': 'Font size',
  '对话框缩放': 'Dialogue box scale', '对话框透明度': 'Dialogue box opacity',
  '背景图填充': 'Background fill', '底部渐变遮罩': 'Bottom gradient overlay',
  '毛玻璃背景': 'Frosted glass background', '独立文字背景': 'Separate text background',
  '界面皮肤': 'UI skin', '情境样式': 'Scene style', '底栏缩放': 'Bottom bar scale',
  'Cover (填满裁剪)': 'Cover (Fill / crop)', 'Contain (完整显示)': 'Contain (Fit)',
  '(cover填满/contain完整)': '(cover = fill / contain = fit)',

  // --- fonts ---
  '现代黑体（默认）': 'Modern sans-serif (default)', '思源宋体': 'Source Han Serif',
  '霞鹜文楷': 'LXGW WenKai', '经典楷体': 'Classic Kai', '等宽字体': 'Monospace',

  // --- skins ---
  '墨染千秋（中国古风）': 'Ink Dynasty (Chinese classical)', '心之怪盗（女神异闻录）': 'Phantom Thieves (Persona)',
  '苍穹之庭（日式奇幻）': 'Azure Court (Japanese fantasy)', '樱色物语（经典Galgame）': 'Sakura Story (Classic Galgame)',

  // --- sprites / Live2D ---
  '显示立绘': 'Show sprites', '立绘大小': 'Sprite size', '立绘间距': 'Sprite spacing',
  '无立绘时显示添加框': 'Show add-box when no sprite', 'Live2D 版权与使用声明': 'Live2D Copyright & Usage Notice',
  '垂直位置': 'Vertical position', '(左右距离)': '(Horizontal distance)', '(底部偏移)': '(Bottom offset)',
  '添加立绘': 'Add sprite',

  // --- effects ---
  'Pixi特效': 'Pixi Effects', '启用特效': 'Enable effects', '说话者光晕': 'Speaker glow',
  '气泡指示器': 'Bubble indicator', '阴影增强': 'Shadow boost',
  '(轮廓发光)': '(Outline glow)',

  // --- fast-forward / playback ---
  '快进速度': 'Fast-forward speed', '播放间隔': 'Playback interval', '并发上限': 'Concurrency limit',
  '切场景自动清空': 'Auto-clear on scene change', '切换设置': 'Switch settings',

  // --- audio ---
  '音效音量': 'Sound volume',

  // --- toasts / status ---
  '消息已发送': 'Message sent', '已复制到剪贴板': 'Copied to clipboard', '复制失败': 'Copy failed',
  '生成中': 'Generating', '正在初始化...': 'Initializing...', '正在重新生成...': 'Regenerating...',
  '重新生成失败': 'Regenerate failed', '未找到重新生成按钮': 'Regenerate button not found',
  '快速回退中...': 'Rewinding...', '已快进到最后': 'Fast-forwarded to end',
  '已回退到最早AI楼层': 'Rewound to earliest AI message', '已是最早AI楼层': 'Already at earliest AI message',
  '已添加音色：': 'Voice added:', '标题背景上传成功': 'Title background uploaded',
  '标题背景上传失败': 'Title background upload failed', '暂无历史记录': 'No history yet',
  '点击空白处关闭': 'Click outside to close',

  // --- mobile menu labels (custom-skin-footer-buttons.js) ---
  '历史': 'Log', '退出': 'Exit', '原界面': 'Original UI', '设置': 'Settings',
  '存档': 'Save', '读档': 'Load', '时间线': 'Timeline', '上一段': 'Prev',
  '下一段': 'Next', '选项': 'Choices',

  // --- misc ---
  '全局Debug日志': 'Global debug log', '当前表情': 'Current Expression',
  '无': 'None', '默认': 'Default', '（不指定）': '(Not specified)',
  '(关闭后不可点击上传)': '(Cannot upload when disabled)', '(隐藏其他楼层)': '(Hide other messages)',
  '关闭：简单对话格式，表情在结尾': 'Off: simple dialogue format, expression at end',
  '开启：对话格式含TTS属性，表情在开头': 'On: dialogue format with TTS attributes, expression at start',
  '(纯文本对话框，不解析角色/旁白/表情，不显示立绘/Live2D)': '(Plain-text dialogue; no character/narration/expression parsing, no sprites/Live2D)',
  '旁白': 'Narration', '许可协议（CC BY-NC-SA 4.0）': 'License (CC BY-NC-SA 4.0)',
  '法律合规声明': 'Legal compliance notice',

  // … G1: paste the machine-translated v2.1 harvest here to cover the long tail …
};

// Pattern rules for interpolated strings — applied only when a text node is NOT an
// exact DICT hit. Capture groups from the Chinese are reused in the replacement.
export const PATTERNS = [
  [/^自定义 · (.+)$/, (m) => `Custom · ${m[1]}`],
  [/^当前表情:\s*(.*)$/, (m) => `Current Expression: ${m[1]}`],
  [/^(.+)，COT已更新$/, (m) => `${m[1]}, COT updated`],
  [/^已自动切换试听音色：(.+)$/, (m) => `Preview voice switched: ${m[1]}`],
  [/^已选择:\s*(.*)$/, (m) => `Selected: ${m[1]}`],
  [/^背景已保存:\s*(.*)$/, (m) => `Background saved: ${m[1]}`],
  // … G1: add more as harvest surfaces them …
];
