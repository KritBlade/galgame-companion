// galgame-companion v0.9.4
(() => {
  // src/env.js
  var SCRIPT_NAME = "galgame-companion";
  var VERSION = "0.9.4";
  var BUILD = "a9e550e";
  var DOC = typeof window !== "undefined" && window.parent && window.parent.document || (typeof document !== "undefined" ? document : null);
  var topWindow = typeof window !== "undefined" && (window.parent || window) || globalThis;
  var MVU_HELPER_EXT = "mvu-helper";
  function debugDomainOn(name) {
    try {
      const ST = topWindow.SillyTavern || null;
      const settings = ST && (ST.extensionSettings || ST.getContext && ST.getContext().extensionSettings);
      return settings?.[MVU_HELPER_EXT]?.debug_domain?.[name] === true;
    } catch (e) {
      return false;
    }
  }
  var DEBUG = false;
  var log = {
    info: (...a) => {
      if (DEBUG) console.log(`[${SCRIPT_NAME}]`, ...a);
    },
    /** Image seam: beat-shaper scene naming + image-seam DB write/prune/sweep + viewer/regen.
     *  Gated by mvu-helper's "Image gen" domain checkbox, or by the local DEBUG master switch. */
    image: (...a) => {
      if (DEBUG || debugDomainOn("imagegen")) console.log(`[${SCRIPT_NAME}]`, ...a);
    },
    warn: (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a),
    error: (...a) => console.error(`[${SCRIPT_NAME}]`, ...a)
  };
  function warnToast(message, title = SCRIPT_NAME, timeOut = 12e3) {
    try {
      if (topWindow && topWindow.toastr && typeof topWindow.toastr.warning === "function") {
        topWindow.toastr.warning(message, title, { timeOut, extendedTimeOut: 4e3 });
        return;
      }
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] toastr unavailable — falling back to console:`, e);
    }
    console.warn(`[${SCRIPT_NAME}] ${message}`);
  }

  // src/app/galgame-defaults.js
  var GAL_SETTINGS_KEY = "galgame-ui-plugin_settings";
  var GAL_TTS_ENABLED_KEY = "galgame-ui-plugin_tts_enabled";
  var GAL_INIT_LOCK = "__galgame_init_lock__";
  var SEED_FLAG_KEY = "galgame-companion_seed_version";
  var RELOAD_MARKER = "galgame-companion_seed_reload";
  var SEED_VERSION = 3.2;
  var MAX_RELOADS = 2;
  var MANAGED = [
    { key: "dialogSegLengthOverride", value: 460, def: 0 },
    // Words per page (Auto under-counts English ~2×)
    { key: "hideOtherFloors", value: true, def: true },
    // Immersive mode
    { key: "typewriterEnabled", value: false, def: true },
    // Typewriter effect off
    { key: "typewriterSoundEnabled", value: false, def: true },
    // Typing sound off
    { key: "bgFillMode", value: "contain", def: "cover" },
    // Background fill: show whole image
    { key: "cgAsBackground", value: false, def: false },
    // CG replaces background off
    { key: "effectsEnabled", value: false, def: true },
    // Pixi effects off
    { key: "showSprites", value: false, def: true },
    // Sprites off
    { key: "bgmEnabled", value: false, def: true },
    // BGM off (also drops <bgm> from galgame's COT)
    { key: "ctrlKeySkip", value: false, def: true },
    // Hold-Ctrl fast-forward off (eats Ctrl while typing)
    { key: "ttsEnabled", value: false, def: false },
    // TTS off — the in-blob twin of GAL_TTS_ENABLED_KEY
    { key: "ttsAutoPlay", value: false, def: false },
    // Auto-read on segment off (user, 2026-08-04)
    //   ⚠ These two were the MISSING HALF of SEEDED_TTS_ENABLED. The companion has always written the
    //   standalone 'galgame-ui-plugin_tts_enabled' key to 'false', but galgame ALSO keeps `ttsEnabled`
    //   inside the settings blob, and that one was left at true. Live 2026-08-04: blob true +
    //   ttsProvider 'littlewhitebox' made galgame fetch a config for a provider that is not installed,
    //   spamming `GET /user/files/LittleWhiteBox_TTS.json 404` — while the outside key claimed TTS was
    //   off. Two sources of truth for one setting, disagreeing silently. Seeding both closes it.
    { key: "bgImageSource", value: "chatu8", def: "none" }
    // Zhihuiji mode: galgame must NOT self-generate backdrops
    //   (comfyui/banana/novelai/wallhaven all disabled; galgame only recognizes rendered images in messages —
    //    ours come from mvu-helper via the image-seam. Kills the "未找到默认背景生成工作流: default_bg" error spam
    //    that galgame's legacy realTimeBackgroundGen migration caused, live-seen 2026-07-18.)
  ];
  var SEEDED_TTS_ENABLED = false;
  function localStore() {
    try {
      return topWindow.localStorage;
    } catch (e) {
      log.warn("galgame-defaults: topWindow.localStorage unreachable — seed skipped:", e);
      return null;
    }
  }
  function sessionStore() {
    try {
      return topWindow.sessionStorage;
    } catch (e) {
      log.warn("galgame-defaults: topWindow.sessionStorage unreachable:", e);
      return null;
    }
  }
  function readBlob(ls) {
    try {
      const raw = ls.getItem(GAL_SETTINGS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      log.warn("galgame-defaults: settings blob unparsable — seeding a fresh managed set:", e);
      return {};
    }
  }
  function seedValues(ls) {
    const blob = readBlob(ls);
    for (const f of MANAGED) blob[f.key] = f.value;
    try {
      ls.setItem(GAL_SETTINGS_KEY, JSON.stringify(blob));
    } catch (e) {
      log.error("galgame-defaults: could not write settings blob — seed aborted:", e);
      return false;
    }
    try {
      ls.setItem(GAL_TTS_ENABLED_KEY, String(SEEDED_TTS_ENABLED));
    } catch (e) {
      log.warn("galgame-defaults: could not write TTS-enable key:", e);
    }
    return true;
  }
  function blobClobbered(ls) {
    const blob = readBlob(ls);
    return MANAGED.filter((f) => f.value !== f.def).every((f) => blob[f.key] === f.def || blob[f.key] === void 0);
  }
  function reloadAttempts(ss) {
    if (!ss) return 0;
    try {
      return Number(ss.getItem(RELOAD_MARKER)) || 0;
    } catch (e) {
      log.warn("galgame-defaults: reading reload marker failed:", e);
      return 0;
    }
  }
  function seedAndConverge(ls, ss, why) {
    if (!seedValues(ls)) return;
    try {
      ls.setItem(SEED_FLAG_KEY, String(SEED_VERSION));
    } catch (e) {
      log.warn("galgame-defaults: could not write seed flag (will re-seed next load):", e);
    }
    if (!topWindow[GAL_INIT_LOCK]) {
      log.info(`galgame-defaults: seeded v${SEED_VERSION} (${why}) before galgame init — no reload needed.`);
      return;
    }
    const attempts = reloadAttempts(ss);
    if (!ss || attempts >= MAX_RELOADS) {
      log.error(
        `galgame-defaults: seeded v${SEED_VERSION} (${why}) but galgame already read stale settings and ` + (ss ? `${attempts} reload(s) did not converge` : "sessionStorage is unavailable to guard a reload") + " — giving up. Reload SillyTavern manually; values apply on the next clean load."
      );
      return;
    }
    try {
      ss.setItem(RELOAD_MARKER, String(attempts + 1));
    } catch (e) {
      log.error("galgame-defaults: could not write reload marker — NOT reloading (loop guard):", e);
      return;
    }
    log.info(`galgame-defaults: seeded v${SEED_VERSION} (${why}) after galgame init — reloading ST once to apply (${attempts + 1}/${MAX_RELOADS}).`);
    topWindow.location.reload();
  }
  function startGalgameDefaults() {
    const ls = localStore();
    if (!ls) return;
    const ss = sessionStore();
    let ver = 0;
    try {
      ver = Number(ls.getItem(SEED_FLAG_KEY)) || 0;
    } catch (e) {
      log.warn("galgame-defaults: reading seed flag failed — assuming unseeded:", e);
    }
    if (ver >= SEED_VERSION) {
      const attempts = reloadAttempts(ss);
      if (!attempts) return;
      if (!blobClobbered(ls)) {
        try {
          ss.removeItem(RELOAD_MARKER);
        } catch (e) {
          log.warn("galgame-defaults: could not clear reload marker:", e);
        }
        log.info("galgame-defaults: converged — galgame read the seeded settings.");
        return;
      }
      if (attempts >= MAX_RELOADS) {
        try {
          ss.removeItem(RELOAD_MARKER);
        } catch (e) {
          log.warn("galgame-defaults: could not clear reload marker:", e);
        }
        log.error(
          `galgame-defaults: seed clobbered again after ${attempts} reload(s) — giving up this session. Something saves galgame settings during boot every load; set the display settings manually once.`
        );
        return;
      }
      seedAndConverge(ls, ss, "post-reload retry");
      return;
    }
    seedAndConverge(ls, ss, ver ? `upgrade ${ver}→${SEED_VERSION}` : "first install");
  }

  // src/app/style.js
  var STYLE_ID = "school-companion-style";
  var CSS = `
/* Fullscreen toggle: icon-only. The EN label ("Fullscreen") outgrows the Chinese 全屏 and
   overlaps the status pills; the icon is self-explanatory. Covers both states (全屏/退出) —
   a dict blank can't, because 退出 is also the mobile menu's Exit label. */
.gal-fullscreen-btn span { display: none !important; }

/* School Menu button — upper-left corner (proven live 2026-07-18): galgame's bottom toolbar is a
   fixed-width, flex-nowrap row already filled to the panel edge by LOG…NEXT, and it sits inside
   .gal-text-panel (overflow:hidden) — appending our button there clipped it, and reclaiming room
   fought galgame's own buttons. Instead toolbar.js injects it as a DIRECT child of the overlay
   (which is already position:relative — its own top-right status pills anchor to it the same way),
   and we pin it to the top-left corner: out of every crowded row, no clipping at any dialogue scale,
   mirrors galgame's top-right pills. Keyed on our own class → cannot touch galgame's layout. */
#gal-global-overlay .school-corner-btn { position: absolute; top: 12px; left: 14px; z-index: 30; }

/* Manual advance control (next-block.js) — the game's own advance flag, named by the genre profile,
   surfaced on the overlay under the fullscreen button so it works with the stat-menu hidden. Ticking
   OUR checkbox drives the real (hidden) stat-menu checkbox. Small dark chip to read over the artwork. */
#gal-global-overlay .school-nextblock {
  position: absolute; top: 56px; right: 15px; z-index: 30;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 4px 9px; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.72rem; font-weight: 700; line-height: 1; user-select: none;
}
#gal-global-overlay .school-nextblock-cb {
  width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #29b6f6;
}

/* Image-viewer button (image-viewer.js) — stacked under the Next control (fullscreen · Next · 🖼), same dark chip
   look. Opens a near-full-viewport lightbox of galgame's current backdrop. Kept in our top-right control column,
   NOT galgame's absolutely-positioned right gutter (that would be fragile to couple to). */
#gal-global-overlay .school-imgview-btn {
  position: absolute; top: 104px; right: 15px; z-index: 30;
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  padding: 0; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.95rem; line-height: 1;
}

/* Regenerate-image button (image-regen.js) — stacked under the 🖼 image-viewer. Clicks mvu-helper's own
   .auto-img-regen for the current backdrop. Spins while "triggered". */
#gal-global-overlay .school-imgregen-btn {
  position: absolute; top: 142px; right: 15px; z-index: 30;
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  padding: 0; border-radius: 8px; cursor: pointer;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.95rem; line-height: 1;
}
#gal-global-overlay .school-imgregen-btn.is-spinning i { animation: school-spin 0.9s linear infinite; }
@keyframes school-spin { to { transform: rotate(360deg); } }

/* Right-gutter buttons un-clip (galgame upstream bug, proven live 2026-07-18): galgame's right-edge
   column — sprite-toggle (👁) + the location/time status-popup triggers — is positioned right:-40px,
   hung into the gutter past the dialog panel, but clipped by .gal-game-container(overflow:hidden). At
   galgame's default ~120% dialogue-box scale that gutter is only ~17px, so the 40px hang overflows
   ~20px and the buttons are cut off (they survive only at ~100% scale / mobile reflow — an untested
   default-desktop combo). We can't per-side-unclip, and overflow:visible would leak sprites/CG on
   cards that use them; instead trim the (centred) dialog column ~88px to widen the gutter enough for
   the buttons at the seeded scale. Tuned for the default scale; at a much larger dialogue-box scale
   the top-right pills still show location/time. Can't edit galgame (CDN-imported untouched). */
#gal-global-overlay .gal-dialog-layer { width: calc(100% - 88px) !important; }

/* Background Manager patch (background-manager.js) — select mode + the recency sort's affordances.
   Everything is scoped under galgame's backgrounds pane and keyed on OUR classes, so with select
   mode off the panel renders exactly as galgame drew it. */
.companion-bg-selectbar {
  display: none; align-items: center; gap: 10px; flex-wrap: wrap;
  margin: 0 0 14px; padding: 8px 12px; border-radius: 8px;
  background: rgba(13, 110, 253, 0.08); border: 1px solid rgba(13, 110, 253, 0.35);
}
.companion-bg-selecting .companion-bg-selectbar { display: flex; }
.companion-bg-selected-count { font-weight: 700; margin-right: auto; }
.companion-bg-selectbar .companion-bg-danger { background: #dc3545; color: #fff; border-color: #dc3545; }

/* The checkbox is a pseudo-element on galgame's own card — no node is injected into its markup, so
   there is nothing to clean up when select mode is switched off. .gal-bg-card is already
   position:relative (it anchors galgame's own hover actions the same way). */
.companion-bg-selecting .gal-bg-card::after {
  content: ''; position: absolute; top: 8px; left: 8px; z-index: 4;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.9); border: 2px solid rgba(0, 0, 0, 0.35);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.companion-bg-selecting .gal-bg-card.companion-bg-picked::after {
  content: '\\2713'; color: #fff; font-size: 14px; font-weight: 700; line-height: 20px; text-align: center;
  background: #0d6efd; border-color: #0d6efd;
}
.companion-bg-selecting .gal-bg-card.companion-bg-picked { outline: 3px solid #0d6efd; outline-offset: -3px; }
/* Select mode swallows clicks inside the grid (capture phase), so galgame's per-card delete/transfer
   buttons could not fire even if they were reachable. Hide them rather than leave dead controls up. */
.companion-bg-selecting .gal-bg-actions { display: none !important; }

/* Overlay anti-collapse (galgame upstream structural quirk, proven live 2026-07-16):
   galgame appends #gal-global-overlay as a flex child of ST's #chat (display:flex;
   flex-direction:column) and gives it inline flex-shrink:1 + min-height:0. Immersive mode
   (沉浸模式 / hideNonLastFloors) works by display:none-ing every sibling .mes row, so the
   overlay is the ONLY flex item and keeps its full height. With immersive OFF the message
   floors stay as flex items; flex-shrink:1 + min-height:0 then lets the overlay be squeezed
   to 0px — entering galgame mode activates an INVISIBLE overlay (toast fires, no UI shows).
   We can't edit galgame (imported untouched from CDN); pin the ACTIVE overlay's size so it
   survives the flex squeeze and displays inline (below the chat) even with immersive off.
   Keyed on .active — only present while the overlay is meant to be shown. */
#gal-global-overlay.active { flex-shrink: 0 !important; min-height: 70vh !important; }

/* Free-input box, desktop only — galgame sizes every .gal-input-box the same (max-width 31.25rem,
   textarea min-height 5rem). That fits a one-line reply, not the multi-paragraph turns this card is
   played with: the writing area is the smallest thing on screen while the artwork behind it is idle.
   Widen and deepen ONLY #gal-free-input-modal (galgame's other dialogs keep their own size) and let
   it cover the scene. Guarded above galgame's 48rem mobile breakpoint, where its own rule already
   makes the box fullscreen — outbidding that (id beats class) would shrink the mobile modal. */
@media screen and (min-width: 48.0625rem) {
  #gal-free-input-modal .gal-input-box {
    width: 88%; max-width: 62rem; max-height: 88vh;
    display: flex; flex-direction: column;
  }
  #gal-free-input-modal .gal-input-field {
    /* min() so a SHORT viewport (landscape phone / small laptop just past the breakpoint) can't
       have the textarea's floor push the box past the 88vh cap — a flex item's min-height wins
       over the parent's max-height, so a fixed floor would overflow off-screen there. */
    flex: 1; min-height: min(22rem, 45vh); resize: vertical;
  }
}

/* Live meter panel (meter-panel.js) — the genre profile's bars over the stage, in the left column
   under the MENU button (whose chip ends 32px down; galgame's own status pills sit centred at the
   top, its dialog panel ~490px down, so this column is the one free strip). Drawn only while the
   profile's gate reads true (School: an H scene). pointer-events:none — the stage advances on
   click and this panel must never eat one. Fill colours come from the profile (inline), the chip
   look mirrors the top-right controls. */
#gal-global-overlay .companion-meters {
  position: absolute; top: 44px; left: 14px; z-index: 30; width: 150px;
  display: flex; flex-direction: column; gap: 6px; pointer-events: none;
}
#gal-global-overlay .companion-meter-group {
  padding: 6px 8px; border-radius: 8px;
  background: rgba(20, 22, 34, 0.72); border: 1px solid rgba(120, 140, 200, 0.42);
  color: #fff; font-size: 0.68rem; line-height: 1.2;
}
#gal-global-overlay .companion-meter-title {
  font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#gal-global-overlay .companion-meter { display: grid; grid-template-columns: 1fr auto; column-gap: 6px; margin-top: 3px; }
#gal-global-overlay .companion-meter-label { opacity: 0.85; }
#gal-global-overlay .companion-meter-value { font-variant-numeric: tabular-nums; }
#gal-global-overlay .companion-meter-track {
  grid-column: 1 / -1; height: 6px; margin-top: 2px; border-radius: 3px;
  background: rgba(255, 255, 255, 0.16); overflow: hidden;
}
#gal-global-overlay .companion-meter-fill { height: 100%; border-radius: 3px; transition: width 0.35s ease; }
@media screen and (max-width: 48rem) {
  #gal-global-overlay .companion-meters { width: 118px; top: 40px; left: 8px; }
  #gal-global-overlay .companion-meter-group { font-size: 0.6rem; padding: 4px 6px; }
}
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

  // src/features/i18n/i18n-dict.js
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
    // '重绘当前' regenerates the whole MESSAGE, not just its image — "Redraw" read as an
    // image-only action and sent people looking for a picture button (user, 2026-08-04).
    "视图已刷新": "View refreshed",
    "复制全部": "Copy all",
    "重绘当前": "Regen mesg",
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
    // The Free-input textarea placeholder (translated via the ATTRS pass in i18n.js). Both dot
    // forms: galgame writes the ASCII '...', but a future upstream edit to '…' would go untranslated
    // and silently — an exact-match dict cannot warn about a near-miss.
    "输入你想说的话...": "Type what you want to say...",
    "输入你想说的话…": "Type what you want to say...",
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
    "底部渐变遮罩": "Bottom gradient overlay",
    "毛玻璃背景": "Frosted glass background",
    "独立文字背景": "Separate text background",
    "界面皮肤": "UI skin",
    "情境样式": "Scene style",
    "底栏缩放": "Bottom bar scale",
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
    "霞暮": "Rosy Twilight",
    // --- sprites / Live2D ---
    "显示立绘": "Show sprites",
    "隐藏立绘": "Hide sprites",
    "立绘大小": "Sprite size",
    "立绘间距": "Sprite spacing",
    "立绘将自动裁剪为": "Sprites auto-crop to",
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
    "已到最后AI楼层": "Already at last AI message",
    "正在加载模板...": "Loading template...",
    "正在生成内容...": "Generating content...",
    "已添加音色：": "Voice added:",
    "标题背景上传成功": "Title background uploaded",
    "标题背景上传失败": "Title background upload failed",
    "暂无历史记录": "No history yet",
    "点击空白处关闭": "Click outside to close",
    // native status-popup icons (📍 弹窗一 / 🕐 弹窗二) toast when the current reply carries no
    // matching <弹窗N> block. "Popup 1/2" matches the settings labels (弹窗一图标 → 'Popup 1 icon').
    "未找到 <弹窗一> 标签内容": "No <Popup 1> tag content found",
    "未找到 <弹窗二> 标签内容": "No <Popup 2> tag content found",
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
    // --- custom modules: textarea placeholders are safe (hint text for the user's own HTML) ---
    "<div>自定义地点介绍...</div>": "<div>Custom location intro...</div>",
    "<div>自定义时间介绍...</div>": "<div>Custom time intro...</div>",
    // ⚠️ NOT translated on purpose: <地点状态栏>...</地点状态栏> and <时间状态栏>...</时间状态栏>.
    // These are EXAMPLES of galgame's real functional tags (its COT injects the Chinese tag and
    // parses it back from message.mes). i18n only rewrites display text, so it can't break the
    // tag-match path — but translating the example would tempt a user to type the English form,
    // which galgame would NOT recognize. Leave the literal tag in its real language.
    // --- galgame 2.0 setup wizard (配置向导 · src/ui/setup-wizard.js) ---
    "配置向导": "Setup Wizard",
    "欢迎使用 Galgame 通用生成器": "Welcome to the Galgame Universal Generator",
    "本向导将引导你完成五项基础配置：": "This wizard walks you through five basic settings:",
    "1️⃣ 选择显示模式（标准 Galgame / 简化绘本）": "1️⃣ Choose display mode (Standard Galgame / Simplified picture-book)",
    "2️⃣ 挑选界面皮肤": "2️⃣ Pick a UI skin",
    "3️⃣ 常用设置（特效、情境样式、BGM、背景填充）": "3️⃣ Common settings (effects, scene style, BGM, background fill)",
    "4️⃣ AI 生图配置（推荐智绘姬）": "4️⃣ AI image config (Zhihuiji recommended)",
    "5️⃣ 导入图包资源（立绘、背景等）": "5️⃣ Import image-pack assets (sprites, backgrounds, etc.)",
    "全程约 1 分钟，所有配置之后都可以在设置面板中修改；本向导也可随时从「设置 → 通用 → 配置向导」重新打开。": "Takes about 1 minute; every setting can be changed later in the settings panel. Reopen this wizard anytime from Settings → General → Setup Wizard.",
    "不再自动提示": "Don't auto-show again",
    "每会话最多自动弹一次": "Auto-shows at most once per session",
    "上一步": "Previous",
    "下一步": "Next",
    "完成": "Finish",
    // step 1 — display mode
    "选择显示模式": "Choose display mode",
    "标准 Galgame 模式": "Standard Galgame mode",
    "完整视觉小说体验：角色立绘、表情切换、说话者高亮、背景切换。需要导入立绘图包才能发挥全部效果。": "Full visual-novel experience: character sprites, expression switching, speaker highlight, background switching. Requires a sprite pack for the full effect.",
    "简化图书绘本模式": "Simplified picture-book mode",
    "纯文本对话框，不解析角色/旁白/表情，不显示立绘和 Live2D；背景（含背景图包）照常切换。适合轻量阅读。": "Plain-text dialogue box; no character/narration/expression parsing, no sprites or Live2D; backgrounds (incl. background packs) still switch. Good for light reading.",
    "当前角色尚未开启 Galgame 模式，进入下一步时将自动开启。": "This character doesn't have Galgame mode on yet — it turns on automatically when you continue.",
    // step 2 — skin
    "挑选界面皮肤": "Pick a UI skin",
    "皮肤决定对话框、工具栏等界面元素的整体风格，切换后立即生效，可实时预览。": "The skin sets the overall style of the dialogue box, toolbar and other UI; changes apply instantly with live preview.",
    "之后可以在「设置 → 画面与特效」中随时更换，还可以导入自定义 HTML 皮肤。": "You can change it anytime under Settings → Display & Effects, and import a custom HTML skin.",
    // step 3 — common settings
    "常用设置": "Common settings",
    "Pixi 特效": "Pixi effects",
    "雨、雪、樱花等画面粒子特效，低端设备可关闭省电。": "Particle effects like rain, snow and cherry blossoms; turn off on low-end devices to save power.",
    "允许 AI 输出 <styled> 特殊排版文本（如手机短信、书信样式）。": "Let the AI output <styled> specially-formatted text (e.g. phone SMS, letter styles).",
    "启用 BGM": "Enable BGM",
    "允许 AI 输出 <bgm> 标签自动切换背景音乐。": "Let the AI output <bgm> tags to auto-switch background music.",
    "背景图填充": "Background fill",
    "背景图与屏幕比例不一致时，填满裁剪或完整显示留边。": "When the background's aspect differs from the screen: fill-and-crop, or show it whole with letterboxing.",
    "进入下一步时统一应用；之后可在「设置 → 画面与特效 / 生成COT」中随时调整。": "Applied together when you continue; adjust anytime under Settings → Display & Effects / Generation COT.",
    "Contain (完整显示)": "Contain (show whole)",
    "Cover (填满裁剪)": "Cover (fill / crop)",
    // step 4 — AI image config (source options)
    "AI 生图配置": "AI image config",
    "选择背景图来源，剧情推进时可自动生成/匹配背景图片。": "Choose the background-image source; images auto-generate/match as the story advances.",
    "智绘姬": "Zhihuiji",
    "推荐": "Recommended",
    "配合 st-chatu8 插件使用，自动识别其在消息中生成的图片（支持人物剧情CG），无需在本插件内配置 API，开箱即用。": "Works with the st-chatu8 plugin: auto-detects the images it stamps into messages (supports character story CG); no API setup needed here — works out of the box.",
    "不使用 AI 生图，仅使用图包中的本地背景。": "No AI generation — use only the local backgrounds from the image pack.",
    "本地部署的 ComfyUI 文生图，需配置 API 地址与工作流。": "Locally-hosted ComfyUI text-to-image; needs an API address + workflow.",
    "通过反代 API 生成图片，需配置反代地址与 Key，支持人物剧情CG。": "Generates images via a reverse-proxy API; needs the proxy address + key; supports character story CG.",
    "NovelAI 官方 API 生图，需有效订阅与 API Key。": "Image generation via the official NovelAI API; needs an active subscription + API key.",
    "按关键词搜索匹配现成壁纸（非 AI 生成），无需配置。": "Keyword-searches ready-made wallpapers (not AI-generated); no setup needed.",
    "生成剧情CG": "Generate story CG",
    "开启：生成包含人物的剧情CG | 关闭：生成纯场景背景。对 ComfyUI / 大香蕉 / NovelAI / Wallhaven 通用；智绘姬由其插件自行控制。": "On: generate character story CG | Off: generate scenery-only backgrounds. Applies to ComfyUI / Big Banana / NovelAI / Wallhaven; Zhihuiji is controlled by its own plugin.",
    "ComfyUI / 大香蕉 / NovelAI 的 API 地址等详细参数，稍后到「设置 → 资源管理 → 生图配置」中填写。": "Fill in the API address and other details for ComfyUI / Big Banana / NovelAI later under Settings → Asset Management → Image Config.",
    // step 5 — import assets
    "导入图包资源": "Import image-pack assets",
    "内置图包（推荐）": "Built-in pack (recommended)",
    "本地压缩包": "Local zip",
    "远程压缩包": "Remote zip",
    "远程链接 JSON": "Remote link JSON",
    "刷新统计": "Refresh count",
    "正在统计资源…": "Counting assets…",
    "资源统计失败": "Asset count failed",
    "也可以先跳过这一步，稍后到「设置 → 资源管理」中导入或逐张上传。": "You can skip this step and import later under Settings → Asset Management, or upload images one by one.",
    "AI 自动套用立绘": "AI auto-apply sprites",
    "剧情出现新主要角色/重要配角时，AI 自动从内置图包挑选气质匹配的立绘模板套用。": "When a new main/supporting character appears, the AI auto-picks a matching sprite template from the built-in pack.",
    // step 6 — done
    "配置完成": "Setup complete",
    "点击「完成」将刷新视图并应用全部配置。": "Click Finish to refresh the view and apply all settings.",
    "后续调整入口：「设置 → 基础设置」调整文本/画面/立绘等细节；「设置 → 资源管理」管理图包资源；「设置 → 通用 → 配置向导」重新打开本向导。": "Where to adjust later: Settings → Basic Settings for text/display/sprite details; Settings → Asset Management for image packs; Settings → General → Setup Wizard to reopen this wizard.",
    // wizard toasts
    "操作失败，请重试": "Operation failed, please retry",
    "配置完成，视图已刷新": "Setup complete, view refreshed",
    "模式已保存，但世界书更新失败，可稍后在设置面板重试": "Mode saved, but the worldbook update failed; retry later in the settings panel.",
    "设置已保存，但世界书更新失败，可稍后在设置面板重试": "Settings saved, but the worldbook update failed; retry later in the settings panel.",
    "生图配置已保存，但世界书更新失败，可稍后在设置面板重试": "Image config saved, but the worldbook update failed; retry later in the settings panel.",
    // --- galgame 2.0 settings panel + image-gen config (harvested + translated 2026-07-15) ---
    // narration fallback (save-load/process-message; full-width parens — may not surface in harvest)
    "（当前消息无可显示内容）": "(No content to display for this message)",
    // --- skin theme names (v2.0 variants; poetic name kept, descriptor translated) ---
    "墨染千秋（水墨长卷）": "Ink Dynasty (ink scroll)",
    "墨染千秋 · 青绿设色": "Ink Dynasty · blue-green palette",
    "心之怪盗 · 天鹅绒房间": "Phantom Thieves · Velvet Room",
    "苍穹之庭（星降之夜）": "Azure Court (starfall night)",
    "苍穹之庭 · 昼之庭黎明": "Azure Court · daytime garden dawn",
    "燕云十六声（夜雪听风）": "Yanyun Sixteen Voices (night snow, wind)",
    "燕云十六声 · 雪霁": "Yanyun Sixteen Voices · snow clears",
    "朱笺（宣纸墨印）": "Vermilion Note (rice-paper ink)",
    "朱笺 · 墨夜": "Vermilion Note · ink night",
    // --- ambiance themes (X暮) ---
    "薄暮": "Twilight",
    "鎏暮": "Gilded Dusk",
    "晓暮": "Dawn Dusk",
    "绯暮": "Crimson Dusk",
    "霓暮": "Neon Dusk",
    "澄暮": "Clear Dusk",
    "森暮": "Forest Dusk",
    "梦暮": "Dream Dusk",
    "电暮": "Electric Dusk",
    // --- TTS voice descriptors (separate literals from the names; names stay as voice IDs) ---
    "温柔少女(免费)": "Gentle girl (free)",
    "沉稳男声(免费)": "Steady male voice (free)",
    "清冷女声(免费)": "Cool female voice (free)",
    "成熟御姐(免费)": "Mature lady (free)",
    "元气少女(免费)": "Energetic girl (free)",
    "甜美声线(免费)": "Sweet voice (free)",
    "邻家女孩(免费)": "Girl next door (free)",
    "活泼萝莉(免费)": "Lively loli (free)",
    "儒雅公子(免费)": "Refined gentleman (free)",
    "阳光少年(免费)": "Sunny boy (free)",
    "磁性低音(免费)": "Magnetic bass (free)",
    // --- popup (弹窗) settings labels (the <弹窗一/二> tags themselves stay Chinese) ---
    "弹窗一图标": "Popup 1 icon",
    "弹窗二图标": "Popup 2 icon",
    "自定义弹窗一内容 - 自定义内容格式要求（注入到世界书）": "Custom Popup 1 content - content format requirements (injected into the worldbook)",
    "自定义弹窗二内容 - 自定义内容格式要求（注入到世界书）": "Custom Popup 2 content - content format requirements (injected into the worldbook)",
    "上传后将保存到当前角色卡标题背景（scene: __title__）": "After upload, saved to this character card's title background (scene: __title__)",
    "1. 下载皮肤模板（HTML 文件，内嵌与游戏完全一致的界面样式，浏览器打开即所见即所得预览）；": "1. Download the skin template (an HTML file with the game's exact interface styling embedded — open in a browser for a WYSIWYG preview).",
    "1. 保存后，若填写了内容，会自动同步到世界书并注入兼容标签：": "1. After saving, if content is filled in, it auto-syncs to the worldbook and injects a compatibility tag:",
    "1:1 (正方形)": "1:1 (square)",
    "2. 复制 AI 提示词，连同模板文件一起发给任意 AI（Claude / GPT / Gemini 等），描述你想要的风格；": "2. Copy the AI prompt and send it along with the template file to any AI (Claude / GPT / Gemini, etc.), describing the style you want.",
    "3. 把 AI 返回的皮肤样式块替换进模板预览效果，或直接把它保存为 .html 文件，回到本页面导入即可。": "3. Replace the AI-returned skin style block into the template preview, or save it directly as an .html file and import it back on this page.",
    "CG段落全屏铺为背景，对话框不再显示缩略图。": "The CG paragraph fills the full screen as background; the dialog box no longer shows a thumbnail.",
    "CG直接替换背景": "CG replaces background directly",
    "CG管理": "CG management",
    "COT 转换结果": "COT conversion result",
    "Contain（完整显示）": "Contain (full display)",
    "Cover（铺满裁剪）": "Cover (fill and crop)",
    "LittleWhiteBox：未指定/未绑定时使用此默认音色。": "LittleWhiteBox: default voice used when none is specified/bound.",
    "Live2D 模型及其相关素材的版权归原作者或权利人所有。除原始授权另有明确许可外，本插件中的模型与资源仅供学习、研究与技术交流使用。": "Copyright of the Live2D models and related assets belongs to their original authors or rights holders. Except where the original license expressly permits otherwise, the models and resources in this plugin are for learning, research, and technical exchange only.",
    "MVU 事件触发特殊CG": "MVU event triggers special CG",
    "MVU触发CG": "MVU-triggered CG",
    "。同一聊天仅触发一次。": ". Triggers only once per chat.",
    "上传图片": "Upload image",
    "上传图片（支持 gif/webp）": "Upload image (gif/webp supported)",
    "上传地图": "Upload map",
    "上传标题背景": "Upload title background",
    "下载 HTML 模板": "Download HTML template",
    "事件": "Event",
    "事务时间": "Transaction time",
    "二选一：通过下拉切换。当前仅显示所选模式的配置项。": "Either/or: switch via the dropdown. Only the selected mode's settings are shown.",
    "人物关键词开关已移至顶部通用「生成剧情CG」开关（开启后允许人物关键词）。": 'The character-keyword toggle has moved to the top-level general "Generate story CG" switch (enabling it allows character keywords).',
    "仅做格式转换，不会改写剧情；点击“写入开场白”后会覆盖当前角色卡首条开场白，其余条目保留。": `Format conversion only — it won't rewrite the plot; clicking "Write greeting" overwrites the character card's first greeting, leaving other entries intact.`,
    "优先级": "Priority",
    "优化": "Optimize",
    "位置点（默认）": "Position point (default)",
    "使用者必须遵守所在地以及资源来源地的法律法规，禁止将本插件用于违法、侵权、规避监管或其他不当用途。因违规使用产生的风险与责任由使用者自行承担。": "Users must comply with the laws and regulations of their location and of the resource's source location, and must not use this plugin for illegal, infringing, regulation-evading, or other improper purposes. Risks and liabilities arising from improper use are borne solely by the user.",
    "保存规则": "Save rule",
    "内置图包·仙侠": "Built-in image pack · Xianxia",
    "内置图包·古装": "Built-in image pack · Historical costume",
    "内置图包·日式学园": "Built-in image pack · Japanese school",
    "内置图包·现代都市": "Built-in image pack · Modern city",
    "内置背景图包": "Built-in background image pack",
    "写入开场白": "Write greeting",
    "制作皮肤": "Create skin",
    "剧情CG/纯场景切换已移至顶部通用「生成剧情CG」开关。": 'Story CG / plain scene switching has moved to the top-level general "Generate story CG" switch.',
    "副标题": "Subtitle",
    "副标题字体": "Subtitle font",
    "副标题字号(px，默认最大 20.8)": "Subtitle font size (px, default max 20.8)",
    "医院": "Hospital",
    "原文输入": "Source text input",
    "变量路径": "Variable path",
    "启用BGM": "Enable BGM",
    "启用标题界面": "Enable title screen",
    "启用特殊CG触发系统": "Enable special CG trigger system",
    "周历": "Weekly calendar",
    "回溯": "Rewind",
    "图钉": "Pin",
    "在这里粘贴或输入开场白原文...": "Paste or type the original greeting here...",
    "地图": "Map",
    "地图管理": "Map management",
    "地图系统将使用一张统一大地图，不再按场景分别上传": "The map system uses a single unified map instead of uploading one per scene",
    "地标": "Landmark",
    "地球": "Earth",
    "城市": "City",
    "声明。你可以在署名并以相同方式共享的前提下进行非商业使用与修改。": "Disclaimer. You may use and modify this non-commercially, provided you give attribution and share alike.",
    "复制 AI 提示词": "Copy AI prompt",
    "复制结果": "Copy result",
    "夜间天气": "Night weather",
    "太阳": "Sun",
    "头间距": "Top spacing",
    "学校": "School",
    "定位准星": "Locator crosshair",
    "实心时钟": "Solid clock",
    "实时预览：字体大小 / 对话字体 / 行距 / 段间距 / 头尾间距 / 透明度 / 文字特效 调整立即生效。": "Live preview: font size / dialogue font / line spacing / paragraph spacing / top-bottom spacing / opacity / text effects apply instantly.",
    "宫殿 / 御花园 / 街市等 30 场景 + 10 套立绘模板与路人剪影": "30 scenes such as palace / imperial garden / market, plus 10 sprite templates and passerby silhouettes",
    "寒冬": "Deep winter",
    "导入皮肤": "Import skin",
    "导入皮肤文件": "Import skin file",
    "导出打包角色卡（完整设置）": "Export packaged character card (full settings)",
    "小白X（豆包火山）": "LittleWhiteBox (Doubao Volcano)",
    "尚未上传统一世界地图": "No unified world map uploaded yet",
    "尚未加载MVU变量路径": "No MVU variable path loaded yet",
    "尾间距": "Bottom spacing",
    "山地": "Mountains",
    "工具": "Tools",
    "已装皮肤": "Installed skin",
    "店铺": "Shop",
    "建筑": "Building",
    "开启后，只有检测到 Galgame 标签才会显示界面；关闭则总是显示。": "When on, the UI shows only when a Galgame tag is detected; when off, it always shows.",
    "开启后，只有检测到Galgame标签才会显示界面；关闭则总是显示": "When on, the UI shows only when a Galgame tag is detected; when off, it always shows",
    "开启：对话格式含TTS属性，表情在开头；关闭：简单对话格式，表情在结尾。此开关会同步更新 COT 输出格式。": "On: dialogue format includes TTS attributes with the expression at the start; Off: simple dialogue format with the expression at the end. This switch also updates the COT output format.",
    "开启：生成包含人物的剧情CG | 关闭：生成纯场景背景。对 ComfyUI / 大香蕉 / NovelAI / Wallhaven 通用（Wallhaven 下表现为允许人物关键词）；智绘姬不受此开关影响。": "On: generate story CG with characters | Off: generate scene background only. Applies to ComfyUI / Big Banana / NovelAI / Wallhaven (under Wallhaven it allows character keywords); Zhihuiji is unaffected by this switch.",
    "开场白转换": "Greeting conversion",
    "开始": "Start",
    "当 COT 使用": "Use as COT",
    "当前值": "Current value",
    "当日": "Today",
    "性能": "Performance",
    "房屋": "House",
    "打开管理面板": "Open management panel",
    "指南针": "Compass",
    "按钮": "Button",
    "接": "Connect",
    "控制 COT 是否包含 <bgm> 规范。": "Control whether COT includes the <bgm> spec.",
    "控制 COT 是否包含 <styled> 规范。": "Control whether COT includes the <styled> spec.",
    "推进": "Advance",
    "提醒": "Reminder",
    "操作": "Actions",
    "教室 / 天台 / 放学路等 30 场景 + 10 套立绘模板与路人剪影": "30 scenes including classroom / rooftop / walk home, plus 10 sprite templates and passerby silhouettes",
    "新增规则": "New rule",
    "日历": "Calendar",
    "日程": "Schedule",
    "时钟（默认）": "Clock (default)",
    "时间线图谱": "Timeline map",
    "明确禁止商用，包括但不限于售卖、付费分发、商业引流、商业服务集成。": "Commercial use is expressly prohibited, including but not limited to resale, paid distribution, commercial promotion, and integration into commercial services.",
    "显示中文，TTS发送日文。按“中文文本[JP]日文文本”输出（兼容【JP】）；未命中时自动回退原文朗读。": 'Show Chinese, send Japanese to TTS. Output as "Chinese text[JP]Japanese text" (【JP】 also supported); falls back to reading the original text aloud when no match.',
    "显示行为": "Display behavior",
    "智绘姬模式已开启：本插件不会触发 ComfyUI / 大香蕉 / NovelAI / Wallhaven 背景生图，只识别智绘姬(st-chatu8)在消息中渲染出的图片。": "Zhihuiji mode is on: this plugin will not trigger ComfyUI / Big Banana / NovelAI / Wallhaven background image generation, and only recognizes images rendered by Zhihuiji (st-chatu8) in messages.",
    "暂无特殊CG资源，点击上方按钮上传": "No special CG resources yet. Click the button above to upload.",
    "暂无角色数据，请确保已加载数据库脚本或点击上方按钮添加": "No character data. Make sure the database script is loaded, or click the button above to add.",
    "月亮": "Moon",
    "未导入": "Not imported",
    "本页设置影响 AI 输出格式（世界书 COT 注入）与二次生成流程。": "Settings on this page affect the AI output format (worldbook COT injection) and the re-generation flow.",
    "机场": "Airport",
    "条件": "Condition",
    "标签且角色未绑定时，将从对应列表随机分配并自动绑定。": "When tagged but the character is unbound, one will be randomly assigned from the matching list and bound automatically.",
    "标题字体": "Title font",
    "标题字号(px，默认最大 104)": "Title font size (px, default max 104)",
    "标题文字": "Title text",
    "标题界面": "Title screen",
    "森林": "Forest",
    "段间距": "Paragraph spacing",
    "每页字数": "Words per page",
    "水域": "Water",
    "沙漏": "Hourglass",
    "添加CG": "Add CG",
    "港口": "Harbor",
    "渲染": "Render",
    "点击“转换”后将在这里显示 COT 格式结果（可手动微调）...": 'The COT-format result will appear here after you click "Convert" (manual fine-tuning allowed)...',
    "特殊时刻": "Special moment",
    "状态": "Status",
    "生成/COT": "Generation / COT",
    "画面": "Visuals",
    "画面与特效": "Visuals & effects",
    "留空使用默认最大 104px（自适应）": "Leave blank to use the default max 104px (adaptive)",
    "留空使用默认最大 20.8px（自适应）": "Leave blank to use the default max 20.8px (adaptive)",
    "白天天气": "Daytime weather",
    "目标CG": "Target CG",
    "瞬时": "Instant",
    "秒表": "Stopwatch",
    "立绘": "Sprite",
    "立绘显示": "Sprite display",
    "竹林 / 云海 / 仙宫等 30 场景 + 10 套立绘模板与路人剪影": "30 scenes including bamboo forest / sea of clouds / celestial palace, plus 10 sprite templates and passerby silhouettes",
    "第一次生成专注内容，第二次切换API进行COT格式化。": "First generation focuses on content; second switches API for COT formatting.",
    "紧迫": "Urgent",
    "纯文本对话框，不解析角色/旁白/表情，不显示立绘/Live2D；背景（含背景图包）照常切换。": "Plain-text dialogue box: no character/narration/expression parsing, no sprite/Live2D display; background (including background image packs) switches as usual.",
    "结束": "End",
    "统一世界地图": "Unified world map",
    "背景URL": "Background URL",
    "背景填充模式": "Background fill mode",
    "背景来源": "Background source",
    "脚本": "Script",
    "自动": "Auto",
    "自定义皮肤": "Custom skin",
    "营地": "Camp",
    "行距": "Line spacing",
    "规则名": "Rule name",
    "规则名为必填项。建议填写简短事件名，如：生日告白。规则变量路径相对": "Rule name is required. Use a short event name, e.g. Birthday Confession. Rule variable path is relative",
    "角色": "Character",
    "角色卡": "Character card",
    "角色描述": "Character description",
    "请先在“CG管理”中上传CG资源，否则规则无法生效。": `Please upload CG resources in "CG Management" first, or the rule won't take effect.`,
    "读取MVU变量": "Read MVU variable",
    "路牌": "Signpost",
    "路线": "Route",
    "车站": "Station",
    "转换": "Convert",
    "输出规范": "Output spec",
    "过渡": "Transition",
    "还没有导入任何自定义皮肤。下载模板并让 AI 设计一套吧！": "No custom skins imported yet. Download a template and let AI design one!",
    "选择 AI 生成的 HTML 文件。插件会自动提取皮肤样式并做安全处理（限定作用域、剥离危险内容）。": "Select an AI-generated HTML file. The plugin automatically extracts the skin style and sanitizes it (scoping it, stripping dangerous content).",
    "通用": "General",
    "道路": "Road",
    "道路交通": "Road traffic",
    "遮罩层": "Overlay",
    "酒馆助手": "Tavern Helper",
    "阈值": "Threshold",
    "隐藏其他楼层，仅保留当前对话。": "Hide other message floors, keeping only the current conversation.",
    "雨天": "Rainy",
    "高级": "Advanced",
    "默认 · 深色": "Default · Dark",
    "，例如：": ", for example:",
    // --- galgame 2.0 deeper modals: map / CG rules / GitHub+ZIP import / ComfyUI scene-gen + bare voice descriptors (2026-07-15) ---
    "温柔少女": "Gentle girl",
    "沉稳男声": "Steady male voice",
    "清冷女声": "Cool female voice",
    "成熟御姐": "Mature onee-san",
    "元气少女": "Energetic girl",
    "甜美声线": "Sweet voice",
    "邻家女孩": "Girl next door",
    "活泼萝莉": "Lively loli",
    "儒雅公子": "Refined gentleman",
    "阳光少年": "Sunny youth",
    "磁性低音": "Magnetic bass",
    "预览": "Preview",
    "一键导入": "One-click import",
    "上传世界地图": "Upload world map",
    "保存地图": "Save map",
    "规则名（必填）": "Rule name (required)",
    "变量路径，如：角色.艾莉.好感度": "Variable path, e.g.: Character.Ellie.Affection",
    "未填写": "Not filled in",
    "选择CG资源": "Select CG resource",
    "添加背景图片": "Add background image",
    "场景名称": "Scene name",
    "如：教室、公园、夜晚街道": "e.g.: classroom, park, night street",
    "场景描述": "Scene description",
    "生成背景": "Generate background",
    "保存背景": "Save background",
    "请输入 GitHub 仓库地址 (例如: user/repo 或 https://github.com/user/repo/tree/main/path):": "Enter GitHub repo address (e.g.: user/repo or https://github.com/user/repo/tree/main/path):",
    "背景托管在 GitHub（jsDelivr CDN），导入仅保存链接、不占本地存储；显示时按需加载。": "Backgrounds are hosted on GitHub (jsDelivr CDN); import saves only the link, uses no local storage; loaded on demand when shown.",
    "街道 / 咖啡厅 / 雨夜街头等 30 场景 + 10 套立绘模板与路人剪影": "30 scenes such as street / cafe / rainy-night street, plus 10 sprite templates and passerby silhouettes",
    "ZIP 文件链接": "ZIP file link",
    "支持直接下载链接，如 GitHub Release、云盘直链等": "Supports direct download links, e.g. GitHub Release, cloud-drive direct links, etc.",
    "限制：最大 5GB": "Limit: max 5GB",
    "下载并导入": "Download and import",
    "当前为统一世界地图模式：所有地点共用一张大地图，不再按场景/地区分别上传。": "Currently in unified world-map mode: all locations share one big map; no longer uploaded per scene/region.",
    "点击选择地图图片": "Click to select map image",
    "ComfyUI 生成": "ComfyUI generation",
    "ComfyUI 场景生成": "ComfyUI scene generation",
    "使用本地ComfyUI生成背景图片": "Use local ComfyUI to generate background images",
    '场景名称需与 AI 输出的 <background scene="xxx" /> 标签中的 xxx 一致': 'Scene name must match the xxx in the <background scene="xxx" /> tag output by the AI',
    // --- Text-Display live-preview demo text (static plugin UI) ---
    "少女": "Girl",
    "晕染着樱色的天空下，风轻轻拂过发梢。": "Under a sky washed in cherry-blossom pink, the breeze gently stirs her hair.",
    "——这就是与你相遇的季节。": "—This is the season I met you.",
    // --- Add-Sprite modal (crop ratio + built-in template set) ---
    "立绘裁剪比例": "Sprite crop ratio",
    "内置模板": "Built-in templates",
    "选择一套内置立绘模板，整套 10 个表情将套用到上方填写的角色名下（远程链接引用，不占本地存储）。需先导入对应的内置图包。": "Pick a built-in sprite template set; all 10 expressions are applied to the character name entered above (referenced by remote link, uses no local storage). Import the matching built-in image pack first.",
    "套用": "Apply",
    // --- Expression-tags modal (preset + custom expression labels) ---
    "管理表情标签": "Manage expression tags",
    "预设表情 (不可编辑)": "Preset expressions (read-only)",
    "微笑": "Smile",
    "生气": "Angry",
    "难过": "Sad",
    "惊讶": "Surprised",
    "嘲讽": "Mocking",
    "害羞": "Shy",
    "思考": "Thinking",
    "大笑": "Laughing",
    "搞怪": "Playful",
    "自定义表情": "Custom expressions",
    "暂无自定义表情": "No custom expressions yet",
    "添加新表情标签": "Add new expression tag",
    "添加": "Add",
    // --- Add-Special-CG modal (CG id / display name / upload / save) ---
    "添加特殊CG": "Add special CG",
    "显示名称 (可选)": "Display name (optional)",
    "点击选择CG图片": "Click to select CG image",
    "支持 png / jpg / webp": "Supports png / jpg / webp",
    "保存CG": "Save CG",
    // --- MVU-triggered CG row (enable toggle; variable path left as data) ---
    "启用": "Enable",
    // --- Custom-Modules panel (说明 block, save config) + CG display-name fullwidth fix ---
    "显示名称（可选）": "Display name (optional)",
    "2. 右侧图标弹窗只读取当前消息中的标签内容，不再直接显示这里输入的备用内容。": "2. The right-side icon popup reads only the tag content in the current message; it no longer directly shows the fallback content entered here.",
    // --- map-blocked toast (both interface-name build variants) ---
    "未检测到骰子系统数据接口，无法打开地图": "Dice-system data interface not detected — can't open the map",
    "未检测到数据库插件接口，无法打开地图": "Database-plugin interface not detected — can't open the map",
    // --- "no pending choices" toast ---
    "当前没有待选择的选项": "No options available to select right now",
    // --- AI auto-apply sprites: settings toggle (no-space form) + on/off toasts ---
    "AI自动套用立绘": "AI auto-apply sprites",
    "AI自动套用立绘已开启": "AI auto-apply sprites enabled",
    "AI自动套用立绘已关闭": "AI auto-apply sprites disabled",
    "AI自动套用立绘已开启，COT已更新": "AI auto-apply sprites enabled, COT updated",
    "AI自动套用立绘已关闭，COT已更新": "AI auto-apply sprites disabled, COT updated",
    // --- galgame v2.2 (upstream 0500e81): avoid-dialog background fill + depth-of-field focus ---
    // The label rows split their parenthetical into a separate <small>, so each half is its own text
    // node and needs its own key — one entry for "景深聚焦 (非说话者失焦)" would never match anything.
    "完全显示（避开对话框）": "Show whole (clear of the dialogue box)",
    "「完全显示」下背景图/CG 只占对话框上方区域，绝不被遮挡；下方留白用同图模糊铺底。": 'Under "show whole", the background/CG occupies only the area above the dialogue box and is never covered; the strip below is filled with a blurred copy of the same image.',
    // Setup-wizard twin of the same setting (its hint names all three modes in one line).
    "背景图与屏幕比例不一致时，填满裁剪或完整显示留边；「完全显示」则让图片避开对话框，下方留白用同图模糊铺底。": `When the background's aspect differs from the screen: fill-and-crop, or show it whole with letterboxing; "show whole" instead keeps the image clear of the dialogue box and fills the strip below with a blurred copy of it.`,
    "景深聚焦": "Depth-of-field focus",
    "(非说话者失焦)": "(Non-speakers go out of focus)",
    "失焦模糊强度": "Out-of-focus blur strength",
    "(非说话者)": "(Non-speakers)",
    // The settings panel's AI自动套用立绘 toggle gained a hint line. The setup wizard's near-identical
    // twin (剧情出现新…) is already in the wizard block above — one string, one entry, and the two
    // differ by their opening clause, so neither can stand in for the other.
    "新主要角色/重要配角登场时，AI 自动从内置图包挑选气质匹配的立绘模板套用。": "When a new main/supporting character appears, the AI auto-picks a matching sprite template from the built-in pack."
  };
  var PATTERNS = [
    // TTS voice list renders name+descriptor fused: 桃天 (温柔少女(免费)) → 桃天 (Gentle girl, free).
    // Keep the voice-id name; translate the descriptor (via DICT) + 免费/付费.
    [/^(.+?)\s*\(([^()]+)\((免费|付费)\)\)$/, (m) => `${m[1]} (${DICT[m[2]] ?? m[2]}, ${m[3] === "免费" ? "free" : "paid"})`],
    // galgame placeholder examples: 例如：… → e.g.: … (keeps the example content verbatim)
    [/^例如[:：]\s*(.+)$/, (m) => `e.g.: ${m[1]}`],
    // typing speed, saved-CG count, per-card config header (interpolated values)
    [/^(\d+)字\/秒$/, (m) => `${m[1]} chars/sec`],
    [/^已保存 (\d+) 张特殊CG$/, (m) => `Saved ${m[1]} special CG`],
    [/^当前角色卡独立配置（角色卡名:\s*(.+)）$/, (m) => `Per-card config (card name: ${m[1]})`],
    // galgame 2.0 wizard — asset counts (立绘/背景/地图/CG). The leading <i> icon is a sibling node,
    // so the text node is just the "…：立绘 N · …" run.
    [/^资源统计：立绘 (\d+) · 背景 (\d+) · 地图 (\d+) · CG (\d+)$/, (m) => `Assets: sprites ${m[1]} · backgrounds ${m[2]} · maps ${m[3]} · CG ${m[4]}`],
    [/^当前资源：立绘 (\d+) · 背景 (\d+) · 地图 (\d+) · CG (\d+)$/, (m) => `Current assets: sprites ${m[1]} · backgrounds ${m[2]} · maps ${m[3]} · CG ${m[4]}`],
    // wizard "配置完成" summary — label is fused with its interpolated value in ONE text node
    // (显示模式：${modeName} / 生图来源：${bgSourceName}), so translate the label AND look the value
    // up in DICT (标准 Galgame 模式→…, 智绘姬→Zhihuiji, 大香蕉→Big Banana; Wallhaven/ComfyUI pass through).
    [/^显示模式：(.+)$/, (m) => `Display mode: ${DICT[m[1].trim()] ?? m[1].trim()}`],
    [/^生图来源：(.+)$/, (m) => `Image source: ${DICT[m[1].trim()] ?? m[1].trim()}`],
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

  // src/features/i18n/i18n.js
  var HARVEST = false;
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

  // src/features/menu/status-menu-core.js
  var FRAME_STATE_MESSAGE = "mvu-helper:statusmenu-state";
  var FRAME_HEIGHT_MESSAGE = "mvu-helper:statusmenu-height";
  var FRAME_OVERLAY_MESSAGE = "mvu-helper:statusmenu-overlay";
  var FRAME_ERROR_MESSAGE = "mvu-helper:statusmenu-error";
  function frameAttributesFrom(source) {
    if (!source || typeof source !== "object") return null;
    if (typeof source.sandbox !== "string" || typeof source.srcdoc !== "string" || !source.srcdoc) return null;
    return { sandbox: source.sandbox, srcdoc: source.srcdoc };
  }
  function readFrameMessage(data) {
    if (!data || typeof data !== "object") return null;
    if (data.type === FRAME_HEIGHT_MESSAGE) {
      const height = Number(data.height);
      return Number.isFinite(height) && height >= 0 ? { kind: "height", height: Math.round(height) } : null;
    }
    if (data.type === FRAME_OVERLAY_MESSAGE) {
      return typeof data.open === "boolean" ? { kind: "overlay", open: data.open } : null;
    }
    if (data.type === FRAME_ERROR_MESSAGE) {
      return typeof data.message === "string" ? { kind: "error", message: data.message.slice(0, 2e3) } : null;
    }
    return null;
  }
  var FRAME_STYLE = "width:100%;height:100%;border:0;display:block;background:#fff;";
  var FRAME_LIFTED_STYLE = "position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;border:0;display:block;z-index:2147483600;background:transparent;";

  // src/features/galgame-bridge/galgame-mode-core.js
  var GALGAME_MODE_FLAG_PATH = "galgame_ui_plugin.runtime.enabled";
  function isGalgameModeFlagOn(characterVariables) {
    if (!characterVariables || typeof characterVariables !== "object") return false;
    const plugin = characterVariables.galgame_ui_plugin;
    if (!plugin || typeof plugin !== "object") return false;
    const runtime = plugin.runtime;
    if (!runtime || typeof runtime !== "object") return false;
    return runtime.enabled === true;
  }

  // src/features/galgame-bridge/choices.js
  var INJECT_KEY = "galgame-companion-choices";
  var OPTION_SHEET_KEY = "sheet_gal_companion_options";
  var OPTION_SHEET_NAME = "选项表";
  var COL_TEXT = "选项内容";
  var COL_VALUE = "选项值";
  var MAX_CHOICES = 6;
  var CHOICES_INSTRUCTION = [
    "Also append ONE player-choice block as the very last block of your reply, outside the narration",
    "tags (after </maintext> / </gametxt>):",
    '<choices><c v="first-person action text">Verb-first action label</c>...</choices>',
    "- `v` = what the player does or says, in first person — sent verbatim as the player's next input.",
    "- Each label is an ACTION the player takes: START WITH A VERB and convey tone + target,",
    '  e.g. "Tease Mitsuki about her blush", "Coolly brush off Mana", "Pull Aoi aside to apologize".',
    "  NEVER a bare line of dialogue and never a lone verb — always verb + who/what + how.",
    "WHICH actions: if another instruction in your context ASSIGNS the options (what each one is, in what",
    "order), offer exactly those, in that order, as many as it assigns — skip one only when the source it",
    "names is absent, never because the scene seems not to call for it. Only when nothing assigns them,",
    "offer 3 to 5 distinct actions — more when the moment genuinely branches, fewer when it does not.",
    "This rule positions ONLY the choice block and relocates NOTHING else: every other block keeps the",
    "exact position its own instructions give it. A block that belongs BEFORE the narration (thoughts,",
    "plans, state) still goes BEFORE the opening narration tag — never moved to the end; a block that",
    "belongs after the narration stays there. Never move or drop another block because of this rule.",
    "Omit the choice block ONLY if the scene genuinely allows no meaningful choice."
  ].join("\n");
  var RE_CHOICES = /<choices>([\s\S]*?)<\/choices>/i;
  var RE_C = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
  var RE_V = /\bv\s*=\s*"([^"]*)"/i;
  function parseChoices(raw) {
    if (typeof raw !== "string") return [];
    const block = raw.match(RE_CHOICES);
    if (!block) return [];
    const out = [];
    let m;
    RE_C.lastIndex = 0;
    while ((m = RE_C.exec(block[1])) !== null) {
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      const vAttr = (m[1].match(RE_V) || [])[1];
      const value = (vAttr != null ? vAttr : text).trim();
      if (value) out.push({ text, value });
    }
    return out.slice(0, MAX_CHOICES);
  }
  function currentGalMesId() {
    try {
      const el = DOC.querySelector("#gal-global-overlay .gal-game-container");
      const v = el && el.getAttribute("data-mes-id");
      if (v == null || v === "") return -1;
      const n = Number(v);
      return Number.isFinite(n) ? n : -1;
    } catch (e) {
      log.warn("choices: reading current gal mes id failed:", e);
      return -1;
    }
  }
  function rawMessage(id) {
    try {
      const arr = window.getChatMessages(id);
      const msg = Array.isArray(arr) ? arr[0] : arr;
      if (!msg) return null;
      if (msg.role && msg.role !== "assistant") return null;
      return typeof msg.message === "string" ? msg.message : typeof msg.mes === "string" ? msg.mes : null;
    } catch (e) {
      log.warn(`choices: getChatMessages(${id}) failed:`, e);
      return null;
    }
  }
  var _cache = { id: -1, len: -1, sheet: null };
  function getOptionSheet() {
    const id = currentGalMesId();
    if (id < 0) return null;
    const raw = rawMessage(id);
    if (raw == null) return null;
    if (_cache.id === id && _cache.len === raw.length) return _cache.sheet;
    const parsed = parseChoices(raw);
    const sheet = parsed.length ? { key: OPTION_SHEET_KEY, sheet: { name: OPTION_SHEET_NAME, content: [[COL_TEXT, COL_VALUE], ...parsed.map((o) => [o.text, o.value])] } } : null;
    _cache = { id, len: raw.length, sheet };
    return sheet;
  }
  function isGalgameModeOn() {
    if (!topWindow.galgame) return false;
    if (typeof window.getVariables !== "function") {
      log.warn(`choices: getVariables is not on this window — cannot read ${GALGAME_MODE_FLAG_PATH}; treating galgame mode as OFF`);
      return false;
    }
    try {
      return isGalgameModeFlagOn(window.getVariables({ type: "character" }));
    } catch (e) {
      log.warn(`choices: reading ${GALGAME_MODE_FLAG_PATH} threw — treating galgame mode as OFF:`, e);
      return false;
    }
  }
  var _lastInjectOn = null;
  function applyInject(dryRun) {
    if (dryRun) return;
    let ctx = null;
    try {
      ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
    } catch (e) {
      log.warn("choices: getContext threw:", e);
      return;
    }
    if (!ctx || typeof ctx.setExtensionPrompt !== "function") return;
    const on = isGalgameModeOn();
    if (on !== _lastInjectOn) {
      _lastInjectOn = on;
      log.info(`choices: galgame mode ${on ? "ON" : "OFF"} (${topWindow.galgame ? GALGAME_MODE_FLAG_PATH : "galgame not on the page"}) → choice instruction ${on ? "injected" : "cleared"}`);
    }
    try {
      ctx.setExtensionPrompt(INJECT_KEY, on ? CHOICES_INSTRUCTION : "", 1, 0, false, 0);
    } catch (e) {
      log.warn("choices: setExtensionPrompt failed:", e);
    }
  }
  function dismissStaleChoices() {
    try {
      const layer = DOC.getElementById("gal-layer-choices");
      if (layer && layer.classList.contains("active")) {
        layer.click();
        log.info("choices: dismissed stale choice panel for new generation (read-gate re-applies)");
      }
    } catch (e) {
      log.warn("choices: dismissStaleChoices failed:", e);
    }
  }
  var USER_OPEN_WINDOW_MS = 1500;
  var _userOpenedChoicesAt = 0;
  function enforceButtonOnlyChoices() {
    try {
      DOC.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.closest && t.closest('[data-action="show-choices"]')) _userOpenedChoicesAt = Date.now();
      }, true);
      const observer2 = new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target;
          if (el && el.id === "gal-layer-choices" && el.classList && el.classList.contains("active")) {
            if (Date.now() - _userOpenedChoicesAt > USER_OPEN_WINDOW_MS) {
              el.click();
              log.info("choices: suppressed auto-pop (button-only) — panel dismissed, 剧情选项 button stays");
            }
          }
        }
      });
      observer2.observe(DOC, { subtree: true, attributes: true, attributeFilter: ["class"] });
    } catch (e) {
      log.warn("choices: enforceButtonOnlyChoices setup failed (auto-pop not suppressed):", e);
    }
  }
  function startChoices() {
    if (typeof window.getChatMessages !== "function" || typeof window.eventOn !== "function") {
      log.warn("choices: TH globals (getChatMessages/eventOn) absent — choices provider disabled");
      return;
    }
    enforceButtonOnlyChoices();
    const te = window.tavern_events || {};
    if (!te.GENERATION_STARTED) {
      log.warn("choices: tavern_events.GENERATION_STARTED absent — inject disabled (shim reader still active)");
    } else {
      try {
        window.eventOn(te.GENERATION_STARTED, (_type, _option, dryRun) => {
          if (!dryRun) dismissStaleChoices();
          applyInject(dryRun);
        });
      } catch (e) {
        log.warn("choices: bind GENERATION_STARTED failed:", e);
      }
    }
    applyInject(false);
    log.info("choices active (inject + 选项表 shim reader)");
  }

  // src/genre/main/main-profile.js
  var MAIN = Object.freeze({
    name: "main",
    clockDate: Object.freeze(["Date"]),
    clockWeekday: Object.freeze(["Weekday"]),
    clockTime: Object.freeze(["Time"]),
    advanceControl: null,
    meterPanel: null
  });

  // src/genre/school/school-profile.js
  var SCHOOL = Object.freeze({
    name: "school",
    clockDate: Object.freeze(["Date"]),
    clockWeekday: Object.freeze(["Weekday"]),
    clockTime: Object.freeze(["Time"]),
    advanceControl: Object.freeze({
      bindPath: "PendingState.BlockDone",
      label: "Next",
      title: "Advance one time block — uncheck to cancel (until you send a message)"
    }),
    // Live bars over the stage, shown ONLY while an H scene is latched (PendingState.IntimacyActive):
    // outside one every meter sits at its resting value and the bars would only cover the artwork.
    // His side is an energy BUDGET — Energy_curr against Energy_max; each sex act drains it, and at 0
    // he must rest (School models no climax gauge for him: his release is the narrator's to write, his
    // energy is the only hard limit the engine keeps). Her side is the three meters the engine moves
    // per act; the gauge reaching 100 is what fires her climax.
    meterPanel: Object.freeze({
      showWhen: "PendingState.IntimacyActive",
      player: Object.freeze({
        root: "Mainchar",
        label: "You",
        bars: Object.freeze([
          Object.freeze({ key: "energy", label: "Energy", path: "Energy_curr", maxPath: "Energy_max", color: "#60a5fa" })
        ])
      }),
      cast: Object.freeze({
        root: "Classmate",
        presentPath: "Is_present",
        namePath: "Name",
        bars: Object.freeze([
          Object.freeze({ key: "energy", label: "Energy", path: "Energy", max: 100, color: "#60a5fa" }),
          Object.freeze({ key: "arousal", label: "Arousal", path: "Arousal", max: 100, color: "#f472b6" }),
          Object.freeze({ key: "climax", label: "Climax", path: "ClimaxGauge", max: 100, color: "#fbbf24" })
        ])
      })
    })
  });

  // src/genre/genre-profile-core.js
  var PROFILES = Object.freeze({ main: MAIN, school: SCHOOL });
  function profileFor(engineName2) {
    const key = String(engineName2 == null ? "" : engineName2).trim().toLowerCase();
    return PROFILES[key] || MAIN;
  }

  // src/genre/index.js
  function engineName() {
    try {
      const helper = topWindow.MvuHelper;
      if (!helper || typeof helper.engineInfo !== "function") return null;
      const info = helper.engineInfo();
      return info && info.name || null;
    } catch (e) {
      log.warn("genre: reading MvuHelper.engineInfo() threw — falling back to the main profile:", e);
      return null;
    }
  }
  function activeGenre() {
    return profileFor(engineName());
  }
  function logActiveGenre() {
    const name = engineName();
    const profile = profileFor(name);
    if (!name) {
      log.info(`genre: no engine has answered yet → profile "${profile.name}" for now (re-resolved on every use, so an engine that loads later is picked up)`);
      return;
    }
    log.info(`genre: engine "${name}" → profile "${profile.name}"` + (profile === MAIN ? " (no profile for that engine — using the default)" : ""));
  }

  // src/features/galgame-bridge/location-time-core.js
  function displayValue(path, val, statData, renderLabel, onError) {
    const raw = String(val == null ? "" : val).trim();
    if (!raw || typeof renderLabel !== "function") return raw;
    try {
      const shown2 = renderLabel(path, raw, statData);
      if (shown2 && typeof shown2.then === "function") {
        if (typeof onError === "function") onError('i18nLabel("' + path + '") returned a Promise — a label must be synchronous here; showing the raw value', new Error("async labeler"));
        return raw;
      }
      return shown2 == null || String(shown2) === "" ? raw : String(shown2);
    } catch (e) {
      if (typeof onError === "function") onError('i18nLabel("' + path + '") threw — showing the raw value', e);
      return raw;
    }
  }
  function mvuVal(x) {
    return Array.isArray(x) ? x[0] : x;
  }
  var PLAIN_CLOCK = { clockDate: ["Date"], clockWeekday: ["Weekday"], clockTime: ["Time"] };
  function pillStrings(statData, renderLabel, onError, genre) {
    const W = statData && statData.World;
    if (!W) return null;
    const clock = genre || PLAIN_CLOCK;
    const location = displayValue("World.Location", mvuVal(W.Location), statData, renderLabel, onError);
    const fromCandidates = (names) => {
      const list = Array.isArray(names) && names.length ? names : ["Date"];
      for (const key of list) {
        const v = mvuVal(W[key]);
        if (v != null && String(v).trim() !== "") {
          return displayValue("World." + key, v, statData, renderLabel, onError);
        }
      }
      return "";
    };
    const weekday = fromCandidates(clock.clockWeekday);
    const weather = displayValue("World.Weather", mvuVal(W.Weather), statData, renderLabel, onError);
    const date = fromCandidates(clock.clockDate);
    const time = fromCandidates(clock.clockTime);
    const parts = [];
    if (date) parts.push(weekday ? `${date} (${weekday})` : date);
    if (time) parts.push(time);
    let timeStr = parts.join(" ");
    if (weather) timeStr += (timeStr ? " · " : "") + weather;
    return { location, time: timeStr };
  }

  // src/features/galgame-bridge/live-stat-data.js
  var FLOOR_LOOKBACK = 30;
  function newestMessageId() {
    try {
      const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch (e) {
      log.warn("live-stat-data: getLastMessageId threw — reading the chat length instead:", e);
    }
    try {
      const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat;
      if (Array.isArray(chat)) return chat.length - 1;
    } catch (e) {
      log.warn("live-stat-data: reading the chat length threw — no floor can be resolved right now:", e);
    }
    return -1;
  }
  function statDataOf(id) {
    if (typeof window.getVariables === "function") {
      const v = window.getVariables({ type: "message", message_id: id });
      return v && v.stat_data;
    }
    const Mvu = topWindow.Mvu;
    if (Mvu && typeof Mvu.getMvuData === "function") {
      const d = Mvu.getMvuData({ type: "message", message_id: id });
      return d && d.stat_data;
    }
    return null;
  }
  function latestStatData({ from, accept } = {}) {
    const top = Number.isFinite(from) && from >= 0 ? Math.floor(from) : newestMessageId();
    if (top < 0) return null;
    const ok = typeof accept === "function" ? accept : () => true;
    let firstError = null;
    for (let id = top; id >= 0 && id > top - FLOOR_LOOKBACK; id--) {
      let sd = null;
      try {
        sd = statDataOf(id);
      } catch (e) {
        if (!firstError) firstError = { id, e };
        continue;
      }
      if (sd && typeof sd === "object" && ok(sd)) return { statData: sd, floor: id };
    }
    if (firstError) log.warn(`live-stat-data: reading floor ${firstError.id} threw (and no floor qualified):`, firstError.e);
    return null;
  }

  // src/features/galgame-bridge/location-time-bridge.js
  var SHEET_UID = "sheet_global_data";
  var SHEET_NAME = "全局数据表";
  var COL_LOCATION = "当前详细地点";
  var COL_TIME = "当前时间";
  var labelCache = /* @__PURE__ */ new Map();
  var labelPending = /* @__PURE__ */ new Set();
  function engineLabeler() {
    let engine = null;
    try {
      engine = topWindow.LogicEngine;
    } catch (e) {
      log.warn("location-time-bridge: reading LogicEngine threw — pills fall back to raw stored values:", e);
      return null;
    }
    if (!engine || typeof engine.i18nLabel !== "function") return null;
    return (path, value, statData) => {
      let lang = "";
      try {
        const L = statData && statData.Preferences && statData.Preferences.Lang;
        lang = String((Array.isArray(L) ? L[0] : L) || "");
      } catch (e) {
      }
      const key = lang + "|" + path + "|" + value;
      if (labelCache.has(key)) return labelCache.get(key);
      let result;
      try {
        result = engine.i18nLabel(path, value, statData);
      } catch (e) {
        log.warn('location-time-bridge: i18nLabel("' + path + '") threw — showing the raw value:', e);
        labelCache.set(key, value);
        return value;
      }
      if (!result || typeof result.then !== "function") {
        labelCache.set(key, result == null || result === "" ? value : String(result));
        return labelCache.get(key);
      }
      if (!labelPending.has(key)) {
        labelPending.add(key);
        Promise.resolve(result).then(
          (v) => {
            labelCache.set(key, v == null || v === "" ? value : String(v));
          },
          (e) => {
            labelCache.set(key, value);
            log.warn('location-time-bridge: i18nLabel("' + path + '") rejected — keeping the raw value:', e);
          }
        ).finally(() => {
          labelPending.delete(key);
          refreshLocationTimePills();
        });
      }
      return value;
    };
  }
  function pills() {
    const found = latestStatData({ accept: (sd2) => !!sd2.World });
    const sd = found && found.statData;
    if (!sd) return null;
    return pillStrings(sd, engineLabeler(), (msg, e) => log.warn("location-time-bridge: " + msg, e), activeGenre());
  }
  function refreshLocationTimePills() {
    try {
      const p = pills();
      if (!p) return false;
      const doc = topWindow.document;
      if (!doc) return false;
      const locText = doc.querySelector("#gal-location-text");
      const timeText = doc.querySelector("#gal-time-text");
      const locBar = doc.querySelector("#gal-location-bar");
      const timeBar = doc.querySelector("#gal-time-bar");
      const locStr = p.location || "未知地点";
      const timeStr = p.time || "--";
      if (locText) locText.textContent = locStr;
      if (timeText) timeText.textContent = timeStr;
      if (locBar) locBar.setAttribute("title", locStr);
      if (timeBar) timeBar.setAttribute("title", timeStr);
      return !!(p.location || p.time);
    } catch (e) {
      log.warn("location-time-bridge: refreshLocationTimePills failed:", e);
      return false;
    }
  }
  function startLocationTimeBridge() {
    let existing = null;
    try {
      existing = topWindow.AutoCardUpdaterAPI;
    } catch (e) {
      log.warn("location-time-bridge: reading AutoCardUpdaterAPI threw — skipping shim:", e);
      return;
    }
    if (existing && typeof existing.exportTableAsJson === "function") {
      log.info("location-time-bridge: AutoCardUpdaterAPI already present — not shimming (respecting the real one).");
      return;
    }
    try {
      topWindow.AutoCardUpdaterAPI = {
        // galgame reads content[0]=headers, content[1]=dataRow and maps 当前详细地点→detailedLocation,
        // 当前时间→currentTime. Return {} while there's no World so galgame's isEmpty retry keeps polling.
        exportTableAsJson() {
          try {
            const out = {};
            const p = pills();
            if (p && (p.location || p.time)) {
              out.global = { uid: SHEET_UID, name: SHEET_NAME, content: [[COL_LOCATION, COL_TIME], [p.location, p.time]] };
            }
            const opt = getOptionSheet();
            if (opt) out[opt.key] = opt.sheet;
            return out;
          } catch (e) {
            log.warn("location-time-bridge: exportTableAsJson failed:", e);
            return {};
          }
        }
      };
      log.info("location-time-bridge: AutoCardUpdaterAPI shim installed (galgame location/time pills ← stat_data.World).");
    } catch (e) {
      log.error("location-time-bridge: could not install AutoCardUpdaterAPI shim:", e);
    }
  }

  // src/features/galgame-bridge/html-escape-core.js
  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // src/features/galgame-bridge/next-block-core.js
  var WRAP_CLASS = "school-nextblock";
  var CB_CLASS = "school-nextblock-cb";
  var LABEL_CLASS = "school-nextblock-label";
  var PATH_ATTR = "data-advance-path";
  var DEFAULT_LABEL = "Next";
  var DEFAULT_TITLE = "Advance to the next segment — uncheck to cancel (until you send a message)";
  function advanceControlFor(genre) {
    const control2 = genre && genre.advanceControl;
    if (!control2) return null;
    const bindPath = String(control2.bindPath == null ? "" : control2.bindPath).trim();
    if (!bindPath) return null;
    const label = String(control2.label == null ? "" : control2.label).trim() || DEFAULT_LABEL;
    const title = String(control2.title == null ? "" : control2.title).trim() || DEFAULT_TITLE;
    return { bindPath, label, title };
  }
  function chipHtml(control2) {
    const title = escapeHtml(control2.title);
    return `<label class="${WRAP_CLASS}" ${PATH_ATTR}="${escapeHtml(control2.bindPath)}" title="${title}"><span class="${LABEL_CLASS}">${escapeHtml(control2.label)}</span><input type="checkbox" class="${CB_CLASS}" aria-label="${title}" /></label>`;
  }
  function flagFromStatData(statData, bindPath) {
    let cur = statData;
    for (const seg of String(bindPath || "").split(".").filter(Boolean)) {
      if (cur == null || typeof cur !== "object") return false;
      cur = cur[seg];
    }
    const raw = Array.isArray(cur) && cur.length >= 2 && typeof cur[1] === "string" ? cur[0] : cur;
    return Boolean(raw);
  }
  var MENU_ACTION_MESSAGE = "mvu-statusmenu-action";
  function flagActionRequest(bindPath, want, requestId) {
    return { type: MENU_ACTION_MESSAGE, requestId: String(requestId), action: "setValue", args: { path: String(bindPath), value: Boolean(want), scopePath: "" } };
  }

  // src/features/galgame-bridge/next-block.js
  var OVERLAY_SEL = "#gal-global-overlay";
  function control() {
    return advanceControlFor(activeGenre());
  }
  function readFlag() {
    const active = control();
    if (!active) return false;
    const live = latestStatData();
    return flagFromStatData(live && live.statData, active.bindPath);
  }
  function nudgePills() {
    [250, 700, 1400].forEach((ms) => setTimeout(() => {
      try {
        refreshLocationTimePills();
      } catch (e) {
        log.warn("next-block: pill refresh failed:", e);
      }
    }, ms));
  }
  var ACTION_TIMEOUT_MS = 8e3;
  var actionSeq = 0;
  function setFlag(want) {
    const active = control();
    if (!active) {
      log.warn("next-block: this genre declares no manual advance — nothing to set");
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const request = flagActionRequest(active.bindPath, want, "next-block-" + ++actionSeq + "-" + Date.now());
      const done = (achieved, why) => {
        clearTimeout(timer);
        window.removeEventListener("message", onReply);
        if (why) log.warn(`next-block: ${active.bindPath} flag NOT ${want ? "set" : "cleared"} — ${why}`);
        else log.info(`next-block: ${active.bindPath} flag ` + (want ? "SET (will advance at reply-end; the engine previews it)" : "cleared"));
        nudgePills();
        resolve(achieved);
      };
      const timer = setTimeout(() => done(readFlag(), "mvu-helper did not answer within " + ACTION_TIMEOUT_MS / 1e3 + "s (is it installed and enabled?)"), ACTION_TIMEOUT_MS);
      function onReply(event) {
        const data = event && event.data;
        if (!data || data.type !== MENU_ACTION_MESSAGE + "-result" || data.requestId !== request.requestId) return;
        if (data.ok) done(want, "");
        else done(readFlag(), data.reason || "refused");
      }
      window.addEventListener("message", onReply);
      topWindow.postMessage(request, "*");
    });
  }
  var announced = "";
  function injectInto() {
    const overlay = DOC.querySelector(OVERLAY_SEL);
    if (!overlay) return false;
    const active = control();
    const existing = overlay.querySelector(`.${WRAP_CLASS}`);
    if (!active) {
      if (existing) {
        existing.remove();
        log.info("next-block: this genre declares no manual advance — chip removed");
      }
      return false;
    }
    if (existing) {
      if (existing.getAttribute(PATH_ATTR) === active.bindPath) return false;
      existing.remove();
    }
    overlay.insertAdjacentHTML("beforeend", chipHtml(active));
    const chip = overlay.querySelector(`.${WRAP_CLASS}`);
    if (chip) chip.addEventListener("click", (e) => e.stopPropagation());
    const cb = chip && chip.querySelector(`.${CB_CLASS}`);
    if (cb) cb.checked = readFlag();
    if (announced !== active.bindPath) {
      announced = active.bindPath;
      log.info(`next-block: advance chip rendered for genre "${activeGenre().name}" (flag model, ${active.bindPath})`);
    }
    return true;
  }
  function startNextBlock() {
    if (!DOC || !DOC.body) return setTimeout(startNextBlock, 200);
    DOC.addEventListener("change", (e) => {
      const cb = e.target && e.target.classList && e.target.classList.contains(CB_CLASS) ? e.target : null;
      if (!cb) return;
      const want = cb.checked;
      cb.disabled = true;
      setFlag(want).then((got) => {
        cb.checked = got;
      }).catch((err) => {
        log.error("next-block: flag toggle failed:", err);
        cb.checked = readFlag();
      }).finally(() => {
        cb.disabled = false;
      });
    });
    let scheduled3 = false;
    const observer2 = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      requestAnimationFrame(() => {
        scheduled3 = false;
        injectInto();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    injectInto();
    log.info("next-block watching (the chip appears once a genre declaring a manual advance is loaded)");
  }

  // src/features/galgame-bridge/meter-panel-core.js
  var PANEL_CLASS = "companion-meters";
  var GROUP_CLASS = "companion-meter-group";
  var TITLE_CLASS = "companion-meter-title";
  var BAR_CLASS = "companion-meter";
  var LABEL_CLASS2 = "companion-meter-label";
  var VALUE_CLASS = "companion-meter-value";
  var TRACK_CLASS = "companion-meter-track";
  var FILL_CLASS = "companion-meter-fill";
  var SIGNATURE_ATTR = "data-meter-signature";
  var RE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\))$/i;
  var DEFAULT_COLOR = "#9ca3af";
  function readPath(root, path) {
    const segments = String(path == null ? "" : path).split(".").filter(Boolean);
    let node = root;
    for (const segment of segments) {
      if (node == null || typeof node !== "object") return void 0;
      node = node[segment];
    }
    return mvuVal(node);
  }
  function finiteNumber(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  function readBar(node, bar, where, onError) {
    const rawValue = readPath(node, bar.path);
    let value = finiteNumber(rawValue);
    if (value === null) {
      onError(`meter "${bar.label}": ${where}.${bar.path} is ${rawValue === void 0 ? "absent" : "not a number"} — drawn as 0`);
      value = 0;
    }
    let max;
    if (bar.maxPath) {
      const rawMax = readPath(node, bar.maxPath);
      max = finiteNumber(rawMax);
      if (max === null || max <= 0) {
        onError(`meter "${bar.label}": ${where}.${bar.maxPath} is ${rawMax === void 0 ? "absent" : "not a positive number"} — scale drawn as 100`);
        max = 100;
      }
    } else {
      max = finiteNumber(bar.max);
      if (max === null || max <= 0) {
        onError(`meter "${bar.label}": the profile declares no usable max — scale drawn as 100`);
        max = 100;
      }
    }
    const pct = Math.max(0, Math.min(100, Math.round(value / max * 100)));
    const color = RE_COLOR.test(String(bar.color || "")) ? String(bar.color) : DEFAULT_COLOR;
    return { key: String(bar.key || bar.path), label: String(bar.label || bar.path), value, max, pct, color };
  }
  function meterPanelModel(statData, spec, onError = () => {
  }) {
    if (!spec || !statData || typeof statData !== "object") return null;
    if (spec.showWhen && readPath(statData, spec.showWhen) !== true) return null;
    let player = null;
    if (spec.player && spec.player.root) {
      const node = statData[spec.player.root];
      if (node && typeof node === "object") {
        player = {
          label: String(spec.player.label || spec.player.root),
          bars: (spec.player.bars || []).map((bar) => readBar(node, bar, spec.player.root, onError))
        };
      } else {
        onError(`meter panel: ${spec.player.root} is absent from stat_data — the player's bars are not drawn`);
      }
    }
    const cast = [];
    if (spec.cast && spec.cast.root) {
      const roster = statData[spec.cast.root];
      if (roster && typeof roster === "object") {
        for (const key of Object.keys(roster)) {
          const member = roster[key];
          if (!member || typeof member !== "object") continue;
          if (readPath(member, spec.cast.presentPath) !== true) continue;
          const rawName = readPath(member, spec.cast.namePath);
          const name = String(rawName == null ? "" : rawName).trim() || key;
          cast.push({ key, name, bars: (spec.cast.bars || []).map((bar) => readBar(member, bar, `${spec.cast.root}.${key}`, onError)) });
        }
      } else {
        onError(`meter panel: ${spec.cast.root} is absent from stat_data — no cast bars are drawn`);
      }
    }
    if (!player && !cast.length) return null;
    return { player, cast };
  }
  function modelSignature(model) {
    const bars = (list) => list.map((b) => `${b.key}=${b.value}/${b.max}`).join(",");
    const groups = [];
    if (model.player) groups.push(`${model.player.label}:${bars(model.player.bars)}`);
    for (const member of model.cast) groups.push(`${member.key}:${member.name}:${bars(member.bars)}`);
    return groups.join("|");
  }
  function barHtml(bar) {
    return `<div class="${BAR_CLASS}" data-meter="${escapeHtml(bar.key)}"><span class="${LABEL_CLASS2}">${escapeHtml(bar.label)}</span><span class="${VALUE_CLASS}">${escapeHtml(bar.value)}/${escapeHtml(bar.max)}</span><div class="${TRACK_CLASS}"><div class="${FILL_CLASS}" style="width:${bar.pct}%;background:${escapeHtml(bar.color)}"></div></div></div>`;
  }
  function groupHtml(title, bars) {
    return `<div class="${GROUP_CLASS}"><div class="${TITLE_CLASS}">${escapeHtml(title)}</div>${bars.map(barHtml).join("")}</div>`;
  }
  function panelHtml(model) {
    const groups = [];
    if (model.player) groups.push(groupHtml(model.player.label, model.player.bars));
    for (const member of model.cast) groups.push(groupHtml(member.name, member.bars));
    return `<div class="${PANEL_CLASS}" ${SIGNATURE_ATTR}="${escapeHtml(modelSignature(model))}">${groups.join("")}</div>`;
  }

  // src/features/galgame-bridge/meter-panel.js
  var OVERLAY_SEL2 = "#gal-global-overlay";
  var STAGE_SEL = "#gal-global-overlay .gal-game-container";
  var MVU_UPDATE_ENDED = "mag_variable_update_ended";
  function displayedFloor() {
    const stage = DOC.querySelector(STAGE_SEL);
    const raw = stage && stage.getAttribute("data-mes-id");
    if (raw == null || raw === "") return -1;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : -1;
  }
  var reported = /* @__PURE__ */ new Set();
  function reportOnce(message) {
    if (reported.has(message)) return;
    reported.add(message);
    log.warn("meter-panel: " + message);
  }
  var shown = false;
  function redraw() {
    const overlay = DOC.querySelector(OVERLAY_SEL2);
    if (!overlay) return;
    const spec = activeGenre().meterPanel;
    const existing = overlay.querySelector(`.${PANEL_CLASS}`);
    if (!spec) {
      if (existing) {
        existing.remove();
        log.info("meter-panel: this genre declares no meters — panel removed");
      }
      shown = false;
      return;
    }
    const from = displayedFloor();
    const found = latestStatData(from >= 0 ? { from } : {});
    const model = found ? meterPanelModel(found.statData, spec, reportOnce) : null;
    if (!model) {
      if (existing) existing.remove();
      if (shown) {
        shown = false;
        log.info(`meter-panel: hidden — ${spec.showWhen || "nothing"} no longer reads true`);
      }
      return;
    }
    const html = panelHtml(model);
    const signature = /data-meter-signature="([^"]*)"/.exec(html);
    if (existing && signature && existing.getAttribute(SIGNATURE_ATTR) === signature[1]) return;
    if (existing) existing.outerHTML = html;
    else overlay.insertAdjacentHTML("beforeend", html);
    if (!shown) {
      shown = true;
      log.info(`meter-panel: shown for genre "${activeGenre().name}" (${spec.showWhen} reads true on floor ${found.floor}) — ${model.player ? 1 : 0} player group, ${model.cast.length} cast group(s)`);
    }
  }
  var scheduled2 = false;
  function schedule() {
    if (scheduled2) return;
    scheduled2 = true;
    requestAnimationFrame(() => {
      scheduled2 = false;
      try {
        redraw();
      } catch (e) {
        log.error("meter-panel: redraw failed:", e);
      }
    });
  }
  function startMeterPanel() {
    if (!DOC || !DOC.body) return setTimeout(startMeterPanel, 200);
    const te = window.tavern_events || {};
    const names = [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED, te.MESSAGE_SWIPED, te.MESSAGE_EDITED, te.MESSAGE_DELETED, te.CHAT_CHANGED, MVU_UPDATE_ENDED];
    if (typeof window.eventOn === "function") {
      for (const name of names) {
        if (!name) continue;
        try {
          window.eventOn(name, schedule);
        } catch (e) {
          log.warn(`meter-panel: eventOn(${name}) failed — that trigger will not redraw the bars:`, e);
        }
      }
    } else {
      log.warn("meter-panel: eventOn is not on this window — the bars redraw only on stage rebuilds");
    }
    const observer2 = new MutationObserver(schedule);
    observer2.observe(DOC.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-mes-id"] });
    schedule();
    log.info("meter-panel watching (the bars appear once a genre declaring meters is loaded and its gate reads true)");
  }

  // src/features/menu/status-menu.js
  var MVU_UPDATE_ENDED2 = "mag_variable_update_ended";
  var current = null;
  function onFrameMessage(event) {
    if (!current || !current.frame.isConnected || event.source !== current.frame.contentWindow) return;
    const msg = readFrameMessage(event.data);
    if (!msg) return;
    if (msg.kind === "height") {
      current.height = msg.height;
      if (!current.lifted) current.frame.style.height = msg.height + "px";
    } else if (msg.kind === "overlay") {
      if (msg.open && !current.lifted) {
        current.savedStyle = current.frame.style.cssText;
        current.frame.style.cssText = FRAME_LIFTED_STYLE;
        current.lifted = true;
      } else if (!msg.open && current.lifted) {
        current.frame.style.cssText = current.savedStyle;
        current.lifted = false;
      }
    } else {
      log.warn("status-menu: the StatusMenu frame threw: " + msg.message);
    }
  }
  var pushTimer = null;
  function schedulePush() {
    if (!current) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (!current || !current.frame.isConnected) {
        current = null;
        return;
      }
      const live = latestStatData();
      if (!live) return;
      try {
        current.frame.contentWindow.postMessage({ type: FRAME_STATE_MESSAGE, mid: live.floor, statData: live.statData }, "*");
      } catch (e) {
        log.warn("status-menu: could not push state to the StatusMenu frame:", e);
      }
    }, 150);
  }
  var wired = false;
  function wireOnce() {
    if (wired) return;
    wired = true;
    topWindow.addEventListener("message", onFrameMessage);
    const te = window.tavern_events || {};
    if (typeof window.eventOn !== "function") {
      log.warn("status-menu: eventOn is not on this window — the open menu shows the state it was opened with until it is reopened");
      return;
    }
    for (const name of [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED, te.MESSAGE_SWIPED, te.CHAT_CHANGED, MVU_UPDATE_ENDED2]) {
      if (!name) continue;
      try {
        window.eventOn(name, schedulePush);
      } catch (e) {
        log.warn(`status-menu: eventOn(${name}) failed — that trigger will not refresh the open menu:`, e);
      }
    }
  }
  async function mountStatusMenu(bodyEl) {
    const helper = topWindow.MvuHelper;
    if (!helper || typeof helper.statusMenuFrameSource !== "function") {
      bodyEl.textContent = "The StatusMenu needs mvu-helper 0.3.290 or later.";
      log.warn("status-menu: MvuHelper.statusMenuFrameSource is not on the page — mvu-helper is missing, disabled, or older than the contained menu");
      return null;
    }
    const live = latestStatData();
    let source = null;
    try {
      source = frameAttributesFrom(await helper.statusMenuFrameSource({ mid: live ? live.floor : -1, statData: live ? live.statData : null }));
    } catch (e) {
      log.error("status-menu: MvuHelper.statusMenuFrameSource failed:", e);
      bodyEl.textContent = "Failed to load the StatusMenu (see console).";
      return null;
    }
    if (!source) {
      bodyEl.textContent = "This card has no StatusMenu.";
      log.info("status-menu: mvu-helper reports no contained StatusMenu on this card — none is installed, or it was installed before the lift (re-activate the StatusMenu pack)");
      return null;
    }
    if (!bodyEl.isConnected) return null;
    wireOnce();
    bodyEl.textContent = "";
    bodyEl.style.cssText = "flex:1 1 auto;display:block;padding:0;overflow:auto;";
    const frame = DOC.createElement("iframe");
    frame.setAttribute("sandbox", source.sandbox);
    frame.setAttribute("title", "StatusMenu");
    frame.style.cssText = FRAME_STYLE;
    frame.srcdoc = source.srcdoc;
    bodyEl.appendChild(frame);
    current = { frame, height: 0, lifted: false, savedStyle: "" };
    log.info(`status-menu: mounted the contained StatusMenu (${source.srcdoc.length} chars, sandbox="${source.sandbox}")`);
    return frame;
  }

  // src/features/galgame-quirks/fullscreen-guard.js
  function currentFullscreenEl() {
    return DOC.fullscreenElement || DOC.webkitFullscreenElement || DOC.mozFullScreenElement || DOC.msFullscreenElement || null;
  }
  function exitFullscreen() {
    const fn = DOC.exitFullscreen || DOC.webkitExitFullscreen || DOC.mozCancelFullScreen || DOC.msExitFullscreen;
    if (!fn) return;
    try {
      const r = fn.call(DOC);
      if (r && typeof r.catch === "function") {
        r.catch((e) => log.warn("fullscreen-guard: exitFullscreen rejected:", e));
      }
    } catch (e) {
      log.warn("fullscreen-guard: exitFullscreen threw:", e);
    }
  }
  function startFullscreenGuard() {
    if (!DOC) {
      log.warn("fullscreen-guard: no parent document — skipping");
      return;
    }
    DOC.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-action="close-mode"]');
      if (!btn) return;
      setTimeout(() => {
        if (currentFullscreenEl()) {
          log.info("fullscreen-guard: galgame quit while fullscreen — exiting native fullscreen");
          exitFullscreen();
        }
      }, 0);
    }, true);
    log.info("fullscreen-guard active");
  }

  // src/features/galgame-quirks/generating-indicator.js
  var INDICATOR_ID = "gal-generating-indicator";
  var OVERLAY_SEL3 = "#gal-global-overlay";
  var POLL_MS = 750;
  var TURN_PHASE_EVENT = "mvu_helper_turn_phase";
  var PHASE_MAX_MS = 3e5;
  var generating = false;
  var phaseOpenAt = 0;
  var phaseOverranReported = false;
  var indicatorShown = null;
  var watchedIndicator = null;
  function isTurnBusy() {
    return generating || mvuPhaseOpen() || stFlagsBusy();
  }
  function stFlagsBusy() {
    try {
      if (topWindow.is_send_press) return true;
      const ctx = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
      if (ctx && ctx.streamingProcessor) return true;
    } catch (e) {
    }
    return false;
  }
  function mvuPhaseOpen() {
    if (!phaseOpenAt) return false;
    const openFor = Date.now() - phaseOpenAt;
    if (openFor <= PHASE_MAX_MS) return true;
    if (!phaseOverranReported) {
      phaseOverranReported = true;
      log.warn(
        `generating-indicator: mvu-helper has held a turn phase open for ${Math.round(openFor / 1e3)}s without closing it (its own per-call timeout is far shorter). Treating the turn as finished so the Generating popup does not hang — but the unclosed phase is a defect on the mvu-helper side, not here.`
      );
    }
    return false;
  }
  function overlayPresent() {
    const overlay = DOC.querySelector(OVERLAY_SEL3);
    return Boolean(overlay && overlay.classList.contains("active"));
  }
  var classObserver = null;
  function watchIndicator(el) {
    if (el === watchedIndicator) return;
    if (classObserver) classObserver.disconnect();
    watchedIndicator = el;
    if (!el) return;
    try {
      classObserver = new MutationObserver(() => reconcile());
      classObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {
      classObserver = null;
      watchedIndicator = null;
      log.warn("generating-indicator: could not watch the popup for foreign class writes — galgame hiding it mid-POST will now blink until the next poll:", e);
    }
  }
  function reconcile() {
    const el = DOC.getElementById(INDICATOR_ID);
    watchIndicator(el);
    if (!el) return;
    const busy = isTurnBusy();
    const isShown = el.classList.contains("active");
    if (busy && !overlayPresent()) return;
    if (busy === isShown) return;
    el.classList.toggle("active", busy);
    if (indicatorShown !== busy) {
      indicatorShown = busy;
      log.info(`generating-indicator: ${busy ? "shown (turn in flight)" : "hidden (turn finished)"}`);
    }
  }
  function startGeneratingIndicator() {
    const te = window.tavern_events || {};
    const on = typeof window.eventOn === "function" ? window.eventOn : null;
    if (!on) {
      log.warn("generating-indicator: TH eventOn absent — no PRE/POST or generation signal; relying on ST live flags only");
    } else {
      try {
        on(TURN_PHASE_EVENT, (payload) => {
          const busy = Boolean(payload && payload.busy);
          phaseOpenAt = busy ? Date.now() : 0;
          if (busy) phaseOverranReported = false;
          log.info(`generating-indicator: mvu-helper turn phase ${busy ? "OPEN" : "closed"} (${payload && payload.phase || "?"})`);
          reconcile();
        });
      } catch (e) {
        log.warn(`generating-indicator: bind ${TURN_PHASE_EVENT} failed — the PRE/POST half of the turn will be invisible:`, e);
      }
      if (te.GENERATION_STARTED) {
        try {
          on(te.GENERATION_STARTED, (type, option, dryRun) => {
            if (dryRun) return;
            if (type === "quiet" && !(option && option.quietToLoud)) return;
            generating = true;
            reconcile();
          });
        } catch (e) {
          log.warn("generating-indicator: bind GENERATION_STARTED failed:", e);
        }
      }
      for (const ev of [te.GENERATION_ENDED, te.GENERATION_STOPPED]) {
        if (!ev) continue;
        try {
          on(ev, () => {
            generating = false;
            reconcile();
          });
        } catch (e) {
          log.warn("generating-indicator: bind end/stop failed:", e);
        }
      }
    }
    (topWindow.setInterval || setInterval)(reconcile, POLL_MS);
    reconcile();
    log.info("generating-indicator active");
  }

  // src/features/menu/menu-modal.js
  var MODAL_ID = "school-companion-modal";
  var STYLE_ID2 = "school-companion-modal-css";
  var Z_INDEX = 2147483e3;
  function modalParent() {
    return currentFullscreenEl() || DOC.body;
  }
  function ensureStyles() {
    if (DOC.getElementById(STYLE_ID2)) return;
    const style = DOC.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = `
#${MODAL_ID} {
  position: fixed; inset: 0; z-index: ${Z_INDEX};
  /* explicit viewport units — SillyTavern sets transform on <html>, which re-roots
     position:fixed to that ancestor, so inset:0 collapses to 0 height. vw/dvh always
     resolve to the real viewport, so the wrap fills the screen regardless. */
  width: 100vw; height: 100vh; height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55);
}
#${MODAL_ID} .sc-box {
  position: relative;
  /* Fill (almost) the full viewport height — the status menu is a long scroller, so height is precious.
     Small vertical margin (96dvh) keeps the rounded corners off the screen edge; width stays capped for
     readable line length. dvh so mobile browser chrome doesn't overflow it. */
  width: min(920px, 94vw); height: 96dvh;
  background: #1a1a2e; border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  overflow: hidden; display: flex; flex-direction: column;
}
#${MODAL_ID} .sc-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: #0f3460; color: #e8e8e8;
  font-weight: 700; flex: 0 0 auto;
}
#${MODAL_ID} .sc-bar button {
  background: none; border: 0; color: #e8e8e8;
  font-size: 1.1rem; cursor: pointer; padding: 4px 8px;
}
#${MODAL_ID} .sc-body {
  flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  color: #8892b0;
}
@media (max-width: 768px) {
  #${MODAL_ID} { background: #1a1a2e; }         /* opaque — no galgame bleed-through */
  #${MODAL_ID} .sc-box {
    width: 100vw; height: 100vh; height: 100dvh; /* dvh handles mobile browser chrome */
    max-width: none; max-height: none;
    border-radius: 0; box-shadow: none;
  }
}`;
    (DOC.head || DOC.documentElement).appendChild(style);
  }
  var modalCleanup = null;
  function closeMenuModal() {
    if (modalCleanup) {
      try {
        modalCleanup();
      } catch (e) {
        log.warn("menu-modal: cleanup failed:", e);
      }
      modalCleanup = null;
    }
    const el = DOC.getElementById(MODAL_ID);
    if (el) el.remove();
  }
  function openMenuModal() {
    if (DOC.getElementById(MODAL_ID)) return;
    ensureStyles();
    const wrap = DOC.createElement("div");
    wrap.id = MODAL_ID;
    const box = DOC.createElement("div");
    box.className = "sc-box";
    const bar = DOC.createElement("div");
    bar.className = "sc-bar";
    bar.innerHTML = '<span><i class="fa-solid fa-users"></i> School Menu</span><button data-school-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>';
    const body = DOC.createElement("div");
    body.className = "sc-body";
    box.appendChild(bar);
    box.appendChild(body);
    wrap.appendChild(box);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest && e.target.closest("[data-school-close]")) {
        closeMenuModal();
      }
    });
    const onKey = (e) => {
      if (e.key === "Escape") closeMenuModal();
    };
    DOC.addEventListener("keydown", onKey);
    modalCleanup = () => {
      DOC.removeEventListener("keydown", onKey);
    };
    modalParent().appendChild(wrap);
    mountStatusMenu(body).catch((e) => log.error("menu-modal: mounting the StatusMenu failed:", e));
    log.info("menu modal opened");
  }

  // src/features/menu/toolbar.js
  var ACTION = "school-stats";
  var OVERLAY_SEL4 = "#gal-global-overlay";
  var MOBILE_MENU_SEL = "#gal-global-overlay #gal-mobile-menu";
  var CORNER_CLASS = "school-corner-btn";
  var CORNER_BTN_HTML = `<button class="gal-footer-btn ${CORNER_CLASS}" data-action="${ACTION}" title="School Menu"><i class="fa-solid fa-users"></i> <span class="gal-btn-text">MENU</span></button>`;
  var MOBILE_BTN_HTML = `<button class="gal-menu-btn" data-action="${ACTION}"><i class="fa-solid fa-users"></i> Menu</button>`;
  function injectInto2(containerSel, existsSel, html) {
    const c = DOC.querySelector(containerSel);
    if (!c || c.querySelector(existsSel)) return false;
    c.insertAdjacentHTML("beforeend", html);
    return true;
  }
  function injectAll() {
    const a = injectInto2(OVERLAY_SEL4, `.${CORNER_CLASS}`, CORNER_BTN_HTML);
    const b = injectInto2(MOBILE_MENU_SEL, `[data-action="${ACTION}"]`, MOBILE_BTN_HTML);
    if (a || b) log.info(`button injected (corner=${a}, mobile=${b})`);
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
    let scheduled3 = false;
    const observer2 = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      requestAnimationFrame(() => {
        scheduled3 = false;
        injectAll();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    injectAll();
    log.info("toolbar watcher active");
  }

  // src/shared/tag-balance-core.js
  var kMarkupPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][-.:0-9_a-zA-Z@\xB7\xC0-\xD6\xD8-\xF6\u00F8-\u03A1\u03A3-\u03D9\u03DB-\u03EF\u03F7-\u03FF\u0400-\u04FF\u0500-\u052F\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E00-\u1E9B\u1F00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2126\u212A-\u212B\u2132\u214E\u2160-\u2188\u2C60-\u2C7F\uA722-\uA787\uA78B-\uA78E\uA790-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA7FF\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64-\uAB65\uFB00-\uFB06\uFB13-\uFB17\uFF21-\uFF3A\uFF41-\uFF5A\x37F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*)((?:\s+[^>]*?(?:(?:'[^']*')|(?:"[^"]*"))?)*)\s*(\/?)>/gu;
  var DEFAULT_VOID_TAGS = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
  var DEFAULT_RAW_TEXT_TAGS = ["script", "noscript", "style", "pre"];
  function scanTagBalance(text, options = {}) {
    const src = String(text || "");
    const voidTags = new Set((options.voidTags || DEFAULT_VOID_TAGS).map((t) => t.toLowerCase()));
    const rawTextTags = new Set((options.rawTextTags || DEFAULT_RAW_TEXT_TAGS).map((t) => t.toLowerCase()));
    const events = [];
    const stack = [];
    const re = new RegExp(kMarkupPattern.source, kMarkupPattern.flags);
    let match;
    while (match = re.exec(src)) {
      const { 0: matchText, 1: leadingSlash, 2: tagName, 4: closingSlash } = match;
      const at = re.lastIndex - matchText.length;
      const end = re.lastIndex;
      if (matchText[1] === "!") continue;
      const lower = tagName.toLowerCase();
      if (!leadingSlash) {
        if (closingSlash || voidTags.has(lower)) {
          events.push({ tag: tagName, kind: closingSlash ? "self" : "void", at, end, status: "matched" });
          continue;
        }
        const ev = { tag: tagName, kind: "open", at, end, status: "unclosed-open" };
        events.push(ev);
        stack.push(ev);
        if (rawTextTags.has(lower)) {
          const closeMarkup = `</${tagName}>`;
          const closeIndex = src.toLowerCase().indexOf(closeMarkup.toLowerCase(), re.lastIndex);
          if (closeIndex !== -1) {
            const closeEnd = closeIndex + closeMarkup.length;
            ev.status = "matched";
            ev.pairAt = closeIndex;
            ev.pairEnd = closeEnd;
            events.push({ tag: tagName, kind: "close", at: closeIndex, end: closeEnd, status: "matched", pairAt: at, pairEnd: end });
            stack.pop();
            re.lastIndex = closeEnd;
          }
        }
        continue;
      }
      let found = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag.toLowerCase() === lower) {
          found = i;
          break;
        }
      }
      if (found === -1) {
        events.push({ tag: tagName, kind: "close", at, end, status: "orphan-close" });
        continue;
      }
      for (let i = stack.length - 1; i > found; i--) stack.pop();
      const open = stack.pop();
      open.status = "matched";
      open.pairAt = at;
      open.pairEnd = end;
      events.push({ tag: tagName, kind: "close", at, end, status: "matched", pairAt: open.at, pairEnd: open.end });
    }
    return { events, findings: events.filter((e) => e.status !== "matched") };
  }

  // src/features/beat-shaper/beat-shaper-core.js
  var SCENE_NAME_RE = /^(gc([0-9a-z]+)-[0-9a-z]+)_scene_(\d+)_([0-9a-z]+)$/;
  var LEGACY_SCENE_NAME_RE = /^msg\d+_scene_\d+(?:_[0-9a-z]+)?$/;
  function sceneUid(chatKey, random) {
    return `gc${chatKey}-${random}`;
  }
  function sceneName(uid, n, hash) {
    return `${uid}_scene_${n}_${hash}`;
  }
  function uidOfSceneName(name) {
    const m = SCENE_NAME_RE.exec(String(name || ""));
    return m ? m[1] : null;
  }
  function chatKeyOfSceneName(name) {
    const m = SCENE_NAME_RE.exec(String(name || ""));
    return m ? m[2] : null;
  }
  function hashOfSceneName(name) {
    const m = SCENE_NAME_RE.exec(String(name || ""));
    return m ? m[4] : null;
  }
  function shortHash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  function imgSrcOf(block) {
    const m = /<img\b[^>]*\bsrc="([^"]*)"/i.exec(block);
    return m ? m[1] : block;
  }
  var RE_MAINTEXT_OPEN = /<maintext>/i;
  var RE_MAINTEXT_CLOSE = /<\/maintext>/i;
  var RE_TAIL_MACHINERY = /<(?:combat_log|choices|UpdateVariable|POSTUpdateVariable|RES_Variable|RES_POST_Variable|StoryAnalysis|combat_calculation)\b/i;
  var RE_GAMETXT_OPEN = /<gametxt>/i;
  var RE_GAMETXT_CLOSE = /<\/gametxt>/i;
  var RE_BGIMG_TAG = /[ \t]*<bgimg>[\s\S]*?<\/bgimg>[ \t]*\r?\n?/gi;
  var RE_TRAIT_CHECK = /<classmate_trait_check>[\s\S]*?<\/classmate_trait_check>/gi;
  var RE_GC_HIDDEN = /<!--gc:hidden\n([\s\S]*?)\n-->/g;
  var RE_BACKGROUND_TAG = /[ \t]*<background\b[^>]*\/?>(?:\s*<\/background>)?[ \t]*\r?\n?/gi;
  var RE_PIC_TAG = /<pic\b/i;
  var RE_PIC_TAG_FULL = /[ \t]*<pic\b[^>]*>[ \t]*\r?\n?/gi;
  var RE_IMG_WRAP = /<span class="(?:custom-)?auto-img-wrap"[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi;
  var RE_HAS_IMG = /<img\b/i;
  var RE_P_OPEN = /<p(?:\s[^>]*)?>/gi;
  var RE_EXISTING_UID = /<background\s+scene="(gc[0-9a-z]+-[0-9a-z]+)_scene_\d+_[0-9a-z]+"/i;
  var RE_THINK_TAG = /^think(?:ing)?$/i;
  var PROTECTED_BLOCK_RE = new RegExp(
    [
      "<p(?:\\s[^>]*)?>[\\s\\S]*?<\\/p>",
      // existing beats — never nest/double-wrap
      RE_IMG_WRAP.source,
      // rendered images
      "<styled\\b[^>]*>[\\s\\S]*?<\\/styled>",
      "<弹窗一>[\\s\\S]*?<\\/弹窗一>",
      "<弹窗二>[\\s\\S]*?<\\/弹窗二>",
      "<option\\b[^>]*>[\\s\\S]*?<\\/option>",
      "<bgm>[\\s\\S]*?<\\/bgm>",
      "<!--gc:hidden\\n[\\s\\S]*?\\n-->"
      // our own comment-hidden engine blocks — never wrap the hider
    ].join("|"),
    "gi"
  );
  var RE_TAG_ONLY_PARAGRAPH = /^(?:\s|<[^>]+>)*$/;
  var RE_COMBAT_LOG = /<combat_log>([\s\S]*?)<\/combat_log>/i;
  var RE_ROLL_MARKER = /<roll\s*\/?\s*>/gi;
  var RE_NO_ROLL = /no calculation needed|no d20 roll/i;
  var RE_OUTCOME = /(CritSuccess|CritFail|Success|Failure)/g;
  var ROLL_PREFIX = "🎲 ";
  var UNPLACED_PREFIX = `<!--gc:unplaced-->${ROLL_PREFIX}`;
  var OUTCOME_MARK = {
    CritSuccess: "✨",
    Success: "✅",
    Failure: "⚠️",
    CritFail: "💀"
  };
  function escapeHtml2(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function combatLogLines(text) {
    const block = RE_COMBAT_LOG.exec(String(text || ""));
    if (!block) return [];
    return block[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  }
  function parseCombatLog(text) {
    return combatLogLines(text).filter((l) => !RE_TAG_ONLY_PARAGRAPH.test(l) && !RE_NO_ROLL.test(l)).map((line) => {
      RE_OUTCOME.lastIndex = 0;
      let m;
      let outcome = null;
      while ((m = RE_OUTCOME.exec(line)) !== null) outcome = m[1];
      return { line, outcome };
    });
  }
  function countCombatLogStrayTags(text) {
    return combatLogLines(text).filter((l) => RE_TAG_ONLY_PARAGRAPH.test(l)).length;
  }
  function renderRollText(roll, prefix = ROLL_PREFIX) {
    const mark = OUTCOME_MARK[roll.outcome] || "•";
    return `${prefix}${mark} ${escapeHtml2(roll.line)}`;
  }
  function stripRollText(inner, rolls) {
    let out = String(inner);
    for (const roll of rolls) {
      const text = renderRollText(roll, UNPLACED_PREFIX);
      out = out.split(`<p>${text}</p>`).join("").split(text).join("");
    }
    for (const roll of rolls) out = out.split(renderRollText(roll, ROLL_PREFIX)).join("<roll/>");
    return rolls.length ? out.replace(/\n{3,}/g, "\n\n") : out;
  }
  function placeRolls(inner, rolls) {
    const list = Array.isArray(rolls) ? rolls : [];
    let k = 0;
    const text = String(inner).replace(RE_ROLL_MARKER, () => {
      const roll = list[k++];
      if (!roll) return "";
      return renderRollText(roll, ROLL_PREFIX);
    });
    return { text, placed: Math.min(k, list.length), unplaced: list.slice(k) };
  }
  function renderUnplacedRolls(rolls) {
    if (!rolls || !rolls.length) return "";
    return rolls.map((r) => renderRollText(r, UNPLACED_PREFIX)).join("\n\n");
  }
  function repairTruncatedEnvelope(raw) {
    const text = String(raw == null ? "" : raw);
    const openMatch = text.match(RE_MAINTEXT_OPEN) || text.match(RE_GAMETXT_OPEN);
    if (!openMatch) return null;
    const isGametxt = !RE_MAINTEXT_OPEN.test(text);
    const closeTag = isGametxt ? "</gametxt>" : "</maintext>";
    const innerStart = openMatch.index + openMatch[0].length;
    const RE_P_CLOSE = /<\/p>/gi;
    RE_P_CLOSE.lastIndex = innerStart;
    let lastEnd = -1;
    let m;
    while ((m = RE_P_CLOSE.exec(text)) !== null) lastEnd = m.index + m[0].length;
    if (lastEnd < 0) return null;
    const droppedChars = text.length - lastEnd;
    return {
      text: `${text.slice(0, lastEnd)}
${closeTag}${text.slice(lastEnd)}`,
      closeTag,
      droppedChars
      // how much fell OUTSIDE the envelope (not deleted)
    };
  }
  function synthesizeEnvelope(raw) {
    const text = String(raw == null ? "" : raw);
    const openM = text.match(RE_MAINTEXT_OPEN);
    const closeM = text.match(RE_MAINTEXT_CLOSE);
    if (openM && closeM) return null;
    const machFrom = openM ? openM.index + openM[0].length : 0;
    const machRel = RE_TAIL_MACHINERY.exec(text.slice(machFrom));
    if (!machRel) return null;
    const machAt = machFrom + machRel.index;
    let proseAt = 0;
    if (!openM) {
      const thinkEvents = scanTagBalance(text.slice(0, machAt)).events.filter((e) => RE_THINK_TAG.test(e.tag));
      const closes = thinkEvents.filter((e) => e.kind === "close");
      const unclosedOpen = thinkEvents.find((e) => e.kind === "open" && e.status === "unclosed-open");
      if (closes.length) proseAt = closes[closes.length - 1].end;
      else if (unclosedOpen) proseAt = unclosedOpen.end;
      if (closeM) proseAt = Math.min(proseAt, closeM.index);
    }
    const inserted = [];
    let out = text;
    if (!closeM) {
      out = `${out.slice(0, machAt)}
</maintext>
${out.slice(machAt)}`;
      inserted.push("close");
    }
    if (!openM) {
      out = `${out.slice(0, proseAt)}
<maintext>
${out.slice(proseAt)}`;
      inserted.push("open");
    }
    return { text: out, inserted };
  }
  function shapeMessage(raw, mintUid) {
    const blankStats = () => ({
      wrapped: 0,
      scenes: 0,
      strippedScenes: 0,
      renamed: false,
      strippedBgimg: 0,
      hidden: 0,
      strippedThink: 0,
      strippedThinkText: "",
      uid: null,
      uidMinted: false,
      picsPending: false,
      rolls: 0,
      rollsPlaced: 0,
      rollsUnplaced: 0,
      logStrayTags: 0,
      imagesRehomed: 0
    });
    const stats = blankStats();
    const unchanged = (deferred = null) => ({
      text: raw,
      // ALWAYS the caller's original — a rename ahead of a defer is discarded with it
      changed: false,
      deferred,
      stats: blankStats()
    });
    if (typeof raw !== "string" || raw.length === 0) return unchanged();
    let text0 = raw;
    if (!RE_MAINTEXT_OPEN.test(raw)) {
      if (!RE_GAMETXT_OPEN.test(raw)) return unchanged(RE_TAIL_MACHINERY.test(raw) ? "no-envelope" : null);
      if (!RE_GAMETXT_CLOSE.test(raw)) return unchanged("gametxt-unclosed");
      text0 = raw.replace(RE_GAMETXT_OPEN, "<maintext>").replace(RE_GAMETXT_CLOSE, "</maintext>");
      stats.renamed = true;
    }
    const openMatch = text0.match(RE_MAINTEXT_OPEN);
    const closeMatch = text0.match(RE_MAINTEXT_CLOSE);
    if (!closeMatch) return unchanged("maintext-unclosed");
    const innerStart = openMatch.index + openMatch[0].length;
    const innerEnd = closeMatch.index;
    if (innerEnd < innerStart) return unchanged();
    let head = text0.slice(0, innerStart);
    let tail = text0.slice(innerEnd);
    let inner = text0.slice(innerStart, innerEnd);
    {
      const rescued = [];
      const lift = (re) => {
        tail = tail.replace(re, (block) => {
          rescued.push(block.trim());
          return "";
        });
      };
      lift(RE_IMG_WRAP);
      lift(RE_PIC_TAG_FULL);
      if (rescued.length) {
        inner = `${inner.replace(/\s+$/, "")}

${rescued.join("\n\n")}
`;
        stats.imagesRehomed = rescued.length;
      }
    }
    const thinkEvents = scanTagBalance(head).events.filter((e) => RE_THINK_TAG.test(e.tag));
    const thinkCloses = thinkEvents.filter((e) => e.kind === "close");
    const thinkOpen = thinkEvents.find((e) => e.kind === "open" && e.status === "unclosed-open");
    if (thinkCloses.length) {
      const cutEnd = thinkCloses[thinkCloses.length - 1].end;
      stats.strippedThinkText = head.slice(0, cutEnd).replace(/<\/?think(?:ing)?>/gi, "").trim();
      head = head.slice(cutEnd).replace(/^\s+/, "");
      stats.strippedThink = 1;
    } else if (thinkOpen) {
      const envM = head.match(RE_MAINTEXT_OPEN);
      const end = envM ? envM.index : head.length;
      if (end > thinkOpen.at) {
        stats.strippedThinkText = head.slice(thinkOpen.end, end).trim();
        head = head.slice(0, thinkOpen.at) + head.slice(end);
        stats.strippedThink = 1;
      }
    }
    const picsPending = RE_PIC_TAG.test(inner);
    stats.picsPending = picsPending;
    const priorUid = RE_EXISTING_UID.exec(inner);
    const rolls = parseCombatLog(tail);
    inner = stripRollText(inner, rolls);
    inner = inner.replace(RE_BACKGROUND_TAG, () => {
      stats.strippedScenes++;
      return "";
    });
    inner = inner.replace(RE_BGIMG_TAG, () => {
      stats.strippedBgimg++;
      return "";
    });
    inner = inner.replace(RE_GC_HIDDEN, (_, body) => body);
    inner = inner.replace(RE_TRAIT_CHECK, (m2) => {
      if (m2.includes("--")) return m2;
      stats.hidden++;
      return `<!--gc:hidden
${m2}
-->`;
    });
    const placement = placeRolls(inner, rolls);
    inner = placement.text;
    const unplacedText = renderUnplacedRolls(placement.unplaced);
    if (unplacedText) inner = `${unplacedText}

${inner.replace(/^\n+/, "")}`;
    stats.rolls = rolls.length;
    stats.logStrayTags = countCombatLogStrayTags(tail);
    stats.rollsPlaced = placement.placed;
    stats.rollsUnplaced = placement.unplaced.length;
    inner = wrapBareProse(inner, stats);
    const imgs = [];
    RE_IMG_WRAP.lastIndex = 0;
    let m;
    while ((m = RE_IMG_WRAP.exec(inner)) !== null) {
      if (!RE_HAS_IMG.test(m[0])) continue;
      imgs.push({ index: m.index, src: imgSrcOf(m[0]) });
    }
    const beatStarts = [];
    RE_P_OPEN.lastIndex = 0;
    let pm;
    while ((pm = RE_P_OPEN.exec(inner)) !== null) beatStarts.push(pm.index);
    const uid = !picsPending && imgs.length >= 1 ? priorUid ? priorUid[1] : mintUid() : null;
    stats.uid = uid;
    stats.uidMinted = Boolean(uid) && !priorUid;
    if (picsPending) {
    } else if (imgs.length >= 1 && beatStarts.length >= 1) {
      const owner = beatStarts.map((b) => {
        const after = imgs.findIndex((im) => im.index > b);
        return after === -1 ? imgs.length - 1 : after;
      });
      if (new Set(owner).size < imgs.length && beatStarts.length >= imgs.length) {
        for (let n = 0; n < imgs.length; n++) owner[beatStarts.length - imgs.length + n] = n;
      }
      for (let n = imgs.length - 1; n >= 1; n--) {
        const firstBeat = owner.indexOf(n);
        if (firstBeat === -1) continue;
        const nm = sceneName(uid, n + 1, shortHash(imgs[n].src));
        const at = beatStarts[firstBeat];
        inner = inner.slice(0, at) + `<background scene="${nm}" />
` + inner.slice(at);
        stats.scenes++;
      }
      const nm1 = sceneName(uid, 1, shortHash(imgs[0].src));
      inner = `
<background scene="${nm1}" />
` + inner.replace(/^\n+/, "");
      stats.scenes++;
    } else if (imgs.length >= 1) {
      const nm1 = sceneName(uid, 1, shortHash(imgs[0].src));
      inner = `
<background scene="${nm1}" />
` + inner.replace(/^\n+/, "");
      stats.scenes++;
    }
    const text = head + inner + tail;
    return { text, changed: text !== raw, deferred: null, stats };
  }
  function wrapBareProse(inner, stats) {
    const out = [];
    let cursor = 0;
    PROTECTED_BLOCK_RE.lastIndex = 0;
    let m;
    while ((m = PROTECTED_BLOCK_RE.exec(inner)) !== null) {
      out.push(wrapFreeRun(inner.slice(cursor, m.index), stats));
      out.push(m[0]);
      cursor = m.index + m[0].length;
    }
    out.push(wrapFreeRun(inner.slice(cursor), stats));
    return out.join("");
  }
  function wrapFreeRun(run, stats) {
    if (!run || !run.trim()) return run;
    const parts = run.split(/(\n[ \t]*\n+)/);
    for (let i = 0; i < parts.length; i += 2) {
      const para = parts[i];
      if (!para.trim()) continue;
      if (RE_TAG_ONLY_PARAGRAPH.test(para)) continue;
      const lead = para.match(/^\s*/)[0];
      const trail = para.match(/\s*$/)[0];
      const body = para.slice(lead.length, para.length - trail.length);
      parts[i] = `${lead}<p>${body}</p>${trail}`;
      stats.wrapped++;
    }
    return parts.join("");
  }

  // src/features/beat-shaper/beat-shaper.js
  var inFlight = /* @__PURE__ */ new Set();
  var deferralLogged = /* @__PURE__ */ new Set();
  var incompleteToasted = /* @__PURE__ */ new Set();
  var RE_HAS_UPDATEVAR = /<UpdateVariable>/i;
  var RE_ENVELOPE_CLOSE = /<\/maintext>|<\/gametxt>/i;
  var RE_ENVELOPE_OPEN = /<maintext>|<gametxt>/i;
  function incompleteReplyReason(raw, id) {
    if (id === 0) return null;
    if (!RE_ENVELOPE_OPEN.test(raw)) return null;
    if (!RE_ENVELOPE_CLOSE.test(raw)) return "envelope";
    if (!RE_HAS_UPDATEVAR.test(raw)) return "no-updatevar";
    return null;
  }
  function toastIncompleteReply(id, reason) {
    const key = `${id}:${reason}`;
    if (incompleteToasted.has(key)) return;
    incompleteToasted.add(key);
    const why = reason === "envelope" ? "the reply was CUT OFF mid-output" : "the reply carries no <UpdateVariable> block";
    warnToast(`Incomplete reply (message ${id}): ${why}, so NO game state was applied this turn — stats, time and relationships did not move. Regenerate this message.`);
    log.warn(`beat-shaper msg=${id}: incomplete reply (${reason}) — no state applied this turn; player advised to regenerate.`);
  }
  function currentChatId() {
    try {
      const getter = topWindow.getCurrentChatId;
      if (typeof getter === "function") {
        const id = getter.call(topWindow);
        if (id) return String(id);
      }
    } catch (e) {
      log.warn("beat-shaper: getCurrentChatId() threw — falling back to the context field:", e);
    }
    try {
      const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === "function" ? topWindow.SillyTavern.getContext() : null;
      if (ctx && ctx.chatId) return String(ctx.chatId);
    } catch (e) {
      log.warn("beat-shaper: SillyTavern.getContext() threw — chat id unresolved:", e);
    }
    return null;
  }
  function currentChatKey() {
    const id = currentChatId();
    return id ? shortHash(id) : null;
  }
  var UNKNOWN_CHAT_KEY = "nochat";
  var UID_RANDOM_LEN = 6;
  function randomToken() {
    let out = "";
    while (out.length < UID_RANDOM_LEN) out += Math.random().toString(36).slice(2);
    return out.slice(0, UID_RANDOM_LEN);
  }
  function mintUidForCurrentChat() {
    return sceneUid(currentChatKey() || UNKNOWN_CHAT_KEY, randomToken());
  }
  function rawMessage2(id) {
    try {
      const arr = window.getChatMessages(id);
      const msg = Array.isArray(arr) ? arr[0] : arr;
      if (!msg) return null;
      if (msg.role && msg.role !== "assistant") return null;
      return typeof msg.message === "string" ? msg.message : typeof msg.mes === "string" ? msg.mes : null;
    } catch (e) {
      log.warn(`beat-shaper: getChatMessages(${id}) failed:`, e);
      return null;
    }
  }
  function stashStrippedReasoning(id, cot) {
    if (!cot) return;
    try {
      const context = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext();
      const message = context && Array.isArray(context.chat) ? context.chat[id] : null;
      if (!message) return;
      if (!message.extra || typeof message.extra !== "object") message.extra = {};
      const already = String(message.extra.reasoning || "");
      if (already.includes(cot)) return;
      message.extra.reasoning = already ? `${already}

${cot}` : cot;
      if (!message.extra.reasoning_type) message.extra.reasoning_type = "parsed";
      const swipe = message.swipe_id ?? 0;
      if (Array.isArray(message.swipe_info) && message.swipe_info[swipe] && message.swipe_info[swipe] !== message.extra) {
        message.swipe_info[swipe].reasoning = message.extra.reasoning;
        if (!message.swipe_info[swipe].reasoning_type) message.swipe_info[swipe].reasoning_type = "parsed";
      }
      if (typeof context.updateReasoningUI === "function") context.updateReasoningUI(id);
    } catch (e) {
      log.warn(`beat-shaper msg=${id}: could not stash the stripped reasoning (it is still removed from the reply, just not kept):`, e);
    }
  }
  async function onMessageEvent(messageId) {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id < 0) return;
    if (inFlight.has(id)) return;
    if (!topWindow.galgame) return;
    const raw = rawMessage2(id);
    if (raw === null) return;
    if (!isTurnBusy()) {
      const reason = incompleteReplyReason(raw, id);
      if (reason) toastIncompleteReply(id, reason);
      else incompleteToasted.forEach((k) => {
        if (k.startsWith(`${id}:`)) incompleteToasted.delete(k);
      });
    }
    let { text, changed, deferred, stats } = shapeMessage(raw, mintUidForCurrentChat);
    if ((deferred === "maintext-unclosed" || deferred === "gametxt-unclosed" || deferred === "no-envelope") && !isTurnBusy()) {
      const repair = deferred === "no-envelope" ? null : repairTruncatedEnvelope(raw);
      const synth = repair ? null : synthesizeEnvelope(raw);
      if (!repair && synth) {
        log.warn(
          `beat-shaper msg=${id}: reply is missing its envelope (${synth.inserted.join(" + ")}) and the turn is finished. Derived it from the first block-machinery tag and inserted it. A MISSING OPEN tag is the one galgame cannot survive — its extractor falls through to the whole message and reads JSON as a speaker name — so this costs at most a beat of prose instead of the interface.`
        );
        ({ text, changed, deferred, stats } = shapeMessage(synth.text, mintUidForCurrentChat));
        changed = true;
      } else if (repair) {
        log.warn(
          `beat-shaper msg=${id}: reply is TRUNCATED — no ${repair.closeTag} and the turn is finished, so it is never coming. Inserted ${repair.closeTag} after the last complete </p>; ${repair.droppedChars} char(s) of partial output now sit OUTSIDE the envelope (kept, not deleted). The turn likely emitted no <UpdateVariable>, so RES resolved nothing — check the narrator's max response tokens.`
        );
        ({ text, changed, deferred, stats } = shapeMessage(repair.text, mintUidForCurrentChat));
        changed = true;
      } else {
        log.warn(`beat-shaper msg=${id}: reply has no usable envelope — no complete </p> to close after and no block-machinery tag to anchor on. Leaving it raw (galgame may mis-parse it).`);
      }
    }
    if (deferred) {
      const key = `${id}:${deferred}`;
      if (!deferralLogged.has(key)) {
        deferralLogged.add(key);
        log.image(`beat-shaper msg=${id}: deferred (${deferred}) — will retry on next message event`);
      }
      return;
    }
    deferralLogged.forEach((k) => {
      if (k.startsWith(`${id}:`)) deferralLogged.delete(k);
    });
    if (!changed) return;
    inFlight.add(id);
    try {
      stashStrippedReasoning(id, stats.strippedThinkText);
      await window.setChatMessages([{ message_id: id, message: text }], { refresh: "affected" });
      log.image(
        `beat-shaper msg=${id}:${stats.renamed ? " gametxt→maintext" : ""} wrapped=${stats.wrapped}p scenes=${stats.scenes}${stats.scenes ? " (hoisted #1)" : ""}${stats.picsPending ? " [scene binding HELD BACK — raw <pic> still un-rendered]" : ""} strippedScenes=${stats.strippedScenes}${stats.uid ? ` uid=${stats.uid}(${stats.uidMinted ? "minted" : "kept"})` : ""}${stats.strippedBgimg ? ` strippedBgimg=${stats.strippedBgimg}` : ""}${stats.hidden ? ` hiddenBlocks=${stats.hidden}` : ""}${stats.strippedThink ? ` strippedThink=1 (${stats.strippedThinkText.length}c leaked CoT moved to extra.reasoning)` : ""} rolls=${stats.rolls}(placed=${stats.rollsPlaced} unplaced=${stats.rollsUnplaced})${stats.imagesRehomed ? ` imagesRehomed=${stats.imagesRehomed} (were OUTSIDE <maintext>)` : ""}`
      );
      if (stats.imagesRehomed) {
        log.warn(
          `beat-shaper msg=${id}: ${stats.imagesRehomed} <pic>/image block(s) were emitted OUTSIDE <maintext> (in the tail, past the engine blocks) and were moved back in so they bind to a beat at all. Un-rescued they would produce NO backdrop. Fix the narrator prompt: each <pic> belongs under the sentence it depicts, inside the envelope — never bunched or trailing.`
        );
      }
      if (stats.rollsUnplaced) {
        log.warn(
          `beat-shaper msg=${id}: ${stats.rollsUnplaced} of ${stats.rolls} roll(s) had no <roll/> marker in <gametxt> — shown as a beat at the TOP instead of at the moment they resolved. The narrator should emit one <roll/> per <combat_log> line, in the same order.`
        );
      }
      if (stats.logStrayTags) {
        log.warn(
          `beat-shaper msg=${id}: <combat_log> carried ${stats.logStrayTags} tag-only line(s) (e.g. a <roll/> written into the log instead of the prose) — ignored. The log block holds roll lines only; the narrator prompt must keep the marker in <gametxt>.`
        );
      }
    } catch (e) {
      log.warn(`beat-shaper: setChatMessages(${id}) failed — message left unshaped:`, e);
    } finally {
      inFlight.delete(id);
    }
  }
  function startBeatShaper() {
    if (typeof window.getChatMessages !== "function" || typeof window.setChatMessages !== "function" || typeof window.eventOn !== "function") {
      log.warn("beat-shaper: TH globals (getChatMessages/setChatMessages/eventOn) absent — shaper disabled");
      return;
    }
    const te = window.tavern_events || {};
    let bound = 0;
    for (const ev of [te.MESSAGE_RECEIVED, te.MESSAGE_UPDATED]) {
      if (!ev) continue;
      try {
        window.eventOn(ev, onMessageEvent);
        bound++;
      } catch (e) {
        log.warn(`beat-shaper: eventOn(${ev}) failed:`, e);
      }
    }
    for (const ev of [te.GENERATION_ENDED, te.GENERATION_STOPPED]) {
      if (!ev) continue;
      try {
        window.eventOn(ev, () => {
          const chat = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === "function" && topWindow.SillyTavern.getContext().chat;
          if (Array.isArray(chat) && chat.length) void onMessageEvent(chat.length - 1);
        });
        bound++;
      } catch (e) {
        log.warn(`beat-shaper: eventOn(${ev}) failed:`, e);
      }
    }
    if (bound === 0) {
      log.warn("beat-shaper: no tavern message events available — shaper disabled");
      return;
    }
    log.image(`beat-shaper active (${bound} event(s) bound)`);
  }

  // src/features/image/image-seam-core.js
  function decodeEntities(s) {
    return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");
  }
  var RE_SCENE_OR_IMG = /<background\s+scene="([^"]+)"|<img\b[^>]*\bsrc="([^"]+)"/gi;
  function pairImagesToScenes(rawMes) {
    const scenesByHash = /* @__PURE__ */ new Map();
    const images = [];
    let foreignScenes = 0;
    let sceneCount = 0;
    RE_SCENE_OR_IMG.lastIndex = 0;
    let m;
    while ((m = RE_SCENE_OR_IMG.exec(String(rawMes || ""))) !== null) {
      if (m[1] != null) {
        const scene = m[1].trim();
        if (!SCENE_NAME_RE.test(scene)) {
          foreignScenes++;
          continue;
        }
        sceneCount++;
        const hash = hashOfSceneName(scene);
        if (!scenesByHash.has(hash)) scenesByHash.set(hash, []);
        scenesByHash.get(hash).push(scene);
      } else if (m[2] != null) {
        const rawSrc = m[2].trim();
        images.push({ hash: shortHash(rawSrc), url: decodeEntities(rawSrc) });
      }
    }
    const pairs = [];
    let unmatchedImages = 0;
    for (const img of images) {
      const scenes = scenesByHash.get(img.hash);
      if (!scenes) {
        unmatchedImages++;
        continue;
      }
      for (const scene of scenes) pairs.push({ scene, url: img.url });
    }
    return { pairs, unmatchedImages, foreignScenes, sceneCount, imageCount: images.length };
  }
  var RE_ENVELOPE_CLOSED = /<\/(?:maintext|gametxt)>/i;
  var RE_PIC_PENDING = /<pic\b/i;
  function unboundImageReport(rawMes, scan) {
    const { pairs = [], unmatchedImages = 0, foreignScenes = 0, sceneCount = 0, imageCount = 0 } = scan || {};
    if (pairs.length) {
      if (!unmatchedImages && !foreignScenes) return null;
      return `${unmatchedImages} image(s) matched no scene hash, ${foreignScenes} non-uid scene tag(s) skipped`;
    }
    if (!imageCount) return null;
    const text = String(rawMes || "");
    if (!RE_ENVELOPE_CLOSED.test(text)) return null;
    if (RE_PIC_PENDING.test(text)) return null;
    return `EVERY image is unbound — ${imageCount} rendered image(s), ${sceneCount} scene tag(s)` + (foreignScenes ? `, ${foreignScenes} foreign` : "") + ". galgame will show NO backdrop for this message. " + (sceneCount === 0 ? "No scene tags exist at all, so the beat-shaper saw no image INSIDE <maintext> — the most likely cause is a <pic> tag emitted outside the envelope (in the tail, after the engine blocks)." : "Scene tags exist but none carries an image hash — the shaper and the rendered <img> src have drifted.");
  }
  function missingBackdropPairs(rawMessages, libraryKeys) {
    const present = new Set(libraryKeys || []);
    const missing2 = [];
    for (const raw of rawMessages || []) {
      for (const pair of pairImagesToScenes(raw).pairs) {
        if (present.has(pair.scene)) continue;
        present.add(pair.scene);
        missing2.push(pair);
      }
    }
    return missing2;
  }
  function staleSiblingKeys(allKeys, uid, keep) {
    if (!uid || !keep || keep.size === 0) return [];
    const prefix = `${uid}_scene_`;
    return (allKeys || []).filter(
      (k) => typeof k === "string" && k.startsWith(prefix) && SCENE_NAME_RE.test(k) && !keep.has(k)
    );
  }
  function deadBackgroundKeys(allKeys, liveSceneNames2, chatKey) {
    if (!chatKey || !liveSceneNames2 || liveSceneNames2.size === 0) return [];
    return (allKeys || []).filter((k) => {
      if (typeof k !== "string" || liveSceneNames2.has(k)) return false;
      if (LEGACY_SCENE_NAME_RE.test(k)) return true;
      return chatKeyOfSceneName(k) === chatKey;
    });
  }
  function decideForceReconcile({ stored, live } = {}) {
    const on = Boolean(live);
    const value = Array.isArray(stored) ? stored[0] : stored;
    if (value === void 0 || value === null) return { write: false, to: on, reason: "latch absent on this card" };
    if (typeof value !== "boolean") return { write: true, to: on, reason: `stored value is not a boolean (${typeof value})` };
    if (value === on) return { write: false, to: on, reason: "already in sync" };
    return { write: true, to: on, reason: `stored ${value} but galgame is ${on ? "OPEN" : "CLOSED"}` };
  }
  function latchFloors(lastId, hasStatData, lookback = 30) {
    const out = [];
    if (!Number.isFinite(lastId) || lastId < 0) return out;
    for (let id = lastId; id >= 0 && id > lastId - lookback && out.length < 2; id--) {
      if (hasStatData(id) === true) out.push(id);
    }
    return out;
  }

  // src/features/image/background-store.js
  var DB_NAME = "GalgameUIPluginDB";
  var STORE = "backgrounds";
  function openBackgroundDb() {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = topWindow.indexedDB.open(DB_NAME);
      } catch (e) {
        reject(e);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => log.warn("background-store: IndexedDB open blocked (another tab upgrading?)");
    });
  }
  async function withLibrary(why, body) {
    let db;
    try {
      db = await openBackgroundDb();
    } catch (e) {
      log.warn(`background-store: ${why} — could not open ${DB_NAME}:`, e);
      return null;
    }
    try {
      if (!db.objectStoreNames.contains(STORE)) {
        log.error(`background-store: '${STORE}' store missing in ${DB_NAME} — galgame schema drift; ${why} aborted`);
        return null;
      }
      return await body(db);
    } catch (e) {
      log.warn(`background-store: ${why} failed:`, e);
      return null;
    } finally {
      try {
        db.close();
      } catch (e) {
      }
    }
  }
  function readAllBackgroundKeys(why = "key read") {
    return withLibrary(`${why} · key read`, (db) => new Promise((resolve, reject) => {
      const r = db.transaction([STORE], "readonly").objectStore(STORE).getAllKeys();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }
  function readBackgroundStamps(why = "timestamp read") {
    return withLibrary(`${why} · timestamp read`, (db) => new Promise((resolve, reject) => {
      const r = db.transaction([STORE], "readonly").objectStore(STORE).getAll();
      r.onsuccess = () => {
        const stamps = /* @__PURE__ */ new Map();
        for (const rec of r.result || []) {
          if (!rec || typeof rec.id !== "string") continue;
          const at = Date.parse(rec.lastModified);
          if (Number.isFinite(at)) stamps.set(rec.id, at);
        }
        resolve(stamps);
      };
      r.onerror = () => reject(r.error);
    }));
  }
  function deleteBackgroundKeys(keys, why = "delete") {
    const list = (Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && k);
    if (!list.length) return Promise.resolve([]);
    return withLibrary(`${why} · delete of ${list.length} background(s)`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], "readwrite");
      const store = tx.objectStore(STORE);
      tx.oncomplete = () => resolve(list);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
      for (const k of list) store.delete(k);
    }));
  }

  // src/features/image/image-seam.js
  var CURRENT_PACK_LS = "galgame-ui-plugin_current_pack";
  var DEFAULT_PACK_ID = "pack_default";
  var OVERLAY_ID = "gal-global-overlay";
  var FORCE_PATH = "Preferences.ForceImageType";
  var FLOOR_LOOKBACK2 = 30;
  function currentPackId() {
    try {
      return topWindow.localStorage.getItem(CURRENT_PACK_LS) || DEFAULT_PACK_ID;
    } catch (e) {
      log.warn("image-seam: could not read current pack id (default):", e);
      return DEFAULT_PACK_ID;
    }
  }
  async function writeBackgrounds(pairs) {
    if (!pairs.length) return 0;
    let db;
    try {
      db = await openBackgroundDb();
    } catch (e) {
      log.error("image-seam: could not open galgame DB — write skipped:", e);
      return 0;
    }
    try {
      if (!db.objectStoreNames.contains(STORE)) {
        log.error(`image-seam: '${STORE}' store missing — galgame schema drift; aborting write`);
        return 0;
      }
      const packId = currentPackId();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE], "readwrite");
        const store = tx.objectStore(STORE);
        for (const { scene, url } of pairs) {
          store.put({ id: scene, sceneName: scene, imageBlob: null, imageUrl: url, packId, lastModified: (/* @__PURE__ */ new Date()).toISOString() });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
      });
      return pairs.length;
    } catch (e) {
      log.warn(`image-seam: writing ${pairs.length} background(s) failed (${pairs.map((p) => p.scene).join(", ")}):`, e);
      return 0;
    } finally {
      try {
        db.close();
      } catch (e) {
      }
    }
  }
  function rawMessage3(id) {
    try {
      const arr = window.getChatMessages(id);
      const msg = Array.isArray(arr) ? arr[0] : arr;
      if (!msg) return null;
      if (msg.role && msg.role !== "assistant") return null;
      return typeof msg.message === "string" ? msg.message : typeof msg.mes === "string" ? msg.mes : null;
    } catch (e) {
      log.warn(`image-seam: getChatMessages(${id}) failed:`, e);
      return null;
    }
  }
  async function pruneSceneSiblings(uid, keep) {
    const why = `image-seam sibling prune (uid ${uid})`;
    const keys = await readAllBackgroundKeys(why);
    if (!keys) return 0;
    const stale = staleSiblingKeys(keys, uid, keep);
    if (!stale.length) return 0;
    const deleted = await deleteBackgroundKeys(stale, why);
    return deleted ? deleted.length : 0;
  }
  async function processMessage(id) {
    const raw = rawMessage3(id);
    if (!raw) return;
    const scan = pairImagesToScenes(raw);
    const { pairs } = scan;
    const report = unboundImageReport(raw, scan);
    if (report) log.image(`image-seam: message ${id} — ${report}`);
    if (!pairs.length) return;
    const ok = await writeBackgrounds(pairs);
    const keepByUid = /* @__PURE__ */ new Map();
    for (const p of pairs) {
      const uid = uidOfSceneName(p.scene);
      if (!uid) continue;
      if (!keepByUid.has(uid)) keepByUid.set(uid, /* @__PURE__ */ new Set());
      keepByUid.get(uid).add(p.scene);
    }
    let removed = 0;
    for (const [uid, keep] of keepByUid) {
      removed += await pruneSceneSiblings(uid, keep);
    }
    if (ok || removed) {
      log.image(
        `image-seam: wrote ${ok}/${pairs.length} background(s) from message ${id}` + (removed ? `, pruned ${removed} superseded` : "")
      );
    }
  }
  function chatSceneTexts() {
    let chat = null;
    try {
      const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === "function" ? topWindow.SillyTavern.getContext() : null;
      chat = ctx ? ctx.chat : null;
    } catch (e) {
      log.warn("image-seam: backfill could not read the chat array — skipped:", e);
      return null;
    }
    if (!Array.isArray(chat)) return null;
    return chat.filter((m) => m && !m.is_user && typeof m.mes === "string" && m.mes.includes("<background")).map((m) => m.mes);
  }
  async function backfillChat(why) {
    const texts = chatSceneTexts();
    if (!texts || !texts.length) return;
    const keys = await readAllBackgroundKeys(`image-seam backfill (${why})`);
    if (!keys) return;
    const missing2 = missingBackdropPairs(texts, keys);
    if (!missing2.length) {
      log.image(`image-seam: backfill (${why}) — the library already holds every backdrop this chat binds`);
      return;
    }
    const wrote = await writeBackgrounds(missing2);
    log.image(`image-seam: backfill (${why}) — wrote ${wrote}/${missing2.length} backdrop(s) this browser's library was missing`);
  }
  var RE_ANY_SCENE_NAME = /<background\s+scene="([^"]+)"/gi;
  function liveSceneNames() {
    let chat = null;
    try {
      const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === "function" ? topWindow.SillyTavern.getContext() : null;
      chat = ctx ? ctx.chat : null;
    } catch (e) {
      log.warn("image-seam: sweep could not read the chat array — skipped:", e);
      return null;
    }
    if (!Array.isArray(chat) || chat.length === 0) return null;
    const names = /* @__PURE__ */ new Set();
    for (const msg of chat) {
      if (!msg) continue;
      const texts = [typeof msg.mes === "string" ? msg.mes : ""];
      if (Array.isArray(msg.swipes)) {
        for (const s of msg.swipes) if (typeof s === "string") texts.push(s);
      }
      for (const t of texts) {
        RE_ANY_SCENE_NAME.lastIndex = 0;
        let m;
        while ((m = RE_ANY_SCENE_NAME.exec(t)) !== null) names.add(m[1].trim());
      }
    }
    return names.size ? names : null;
  }
  function chatIsOpen() {
    try {
      const ctx = topWindow.SillyTavern && typeof topWindow.SillyTavern.getContext === "function" ? topWindow.SillyTavern.getContext() : null;
      if (!ctx) return false;
      return Array.isArray(ctx.chat) && ctx.chat.length > 0 && (ctx.characterId != null || ctx.groupId != null);
    } catch (e) {
      log.warn("image-seam: context unreadable while grading a missing chat key:", e);
      return true;
    }
  }
  async function sweepOrphanBackgrounds() {
    const chatKey = currentChatKey();
    if (!chatKey) {
      if (!chatIsOpen()) {
        log.image("image-seam: orphan sweep skipped — no chat open yet (startup); the CHAT_CHANGED sweep will run it.");
        return 0;
      }
      log.warn("image-seam: orphan sweep skipped — a chat IS open but SillyTavern's chat id will not resolve, so the delete cannot be scoped to this chat and might hit another chat's backdrops. Orphaned backdrops will accumulate until this resolves.");
      return 0;
    }
    const live = liveSceneNames();
    if (!live) return 0;
    const keys = await readAllBackgroundKeys("image-seam orphan sweep");
    if (!keys) return 0;
    const dead = deadBackgroundKeys(keys, live, chatKey);
    if (!dead.length) return 0;
    const deleted = await deleteBackgroundKeys(dead, "image-seam orphan sweep");
    return deleted ? deleted.length : 0;
  }
  var SWEEP_DEBOUNCE_MS = 2e3;
  var sweepTimer = null;
  function scheduleSweep(why) {
    if (sweepTimer) clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      sweepOrphanBackgrounds().then((n) => {
        if (n) log.image(`image-seam: swept ${n} orphaned backdrop(s) (${why})`);
      }).catch((e) => log.warn("image-seam: orphan sweep rejected:", e));
    }, SWEEP_DEBOUNCE_MS);
  }
  function topMvu() {
    try {
      return topWindow.Mvu || null;
    } catch (e) {
      log.warn("image-seam: reaching top Mvu threw:", e);
      return null;
    }
  }
  function latchTargetFloors() {
    let last = -1;
    try {
      const n = Number(window.getLastMessageId ? window.getLastMessageId() : NaN);
      if (Number.isFinite(n) && n >= 0) last = n;
    } catch (e) {
      log.warn("image-seam: getLastMessageId threw — falling back to the chat length:", e);
    }
    if (last < 0) {
      try {
        const chat = topWindow.SillyTavern && topWindow.SillyTavern.getContext && topWindow.SillyTavern.getContext().chat;
        if (Array.isArray(chat)) last = chat.length - 1;
      } catch (e) {
        log.warn("image-seam: reading the chat length threw — no data floor this attempt:", e);
      }
    }
    if (typeof window.getVariables !== "function") return [];
    const hasStatData = (id) => {
      try {
        const v = window.getVariables({ type: "message", message_id: id });
        return !!(v && v.stat_data);
      } catch (e) {
        log.warn(`image-seam: getVariables(message ${id}) threw — treating that floor as holding no stat_data:`, e);
        return false;
      }
    };
    return latchFloors(last, hasStatData, FLOOR_LOOKBACK2);
  }
  async function attemptForceImageType(on) {
    const Mvu = topMvu();
    if (!Mvu || typeof Mvu.setMvuVariable !== "function") {
      log.image("image-seam: top-window Mvu not attached yet — ForceImageType flip deferred to the retry loop");
      return "retry";
    }
    const floors = latchTargetFloors();
    if (!floors.length) {
      log.image("image-seam: no data floor yet — ForceImageType flip deferred to the retry loop");
      return "retry";
    }
    try {
      const written = [];
      for (const id of floors) {
        const data = Mvu.getMvuData({ type: "message", message_id: id });
        if (!data || !data.stat_data) {
          log.image(`image-seam: floor ${id} has no stat_data yet — ForceImageType flip deferred to the retry loop`);
          return "retry";
        }
        const okSet = Mvu.setMvuVariable(data, FORCE_PATH, on, { reason: `galgame ${on ? "enter" : "exit"}` });
        if (okSet === false) {
          log.warn(`image-seam: ${FORCE_PATH} not on this card (card-side init missing) — skip flip`);
          return "skip";
        }
        await Mvu.replaceMvuData(data, { type: "message", message_id: id });
        written.push(id);
      }
      log.image(`image-seam: ForceImageType → ${on} (floors ${written.join(", ")}: the newest and the one beneath, so a regenerate or swipe of the newest reply reads it too)`);
      return "ok";
    } catch (e) {
      log.warn("image-seam: ForceImageType flip threw (will retry):", e);
      return "retry";
    }
  }
  var FORCE_RETRY_MS = 1500;
  var FORCE_RETRY_MAX = 10;
  var desiredForceState = null;
  var forceRetryRunning = false;
  function setForceImageType(on) {
    desiredForceState = on;
    if (forceRetryRunning) return;
    forceRetryRunning = true;
    (async () => {
      for (let i = 0; i < FORCE_RETRY_MAX; i++) {
        const target = desiredForceState;
        const result = await attemptForceImageType(target);
        if ((result === "ok" || result === "skip") && desiredForceState === target) {
          forceRetryRunning = false;
          return;
        }
        if (result === "ok" || result === "skip") continue;
        await new Promise((res) => setTimeout(res, FORCE_RETRY_MS));
      }
      log.warn(`image-seam: ForceImageType flip GAVE UP after ${FORCE_RETRY_MAX} attempts over ~${Math.round(FORCE_RETRY_MAX * FORCE_RETRY_MS / 1e3)}s (target=${desiredForceState}) — top-window Mvu never became available. The galgame stage may receive non-uniform image types this session.`);
      forceRetryRunning = false;
    })();
  }
  function overlayActive() {
    const ov = DOC.getElementById(OVERLAY_ID);
    if (!ov) return false;
    try {
      if (DOC.defaultView && DOC.defaultView.getComputedStyle(ov).display === "none") return false;
    } catch (e) {
    }
    return ov.classList.contains("active");
  }
  var galActive = false;
  function syncGalState() {
    const now = overlayActive();
    if (now === galActive) return;
    galActive = now;
    setForceImageType(now);
  }
  var RECONCILE_SETTLE_MS = 5e3;
  var reconcileTimer = null;
  function readStoredForceImageType() {
    const Mvu = topMvu();
    if (!Mvu || typeof Mvu.getMvuData !== "function") return { ok: false };
    const id = latchTargetFloors()[0];
    if (id === void 0) return { ok: false };
    try {
      const data = Mvu.getMvuData({ type: "message", message_id: id });
      if (!data || !data.stat_data) return { ok: false };
      let cursor = data.stat_data;
      for (const segment of FORCE_PATH.split(".")) {
        if (cursor == null || typeof cursor !== "object") return { ok: true, value: void 0, floor: id };
        cursor = cursor[segment];
      }
      return { ok: true, value: cursor, floor: id };
    } catch (e) {
      log.warn("image-seam: could not read the stored ForceImageType latch — reconcile skipped:", e);
      return { ok: false };
    }
  }
  function reconcileForceImageType(why) {
    const read = readStoredForceImageType();
    if (!read.ok) {
      log.image(`image-seam: ForceImageType reconcile (${why}) — state not readable yet, skipped`);
      return;
    }
    const live = overlayActive();
    const decision = decideForceReconcile({ stored: read.value, live });
    galActive = live;
    if (!decision.write) {
      log.image(`image-seam: ForceImageType reconcile (${why}) — ${decision.reason}`);
      return;
    }
    log.warn(`image-seam: ForceImageType DRIFTED — ${decision.reason} (${why}, floor ${read.floor}). Correcting to ${decision.to}. Images generated since it drifted used the wrong aspect.`);
    setForceImageType(decision.to);
  }
  function scheduleReconcile(why) {
    if (reconcileTimer) topWindow.clearTimeout(reconcileTimer);
    reconcileTimer = topWindow.setTimeout(() => {
      reconcileTimer = null;
      reconcileForceImageType(why);
    }, RECONCILE_SETTLE_MS);
  }
  function startImageSeam() {
    if (typeof window.getChatMessages !== "function" || typeof window.eventOn !== "function") {
      log.warn("image-seam: TH globals (getChatMessages/eventOn) absent — seam disabled");
      return;
    }
    const te = window.tavern_events || {};
    const onMsg = (id) => {
      processMessage(Number(id));
    };
    for (const ev of [te.MESSAGE_UPDATED, te.CHARACTER_MESSAGE_RENDERED, te.MESSAGE_SWIPED, te.MESSAGE_EDITED]) {
      if (ev) {
        try {
          window.eventOn(ev, onMsg);
        } catch (e) {
          log.warn(`image-seam: eventOn(${ev}) failed:`, e);
        }
      }
    }
    for (const [ev, why] of [[te.MESSAGE_DELETED, "message deleted"], [te.CHAT_CHANGED, "chat loaded"]]) {
      if (!ev) continue;
      try {
        window.eventOn(ev, () => scheduleSweep(why));
      } catch (e) {
        log.warn(`image-seam: eventOn(${ev}) failed — orphan sweep not bound to "${why}":`, e);
      }
    }
    scheduleSweep("seam start");
    if (te.CHAT_CHANGED) {
      if (typeof window.eventMakeFirst === "function") {
        try {
          window.eventMakeFirst(te.CHAT_CHANGED, () => backfillChat("chat loaded").catch((e) => log.warn("image-seam: chat-load backfill rejected:", e)));
        } catch (e) {
          log.warn("image-seam: eventMakeFirst(CHAT_CHANGED) failed — the chat-load backfill is not bound:", e);
        }
      } else {
        log.warn("image-seam: TavernHelper eventMakeFirst is absent — the chat-load backfill is not bound, so a browser that never saw this chat drawn shows no backdrop for it");
      }
    }
    backfillChat("seam start").catch((e) => log.warn("image-seam: start-up backfill rejected:", e));
    if (te.CHAT_CHANGED) {
      try {
        window.eventOn(te.CHAT_CHANGED, () => scheduleReconcile("chat loaded"));
      } catch (e) {
        log.warn("image-seam: eventOn(CHAT_CHANGED) failed — ForceImageType reconcile not bound to a chat load:", e);
      }
    }
    let scheduled3 = false;
    const obs = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      (topWindow.requestAnimationFrame || setTimeout)(() => {
        scheduled3 = false;
        syncGalState();
      }, 0);
    });
    try {
      obs.observe(DOC.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    } catch (e) {
      log.warn("image-seam: could not observe for immersive enter/exit:", e);
    }
    galActive = overlayActive();
    scheduleReconcile("seam start");
    log.image("image-seam active");
  }

  // src/features/image/image-viewer-core.js
  var BACKDROP_URL_VARIABLE = "--gal-bg-url";
  function urlFromCssValue(value) {
    const match = String(value == null ? "" : value).trim().match(/^url\(\s*(["']?)([\s\S]*?)\1\s*\)$/);
    if (!match || !match[2]) return null;
    return match[2].replace(/\\(.)/g, "$1");
  }
  function displayedBackdropUrl(layerValues) {
    for (const value of layerValues || []) {
      const url = urlFromCssValue(value);
      if (url) return url;
    }
    return null;
  }

  // src/features/image/image-viewer.js
  var OVERLAY_SEL5 = "#gal-global-overlay";
  var BTN_CLASS = "school-imgview-btn";
  var MODAL_ID2 = "school-imgview-modal";
  var Z_INDEX2 = 2147483e3;
  function modalParent2() {
    return currentFullscreenEl() || DOC.body;
  }
  function currentBgUrl() {
    const ov = DOC.querySelector(OVERLAY_SEL5);
    if (!ov) return null;
    return displayedBackdropUrl([".gal-bg-front", ".gal-bg-base"].map((sel) => {
      const el = ov.querySelector(sel);
      return el ? el.style.getPropertyValue(BACKDROP_URL_VARIABLE) : null;
    }));
  }
  var cleanup = null;
  function closeImageViewer() {
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        log.warn("image-viewer: cleanup failed:", e);
      }
      cleanup = null;
    }
    const el = DOC.getElementById(MODAL_ID2);
    if (el) el.remove();
  }
  function openImageViewer() {
    if (DOC.getElementById(MODAL_ID2)) return;
    const url = currentBgUrl();
    const wrap = DOC.createElement("div");
    wrap.id = MODAL_ID2;
    wrap.style.cssText = `position:fixed;inset:0;z-index:${Z_INDEX2};width:100vw;height:100dvh;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);cursor:zoom-out;`;
    if (url) {
      const img = DOC.createElement("img");
      img.src = url;
      img.alt = "Current scene image";
      img.style.cssText = "max-width:96vw;max-height:96dvh;width:auto;height:auto;object-fit:contain;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.7);cursor:default;";
      img.addEventListener("click", (e) => e.stopPropagation());
      wrap.appendChild(img);
    } else {
      const msg = DOC.createElement("div");
      msg.textContent = "No image is showing right now.";
      msg.style.cssText = "color:#ccc;font-size:1rem;";
      wrap.appendChild(msg);
    }
    const close = DOC.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "✕";
    close.style.cssText = "position:absolute;top:14px;right:16px;background:rgba(0,0,0,0.55);border:0;color:#fff;font-size:1.3rem;line-height:1;cursor:pointer;padding:6px 12px;border-radius:8px;";
    wrap.appendChild(close);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target === close) closeImageViewer();
    });
    const onKey = (e) => {
      if (e.key === "Escape") closeImageViewer();
    };
    DOC.addEventListener("keydown", onKey);
    cleanup = () => DOC.removeEventListener("keydown", onKey);
    modalParent2().appendChild(wrap);
    log.image("image-viewer: opened (" + (url ? "showing current backdrop" : "no image") + ")");
  }
  function injectButton() {
    const overlay = DOC.querySelector(OVERLAY_SEL5);
    if (!overlay || overlay.querySelector("." + BTN_CLASS)) return false;
    const btn = DOC.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS;
    btn.title = "View the current image";
    btn.setAttribute("aria-label", "View the current image");
    btn.innerHTML = '<i class="fa-solid fa-image"></i>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openImageViewer();
    });
    overlay.appendChild(btn);
    return true;
  }
  function startImageViewer() {
    if (!DOC || !DOC.body) return setTimeout(startImageViewer, 200);
    let scheduled3 = false;
    const observer2 = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      requestAnimationFrame(() => {
        scheduled3 = false;
        injectButton();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    injectButton();
    log.image("image-viewer active");
  }

  // src/features/image/image-regen-core.js
  function basename(url) {
    return String(url || "").split("/").pop().split("?")[0];
  }
  function cssUrlValue(url) {
    const safe = String(url || "").replace(/[\r\n]/g, "").replace(/[\\"]/g, "\\$&");
    return `url("${safe}")`;
  }
  function decideRegenRepaint({ floor, lastAiFloor: lastAiFloor2, stageFloor, displayedUrl, oldSrc, newSrc }) {
    if (!newSrc || basename(newSrc) === basename(oldSrc)) {
      return { repaint: false, landed: false, reason: "the image at that position has not changed yet" };
    }
    if (floor === lastAiFloor2) {
      return { repaint: false, landed: true, reason: `floor ${floor} is the newest AI floor — galgame repaints it itself` };
    }
    if (stageFloor !== floor) {
      return { repaint: false, landed: true, reason: `the stage shows floor ${stageFloor}, not floor ${floor}` };
    }
    if (basename(displayedUrl) !== basename(oldSrc)) {
      return { repaint: false, landed: true, reason: "the stage no longer shows the image that was regenerated" };
    }
    return { repaint: true, landed: true, reason: `floor ${floor} is not the newest AI floor, so galgame leaves its stage as it was` };
  }

  // src/features/image/image-regen.js
  var OVERLAY_SEL6 = "#gal-global-overlay";
  var BTN_CLASS2 = "school-imgregen-btn";
  var WRAP_SEL = '[class*="auto-img-wrap"]';
  var REGEN_SEL = '[class*="auto-img-regen"]';
  var BG_LAYER_SEL = "#gal-global-overlay .gal-layer-bg";
  var BG_BASE_SEL = ".gal-bg-base";
  var BG_FRONT_SEL = ".gal-bg-front";
  var BG_TRANSITION_MS = 900;
  var PENDING_SWAP_MS = 10 * 60 * 1e3;
  function floorOf(el) {
    const mes = el && el.closest(".mes");
    const n = Number(mes && mes.getAttribute("mesid"));
    return Number.isFinite(n) && n >= 0 ? n : -1;
  }
  function wrapsOf(floor) {
    return Array.from(DOC.querySelectorAll(`.mes[mesid="${floor}"] ${WRAP_SEL}`));
  }
  function imgSrcOf2(wrap) {
    const img = wrap && wrap.querySelector("img");
    return img ? img.getAttribute("src") || img.src || null : null;
  }
  function lastAiFloor() {
    const rows = DOC.querySelectorAll('#chat > .mes:not([is_user="true"])');
    return rows.length ? floorOf(rows[rows.length - 1]) : -1;
  }
  function controlOf(wrap) {
    const regen = wrap && wrap.querySelector(REGEN_SEL);
    if (!regen) return null;
    const floor = floorOf(wrap);
    return { regen, floor, ordinal: floor >= 0 ? wrapsOf(floor).indexOf(wrap) : -1, src: imgSrcOf2(wrap) };
  }
  function regenForCurrentBg() {
    const target = basename(currentBgUrl());
    if (!target) return null;
    for (const img of DOC.querySelectorAll(`${WRAP_SEL} img`)) {
      if (basename(img.getAttribute("src") || img.src) === target) {
        const control2 = controlOf(img.closest(WRAP_SEL));
        if (control2) return control2;
      }
    }
    return null;
  }
  function newestImageRegenControl() {
    const wraps = DOC.querySelectorAll(WRAP_SEL);
    for (let i = wraps.length - 1; i >= 0; i--) {
      const control2 = controlOf(wraps[i]);
      if (control2) return control2;
    }
    return null;
  }
  var pendingSwap = null;
  function fireRegen(btn) {
    let control2 = regenForCurrentBg();
    let target = "the current backdrop";
    if (!control2) {
      control2 = newestImageRegenControl();
      target = "the NEWEST image — no backdrop was on screen to match (deleted from the Background Manager?)";
    }
    if (!control2) {
      log.warn("image-regen: no generated image in this chat to regenerate — nothing to do");
      return false;
    }
    control2.regen.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    log.image(`image-regen: triggered regenerate for ${target} (floor ${control2.floor}, image #${control2.ordinal + 1}, ${basename(control2.src)})`);
    if (control2.floor >= 0 && control2.ordinal >= 0 && control2.src) {
      pendingSwap = { floor: control2.floor, ordinal: control2.ordinal, oldSrc: control2.src, at: Date.now() };
    } else {
      pendingSwap = null;
      log.warn(`image-regen: the regenerated image's floor/position could not be read (floor ${control2.floor}, position ${control2.ordinal}) — the stage will not be repainted for it`);
    }
    if (btn) {
      btn.classList.add("is-spinning");
      setTimeout(() => btn.classList.remove("is-spinning"), 2e3);
    }
    return true;
  }
  function paintStage(url) {
    const layer = DOC.querySelector(BG_LAYER_SEL);
    const base = layer && layer.querySelector(BG_BASE_SEL);
    const front = layer && layer.querySelector(BG_FRONT_SEL);
    if (!layer || !base || !front) {
      log.warn("image-regen: galgame's backdrop layers (.gal-layer-bg > .gal-bg-base + .gal-bg-front) are not on the stage — its layer contract changed; stage not repainted");
      return false;
    }
    const jq = topWindow.jQuery;
    if (typeof jq !== "function") {
      log.warn("image-regen: the top window has no jQuery, so galgame's bgCurrentUrl bookkeeping cannot be kept — stage not repainted");
      return false;
    }
    const $layer = jq(layer);
    const css = cssUrlValue(url);
    $layer.data("bgCurrentUrl", url);
    layer.querySelectorAll(".gal-gen-indicator").forEach((node) => node.remove());
    front.classList.remove("is-active");
    front.style.setProperty(BACKDROP_URL_VARIABLE, css);
    void front.offsetHeight;
    const token = `companion_${Date.now()}_${Math.random()}`;
    $layer.data("bgTransitionToken", token);
    layer.classList.remove("bg-transitioning");
    void layer.offsetHeight;
    layer.classList.add("bg-transitioning");
    front.classList.add("is-active");
    topWindow.setTimeout(() => {
      if ($layer.data("bgTransitionToken") !== token) return;
      base.style.setProperty(BACKDROP_URL_VARIABLE, css);
      front.classList.remove("is-active");
      front.style.removeProperty(BACKDROP_URL_VARIABLE);
      layer.classList.remove("bg-transitioning");
    }, BG_TRANSITION_MS);
    return true;
  }
  function onMessageUpdated(id) {
    if (!pendingSwap) return;
    const floor = Number(id);
    if (floor !== pendingSwap.floor) return;
    if (Date.now() - pendingSwap.at > PENDING_SWAP_MS) {
      log.image(`image-regen: forgot the regenerate fired on floor ${floor} ${Math.round((Date.now() - pendingSwap.at) / 6e4)} min ago — it never announced a swap`);
      pendingSwap = null;
      return;
    }
    const wrap = wrapsOf(floor)[pendingSwap.ordinal];
    if (!wrap) {
      log.warn(`image-regen: floor ${floor} no longer has an image at position ${pendingSwap.ordinal + 1} — the regenerated image cannot be located; stage not repainted`);
      pendingSwap = null;
      return;
    }
    const newSrc = imgSrcOf2(wrap);
    const decision = decideRegenRepaint({
      floor,
      lastAiFloor: lastAiFloor(),
      stageFloor: displayedFloor(),
      displayedUrl: currentBgUrl(),
      oldSrc: pendingSwap.oldSrc,
      newSrc
    });
    if (!decision.landed) {
      log.image(`image-regen: floor ${floor} changed but ${decision.reason} — still waiting for the swap`);
      return;
    }
    pendingSwap = null;
    if (!decision.repaint) {
      log.image(`image-regen: regenerated image ${basename(newSrc)} landed on floor ${floor} — ${decision.reason}`);
      return;
    }
    if (paintStage(newSrc)) log.image(`image-regen: stage repainted with ${basename(newSrc)} — ${decision.reason}`);
  }
  function injectButton2() {
    const overlay = DOC.querySelector(OVERLAY_SEL6);
    if (!overlay || overlay.querySelector("." + BTN_CLASS2)) return false;
    const btn = DOC.createElement("button");
    btn.type = "button";
    btn.className = BTN_CLASS2;
    btn.title = "Regenerate the current image";
    btn.setAttribute("aria-label", "Regenerate the current image");
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      fireRegen(btn);
    });
    overlay.appendChild(btn);
    return true;
  }
  function startImageRegen() {
    if (!DOC || !DOC.body) return setTimeout(startImageRegen, 200);
    const te = window.tavern_events || {};
    if (typeof window.eventOn === "function" && te.MESSAGE_UPDATED) {
      try {
        window.eventOn(te.MESSAGE_UPDATED, onMessageUpdated);
      } catch (e) {
        log.warn("image-regen: eventOn(MESSAGE_UPDATED) failed — the stage will not repaint after a regenerate on an older floor:", e);
      }
    } else {
      log.warn("image-regen: eventOn / tavern_events.MESSAGE_UPDATED are not on this window — the stage will not repaint after a regenerate on an older floor");
    }
    let scheduled3 = false;
    const observer2 = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      requestAnimationFrame(() => {
        scheduled3 = false;
        injectButton2();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    injectButton2();
    log.image("image-regen active");
  }

  // src/features/image/background-manager-core.js
  function sortSceneNamesByRecency(sceneNames, stamps) {
    const names = Array.isArray(sceneNames) ? sceneNames : [];
    const stampOf = (name) => {
      const at = stamps && typeof stamps.get === "function" ? stamps.get(name) : void 0;
      return Number.isFinite(at) ? at : null;
    };
    return names.map((name, position) => ({ name, position, at: stampOf(name) })).sort((a, b) => {
      if (a.at === null && b.at === null) return a.position - b.position;
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      if (a.at !== b.at) return b.at - a.at;
      return a.position - b.position;
    }).map((entry) => entry.name);
  }
  function restatedCount(text, count) {
    const line = String(text == null ? "" : text);
    if (!Number.isFinite(count) || count < 0) return line;
    if (!/\d/.test(line)) return line;
    return line.replace(/\d+/, String(count));
  }

  // src/features/image/background-manager.js
  var PANE_SEL = '.gal-tab-pane[data-pane="backgrounds"]';
  var GRID_SEL = ".gal-bg-grid";
  var CARD_SEL = ".gal-bg-card";
  var HEADER_SEL = ".gal-pane-header";
  var ACTIONS_SEL = ".gal-pane-actions";
  var STAT_SEL = ".gal-pane-stat";
  var GAL_BTN_CLASS = "gal-action-btn gal-pane-btn";
  var READY_CLASS = "companion-bg-ready";
  var SELECTING_CLASS = "companion-bg-selecting";
  var PICKED_CLASS = "companion-bg-picked";
  var TOGGLE_CLASS = "companion-bg-select-toggle";
  var BAR_CLASS2 = "companion-bg-selectbar";
  var COUNT_CLASS = "companion-bg-selected-count";
  function cardsIn(pane) {
    return Array.from(pane.querySelectorAll(CARD_SEL));
  }
  function pickedIn(pane) {
    return cardsIn(pane).filter((card) => card.classList.contains(PICKED_CLASS));
  }
  function sceneOf(card) {
    return card.getAttribute("data-scene") || "";
  }
  async function sortByRecency(pane) {
    const grid = pane.querySelector(GRID_SEL);
    if (!grid) return;
    const stamps = await readBackgroundStamps("Background Manager recency sort");
    if (!stamps) {
      log.warn("background-manager: the library timestamps could not be read — the panel keeps galgame's alphabetical order");
      return;
    }
    const cardByScene = /* @__PURE__ */ new Map();
    for (const card of cardsIn(pane)) cardByScene.set(sceneOf(card), card);
    const order = sortSceneNamesByRecency(Array.from(cardByScene.keys()), stamps);
    const ordered = DOC.createDocumentFragment();
    let dated = 0;
    for (const scene of order) {
      const card = cardByScene.get(scene);
      if (!card) continue;
      const at = stamps.get(scene);
      if (Number.isFinite(at)) {
        card.title = new Date(at).toLocaleString();
        dated++;
      }
      ordered.appendChild(card);
    }
    grid.appendChild(ordered);
    log.image(`background-manager: ${order.length} background(s) sorted newest-first (${dated} carried a timestamp)`);
  }
  function refreshSelectedCount(pane) {
    const label = pane.querySelector("." + COUNT_CLASS);
    if (label) label.textContent = `${pickedIn(pane).length} selected`;
  }
  function setSelecting(pane, on) {
    pane.classList.toggle(SELECTING_CLASS, on);
    if (!on) for (const card of pickedIn(pane)) card.classList.remove(PICKED_CLASS);
    const toggle = pane.querySelector("." + TOGGLE_CLASS);
    if (toggle) {
      const text = toggle.querySelector("span");
      if (text) text.textContent = on ? "Exit select" : "Select";
    }
    refreshSelectedCount(pane);
  }
  function restateHeader(pane) {
    const stat = pane.querySelector(STAT_SEL);
    if (!stat) return;
    stat.textContent = restatedCount(stat.textContent, cardsIn(pane).length);
  }
  async function deleteSelected(pane) {
    const picked = pickedIn(pane);
    if (!picked.length) return;
    const scenes = picked.map(sceneOf).filter(Boolean);
    if (scenes.length !== picked.length) {
      log.warn(`background-manager: ${picked.length - scenes.length} selected card(s) carry no scene name — batch delete refused`);
      warnToast("Some selected backgrounds have no scene name; nothing was deleted.");
      return;
    }
    const ok = topWindow.confirm(
      `Delete ${scenes.length} background${scenes.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!ok) return;
    const deleted = await deleteBackgroundKeys(scenes, "Background Manager batch delete");
    if (!deleted) {
      warnToast(`Could not delete ${scenes.length} background(s) — galgame's image library did not accept the change.`);
      return;
    }
    const gone = new Set(deleted);
    for (const card of picked) if (gone.has(sceneOf(card))) card.remove();
    restateHeader(pane);
    setSelecting(pane, false);
    log.image(`background-manager: deleted ${deleted.length} background(s) from the library`);
  }
  function buildSelectBar(pane) {
    const bar = DOC.createElement("div");
    bar.className = BAR_CLASS2;
    const count = DOC.createElement("span");
    count.className = COUNT_CLASS;
    count.textContent = "0 selected";
    bar.appendChild(count);
    const button = (label, action, extra) => {
      const el = DOC.createElement("button");
      el.type = "button";
      el.className = GAL_BTN_CLASS + (extra ? " " + extra : "");
      el.dataset.companionAction = action;
      el.textContent = label;
      bar.appendChild(el);
      return el;
    };
    button("Select all", "all");
    button("Clear", "none");
    button("Delete selected", "delete", "companion-bg-danger");
    button("Done", "done");
    bar.addEventListener("click", (event) => {
      const pressed = event.target.closest("[data-companion-action]");
      if (!pressed) return;
      event.stopPropagation();
      switch (pressed.dataset.companionAction) {
        case "all":
          for (const card of cardsIn(pane)) card.classList.add(PICKED_CLASS);
          refreshSelectedCount(pane);
          break;
        case "none":
          for (const card of pickedIn(pane)) card.classList.remove(PICKED_CLASS);
          refreshSelectedCount(pane);
          break;
        case "delete":
          deleteSelected(pane).catch((e) => log.warn("background-manager: batch delete rejected:", e));
          break;
        case "done":
          setSelecting(pane, false);
          break;
        default:
          break;
      }
    });
    return bar;
  }
  function bindCardPicking(pane) {
    const grid = pane.querySelector(GRID_SEL);
    if (!grid) return;
    grid.addEventListener("click", (event) => {
      if (!pane.classList.contains(SELECTING_CLASS)) return;
      const card = event.target.closest(CARD_SEL);
      if (!card || !grid.contains(card)) return;
      event.preventDefault();
      event.stopPropagation();
      card.classList.toggle(PICKED_CLASS);
      refreshSelectedCount(pane);
    }, true);
  }
  function patchPane(pane) {
    if (pane.classList.contains(READY_CLASS)) return;
    pane.classList.add(READY_CLASS);
    const actions = pane.querySelector(HEADER_SEL + " " + ACTIONS_SEL);
    if (actions) {
      const toggle = DOC.createElement("button");
      toggle.type = "button";
      toggle.className = `${GAL_BTN_CLASS} ${TOGGLE_CLASS}`;
      toggle.innerHTML = '<i class="fa-solid fa-square-check"></i> <span>Select</span>';
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelecting(pane, !pane.classList.contains(SELECTING_CLASS));
      });
      actions.insertBefore(toggle, actions.firstChild);
      const header = pane.querySelector(HEADER_SEL);
      if (header && header.parentNode) header.parentNode.insertBefore(buildSelectBar(pane), header.nextSibling);
    } else {
      log.warn(`background-manager: no "${ACTIONS_SEL}" in the backgrounds pane — select mode not injected (galgame markup drift?)`);
    }
    bindCardPicking(pane);
    sortByRecency(pane).catch((e) => log.warn("background-manager: recency sort rejected:", e));
  }
  function startBackgroundManager() {
    if (!DOC || !DOC.body) return setTimeout(startBackgroundManager, 200);
    let scheduled3 = false;
    const patchAll = () => {
      for (const pane of DOC.querySelectorAll(`${PANE_SEL}:not(.${READY_CLASS})`)) patchPane(pane);
    };
    const observer2 = new MutationObserver(() => {
      if (scheduled3) return;
      scheduled3 = true;
      requestAnimationFrame(() => {
        scheduled3 = false;
        patchAll();
      });
    });
    observer2.observe(DOC.body, { childList: true, subtree: true });
    patchAll();
    log.image("background-manager active");
  }

  // src/app/index.js
  console.log(`[${SCRIPT_NAME}] v${VERSION} · build ${BUILD}`);
  try {
    topWindow.__galgameCompanion = Object.assign(topWindow.__galgameCompanion || {}, {
      name: SCRIPT_NAME,
      version: VERSION,
      build: BUILD,
      loadedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    log.warn("could not publish the build stamp on the parent window (troubleshooting handle unavailable):", e);
  }
  log.info(`v${VERSION} loading`);
  startGalgameDefaults();
  injectStyle();
  startI18n();
  startToolbar();
  startFullscreenGuard();
  startBeatShaper();
  startImageSeam();
  startGeneratingIndicator();
  startLocationTimeBridge();
  startChoices();
  startNextBlock();
  startMeterPanel();
  startImageViewer();
  startImageRegen();
  startBackgroundManager();
  logActiveGenre();
  log.info(`v${VERSION} ready`);
})();
