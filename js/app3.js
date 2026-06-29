(function () {
  'use strict';

  /* index3 特效大屏：弹幕走马灯
   *
   * 视觉设计：
   * - 弹幕从屏幕各处随机入场，入场后持续运动，不会定格
   * - 1 秒弹出一个，每个动画效果随机
   * - 每条可见 8 秒，同屏最多 35 条
   * - 彩色渐变卡片 + 发光拖尾
   */

  const CFG = {
    FONT_SIZE: 1.55,
    FEATURED_FONT_SIZE: 2.2,
    FEATURED_CHANCE: 0.05,
    RETRY_MS: 1000,         // 1 秒弹出一个
    MAX_ACTIVE: 35,
    MODULE_PAUSE_MS: 1500,
    DURATION: 8,            // 每条可见秒数
    PALETTE_COUNT: 8,
  };

  const questionText = document.getElementById('questionText');
  const questionPanel = document.getElementById('questionPanel');
  const danmakuStage = document.getElementById('danmakuStage');
  const timerEl = document.getElementById('timer');
  const dots = document.querySelectorAll('.dot');
  const particlesEl = document.getElementById('particles');

  let currentModuleIndex = 0;
  let danmakuTimer = null;
  let commentPool = [];
  let poolIndex = 0;
  let featuredEl = null;
  let switchingModule = false;
  let activeItems = [];  // { el, x, y, w, h }

  /* ===== 工具 ===== */

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hasMore() {
    return poolIndex < commentPool.length;
  }

  function consumeComment() {
    return commentPool[poolIndex++];
  }

  function updateProgress() {
    timerEl.textContent = `${poolIndex} / ${commentPool.length}`;
  }

  /* ===== 粒子 ===== */

  function initParticles() {
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = randInt(1, 4);
      p.style.cssText =
        `width:${size}px;height:${size}px;` +
        `left:${rand(0, 100)}%;top:${rand(0, 100)}%;` +
        `animation-duration:${rand(3, 8)}s;` +
        `animation-delay:${rand(0, 5)}s;`;
      particlesEl.appendChild(p);
    }
  }

  /* ===== 测量 ===== */

  function measure(el) {
    el.style.visibility = 'hidden';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    danmakuStage.appendChild(el);
    const r = el.getBoundingClientRect();
    el.remove();
    el.style.visibility = '';
    return { w: r.width, h: r.height };
  }

  /* ===== 创建 DOM ===== */

  function createEl(text, isFeatured) {
    const el = document.createElement('div');
    const fs = isFeatured ? CFG.FEATURED_FONT_SIZE : CFG.FONT_SIZE;
    const pal = randInt(0, CFG.PALETTE_COUNT - 1);
    el.className = 'danmaku-item' +
      (isFeatured ? ' danmaku-featured' : '') +
      ` palette-${pal}`;
    el.textContent = text;
    el.style.fontSize = `${fs}rem`;
    return el;
  }

  /* ===== 布局：找不重叠的位置 ===== */

  function findPos(w, h) {
    const sw = danmakuStage.clientWidth;
    const sh = danmakuStage.clientHeight;
    const pad = { x: 50, y: 90 };

    // 8 个垂直区域：左右两侧权重更高，左侧起点往右移避免贴边遮挡
    const zones = [
      { x0: sw * 0.10, x1: sw * 0.38 - w },    // 左（更靠右）
      { x0: sw * 0.10, x1: sw * 0.38 - w },    // 左
      { x0: sw * 0.22, x1: sw * 0.48 - w },    // 左中
      { x0: sw * 0.35, x1: sw * 0.65 - w },    // 中
      { x0: sw * 0.52, x1: sw * 0.78 - w },    // 右中
      { x0: sw * 0.62, x1: sw - pad.x - w },   // 右
      { x0: sw * 0.62, x1: sw - pad.x - w },   // 右
      { x0: pad.x, x1: sw - pad.x - w },       // 全屏（兜底）
    ];

    for (let t = 0; t < 60; t++) {
      const z = zones[randInt(0, zones.length - 1)];
      if (z.x1 < z.x0) continue;
      const x = rand(z.x0, z.x1);
      const y = rand(pad.y, sh - pad.y - h);
      if (!overlaps(x, y, w, h)) return { x, y };
    }

    // fallback
    return { x: sw / 2 - w / 2, y: sh * 0.55 - h / 2 };
  }

  function overlaps(x, y, w, h) {
    const gap = 28;
    for (const it of activeItems) {
      if (x < it.x + it.w + gap && x + w + gap > it.x &&
          y < it.y + it.h + gap && y + h + gap > it.y) return true;
    }
    return false;
  }

  function track(el, x, y, w, h) {
    activeItems.push({ el, x, y, w, h });
  }

  function untrack(el) {
    activeItems = activeItems.filter((it) => it.el !== el);
  }

  /* ===== 入场动画 ===== */

  function assignEnter(el, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;

    // 所有动画效果完全随机出现
    const types = ['rise', 'slide-left', 'slide-right', 'pop', 'float', 'fade-scale', 'drop', 'bounce', 'explode', 'rotate-slow', 'pop-big'];
    const type = types[randInt(0, types.length - 1)];

    el.classList.add(`enter-${type}`);
    el.style.animationDuration = `${CFG.DURATION}s`;

    // 统一以目标中心点定位
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;

    const origins = {
      'rise': 'center bottom',
      'slide-left': 'center center',
      'slide-right': 'center center',
      'pop': 'center center',
      'float': 'center center',
      'fade-scale': 'center center',
      'drop': 'center top',
      'bounce': 'center bottom',
      'explode': 'center center',
      'rotate-slow': 'center center',
      'pop-big': 'center center',
    };
    el.style.transformOrigin = origins[type];

    const starts = {
      'rise': 'translate(-50%, 120%) scale(0.7)',
      'slide-left': 'translate(-120%, -50%) scale(0.8)',
      'slide-right': 'translate(120%, -50%) scale(0.8)',
      'pop': 'translate(-50%, -50%) scale(0)',
      'float': 'translate(-50%, -50%) scale(0.55)',
      'fade-scale': 'translate(-50%, -50%) scale(0.4)',
      'drop': 'translate(-50%, -180%) scale(0.85)',
      'bounce': 'translate(-50%, -50%) scale(0)',
      'explode': 'translate(-50%, -50%) scale(0)',
      'rotate-slow': 'translate(-50%, -50%) scale(0.6) rotate(-8deg)',
      'pop-big': 'translate(-50%, -50%) scale(0.2)',
    };
    el.style.transform = starts[type];

    // 触发拖尾
    setTimeout(() => el.classList.add('entering'), 60);
  }

  /* ===== 生命周期 ===== */

  function spawn() {
    if (activeItems.length >= CFG.MAX_ACTIVE) return false;
    if (!hasMore()) return false;

    const text = consumeComment();
    const isFeatured = !featuredEl && Math.random() < CFG.FEATURED_CHANCE;

    // 测量
    const temp = createEl(text, isFeatured);
    const { w, h } = measure(temp);

    // 布局
    const { x, y } = findPos(w, h);

    // 正式创建
    const el = createEl(text, isFeatured);
    danmakuStage.appendChild(el);
    assignEnter(el, x, y, w, h);
    updateProgress();

    if (isFeatured) featuredEl = el;
    track(el, x, y, w, h);

    // 8 秒后清理 + 检查是否全部完成（淡出由 CSS keyframes 控制）
    const total = CFG.DURATION * 1000;
    const endTimer = setTimeout(() => {
      if (featuredEl === el) featuredEl = null;
      untrack(el);
      if (el.parentNode) el.remove();
      tryComplete();
    }, total + 200);

    el._endTimer = endTimer;
    return true;
  }

  function tryComplete() {
    if (switchingModule) return;
    if (hasMore()) return;
    if (activeItems.length > 0) return;

    switchingModule = true;
    stopTimer();
    setTimeout(() => {
      switchingModule = false;
      nextModule();
    }, CFG.MODULE_PAUSE_MS);
  }

  function stopTimer() {
    if (danmakuTimer) { clearTimeout(danmakuTimer); danmakuTimer = null; }
  }

  function resetStage() {
    stopTimer();
    for (const it of activeItems) {
      clearTimeout(it.el._endTimer);
      if (it.el.parentNode) it.el.remove();
    }
    activeItems = [];
    featuredEl = null;
  }

  function startLoop() {
    resetStage();

    function tick() {
      if (hasMore()) {
        if (activeItems.length >= CFG.MAX_ACTIVE) {
          danmakuTimer = setTimeout(tick, 400);
          return;
        }
        spawn();
        danmakuTimer = setTimeout(tick, CFG.RETRY_MS);
      } else {
        checkComplete();
      }
    }
    tick();
  }

  /* ===== 模块切换 ===== */

  function updateDots(idx) {
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  function goModule(idx) {
    questionPanel.classList.add('fade-out');
    setTimeout(() => {
      currentModuleIndex = idx;
      const mod = MODULES[idx];
      questionText.textContent = mod.question;
      updateDots(idx);
      commentPool = shuffle(mod.comments);
      poolIndex = 0;
      updateProgress();
      questionPanel.classList.remove('fade-out');
      startLoop();
    }, 600);
  }

  function nextModule() {
    goModule((currentModuleIndex + 1) % MODULES.length);
  }

  /* ===== 启动 ===== */

  function init() {
    initParticles();
    goModule(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
