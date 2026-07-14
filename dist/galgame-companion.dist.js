// galgame-companion v0.1 — built 2026-07-14T23:47:53.873Z
(() => {
  // src/env.js
  var SCRIPT_NAME = "School-Companion";
  var VERSION = "0.1";
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
    "法律合规声明": "Legal compliance notice"
    // … G1: paste the machine-translated v2.1 harvest here to cover the long tail …
  };
  var PATTERNS = [
    [/^自定义 · (.+)$/, (m) => `Custom · ${m[1]}`],
    [/^当前表情:\s*(.*)$/, (m) => `Current Expression: ${m[1]}`],
    [/^(.+)，COT已更新$/, (m) => `${m[1]}, COT updated`],
    [/^已自动切换试听音色：(.+)$/, (m) => `Preview voice switched: ${m[1]}`],
    [/^已选择:\s*(.*)$/, (m) => `Selected: ${m[1]}`],
    [/^背景已保存:\s*(.*)$/, (m) => `Background saved: ${m[1]}`]
    // … G1: add more as harvest surfaces them …
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

  // src/index.js
  log.info(`v${VERSION} loading`);
  startI18n();
  startToolbar();
  log.info(`v${VERSION} ready`);
})();
