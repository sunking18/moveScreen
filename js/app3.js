(function () {
  'use strict';

  /* index3 特效大屏：弹幕走马灯
   *
   * 视觉设计：
   * - 弹幕分三路（左 / 中 / 右）从不同方向入场
   * - 左路：从左侧滑入，停在左半屏
   * - 中路：从底部升起或在中心弹出
   * - 右路：从右侧滑入，停在右半屏
   * - 每条停留 8 秒，每 1.5 秒出一条，同屏最多 25 条
   * - 彩色渐变卡片 + 发光拖尾 + 无旋转
   */

  const CFG = {
    FONT_SIZE: 1.55,
    FEATURED_FONT_SIZE: 2.2,
    FEATURED_CHANCE: 0.05,
    RETRY_MS: 1500,
    MAX_ACTIVE: 35,
    MODULE_PAUSE_MS: 1500,
    DURATION: 8,            // 每条停留秒数
    FADE_START: 0.80,       // 80% 进度时开始淡出
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

    // 8 个垂直区域：左右两侧权重更高
    const zones = [
      { x0: pad.x, x1: sw * 0.28 - w },        // 左
      { x0: pad.x, x1: sw * 0.28 - w },        // 左
      { x0: sw * 0.12, x1: sw * 0.42 - w },    // 左中
      { x0: sw * 0.35, x1: sw * 0.65 - w },    // 中
      { x0: sw * 0.58, x1: sw * 0.88 - w },    // 右中
      { x0: sw * 0.72, x1: sw - pad.x - w },   // 右
      { x0: sw * 0.72, x1: sw - pad.x - w },   // 右
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
    const sw = danmakuStage.clientWidth;
    const ratio = (x + w / 2) / sw;

    // 根据水平位置选入场方向：左右范围放宽，让左右滑入的弹幕更多
    let type;
    if (ratio < 0.45) type = 'slide-left';
    else if (ratio > 0.55) type = 'slide-right';
    else type = ['rise', 'pop', 'float'][randInt(0, 2)];

    el.classList.add(`enter-${type}`);
    el.style.animationDuration = `${CFG.DURATION}s`;

    // 设置初始 transform（动画起点）
    switch (type) {
      case 'slide-left': {
        const cy = y + h / 2;
        el.style.left = `${x}px`;
        el.style.top = `${cy}px`;
        el.style.transform = `translate(-120%, -50%) scale(0.75)`;
        el.style.transformOrigin = 'center center';
        break;
      }
      case 'slide-right': {
        const cy = y + h / 2;
        el.style.left = `${x}px`;
        el.style.top = `${cy}px`;
        el.style.transform = `translate(120%, -50%) scale(0.75)`;
        el.style.transformOrigin = 'center center';
        break;
      }
      case 'rise': {
        const cx = x + w / 2;
        // 从底部 footer 上方开始升起，避免被 "同学们的心声" 栏挡住
        const startY = Math.max(danmakuStage.clientHeight * 0.78, danmakuStage.clientHeight - 140);
        el.style.left = `${cx}px`;
        el.style.top = `${startY}px`;
        el.style.transform = `translate(-50%, 0) scale(0.7)`;
        el.style.transformOrigin = 'center bottom';
        break;
      }
      case 'pop': {
        const cx = x + w / 2;
        const cy = y + h / 2;
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.style.transform = `translate(-50%, -50%) scale(0)`;
        el.style.transformOrigin = 'center center';
        break;
      }
      case 'float': {
        const cx = x + w / 2;
        const cy = y + h / 2;
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.style.transform = `translate(-50%, -50%) scale(0.55)`;
        el.style.transformOrigin = 'center center';
        break;
      }
    }

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

    // 淡出阶段
    const fadeAfter = CFG.DURATION * 1000 * CFG.FADE_START;
    const total = CFG.DURATION * 1000;
    const fadeTimer = setTimeout(() => {
      if (el.parentNode) {
        el.style.transition = 'opacity 1.5s ease, filter 1.5s ease';
        el.style.opacity = '0';
        el.style.filter = 'blur(2px)';
      }
    }, fadeAfter);

    // 结束：清理 + 检查是否全部完成
    const endTimer = setTimeout(() => {
      clearTimeout(fadeTimer);
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
