(function () {
  'use strict';

  /* index3 特效大屏配置 */
  const CFG = {
    FONT_SIZE: 1.8,
    FEATURED_FONT_SIZE: 2.6,
    FEATURED_CHANCE: 0.05,
    RETRY_MS: 3000,
    /* 同屏最多同时存在的弹幕数量，避免拥挤 */
    MAX_ACTIVE_DANMAKU: 6,
    MODULE_PAUSE_MS: 1500,
    /* 每隔多少条弹幕切换一次特效模式 */
    MODE_SWITCH_INTERVAL: 3,
    /* 特效模式列表（已去掉滚动瀑布） */
    MODES: ['explode', 'float', 'pop'],
    /* 模式显示名称 */
    MODE_NAMES: {
      explode: '爆炸飞散',
      float: '随机漂浮',
      pop: '心跳弹出',
    },
    /* 马卡龙浅色：白底 + pastel 边框 */
    DANMAKU_PALETTE: [
      { bg: 'rgba(255, 235, 235, 0.92)', color: '#c25b5b', border: '#ffb3b3' },
      { bg: 'rgba(235, 245, 255, 0.92)', color: '#4a7fb5', border: '#a3d0ff' },
      { bg: 'rgba(235, 255, 242, 0.92)', color: '#4a9b6b', border: '#a3f0c4' },
      { bg: 'rgba(243, 235, 255, 0.92)', color: '#7a5fb0', border: '#d0b8ff' },
      { bg: 'rgba(255, 248, 230, 0.92)', color: '#b3863a', border: '#ffe0a3' },
      { bg: 'rgba(255, 235, 248, 0.92)', color: '#b35a8a', border: '#ffb8e0' },
      { bg: 'rgba(230, 255, 255, 0.92)', color: '#3a8f9b', border: '#a3f0f5' },
      { bg: 'rgba(240, 242, 255, 0.92)', color: '#5a6fb8', border: '#b8c8ff' },
    ],
    /* 各模式持续时间配置（秒），整体放慢让人能看完 */
    DURATION: {
      explode: { min: 5, max: 8 },
      float: { min: 11, max: 16 },
      pop: { min: 5.5, max: 8 },
    },
  };

  const questionText = document.getElementById('questionText');
  const questionPanel = document.getElementById('questionPanel');
  const danmakuStage = document.getElementById('danmakuStage');
  const timerEl = document.getElementById('timer');
  const dots = document.querySelectorAll('.dot');
  const particlesEl = document.getElementById('particles');
  const modeNameEl = document.getElementById('modeName');

  let currentModuleIndex = 0;
  let danmakuTimer = null;
  let commentPool = [];
  let poolIndex = 0;
  let featuredEl = null;
  let switchingModule = false;
  let currentModeIndex = 0;
  let spawnCounter = 0;
  /* 记录舞台上每个弹幕的空间占位信息，用于避免重叠 */
  let activeBoxes = [];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function randChoice(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hasMoreComments() {
    return poolIndex < commentPool.length;
  }

  function peekComment() {
    if (!hasMoreComments()) return null;
    return commentPool[poolIndex];
  }

  function nextComment() {
    if (!hasMoreComments()) return null;
    return commentPool[poolIndex++];
  }

  function activeDanmakuCount() {
    return danmakuStage.querySelectorAll('.danmaku-item').length;
  }

  function updateProgress() {
    timerEl.textContent = `${poolIndex} / ${commentPool.length}`;
  }

  function initParticles() {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = randInt(2, 8);
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${rand(0, 100)}%;
        animation-duration:${rand(10, 28)}s;
        animation-delay:${rand(0, 14)}s;
      `;
      particlesEl.appendChild(p);
    }
  }

  function measureDanmaku(el) {
    el.style.visibility = 'hidden';
    el.style.top = '-9999px';
    danmakuStage.appendChild(el);
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    el.remove();
    el.style.visibility = '';
    el.style.top = '';
    return { width, height };
  }

  function applyDanmakuStyle(el, isFeatured) {
    if (isFeatured) return;
    const style = CFG.DANMAKU_PALETTE[randInt(0, CFG.DANMAKU_PALETTE.length - 1)];
    el.style.background = style.bg;
    el.style.color = style.color;
    el.style.border = `2px solid ${style.border}`;
    el.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12)';
  }

  function createBaseDanmaku() {
    const text = peekComment();
    if (!text) return null;

    const isFeatured = !featuredEl && Math.random() < CFG.FEATURED_CHANCE;
    const el = document.createElement('div');
    const fontSize = isFeatured ? CFG.FEATURED_FONT_SIZE : CFG.FONT_SIZE;

    el.className = 'danmaku-item' + (isFeatured ? ' danmaku-featured' : '');
    el.textContent = text;
    el.style.fontSize = `${fontSize}rem`;
    applyDanmakuStyle(el, isFeatured);

    return { el, isFeatured, text };
  }

  function getCurrentMode() {
    return CFG.MODES[currentModeIndex];
  }

  function updateModeIndicator() {
    const mode = getCurrentMode();
    modeNameEl.textContent = CFG.MODE_NAMES[mode];
    modeNameEl.parentElement.classList.remove('mode-explode', 'mode-float', 'mode-pop');
    modeNameEl.parentElement.classList.add(`mode-${mode}`);
  }

  function maybeSwitchMode() {
    spawnCounter++;
    if (spawnCounter >= CFG.MODE_SWITCH_INTERVAL) {
      spawnCounter = 0;
      currentModeIndex = (currentModeIndex + 1) % CFG.MODES.length;
      updateModeIndicator();
    }
  }

  /* ---------- 空间占位管理：防止弹幕重叠 ---------- */
  function addActiveBox(box) {
    activeBoxes.push(box);
  }

  function removeActiveBox(el) {
    activeBoxes = activeBoxes.filter((b) => b.el !== el);
  }

  /* 检查候选位置是否会与现有弹幕重叠 */
  function overlaps(x, y, radius, mode) {
    for (const box of activeBoxes) {
      const dx = x - box.x;
      const dy = y - box.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const safeDistance = radius + box.radius;
      if (distance < safeDistance) return true;
    }
    return false;
  }

  /* 安全区：给爆炸弹幕更大的运动空间，给漂浮/弹出也留足边距 */
  function computeRadius(width, height, mode) {
    const base = Math.max(width, height) * 0.55;
    switch (mode) {
      case 'explode': return base + 160;
      case 'float': return base + 90;
      case 'pop': return base + 90;
      default: return base + 80;
    }
  }

  /* ---------- 模式：爆炸飞散 ---------- */
  function spawnExplode() {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const { width, height } = measureDanmaku(el);
    const radius = computeRadius(width, height, 'explode');

    /* 爆炸弹幕从中心出发，但每个方向错开，避免多个弹幕挤在同一处 */
    let cx = stageWidth * 0.5;
    let cy = stageHeight * 0.5;
    let angle = rand(0, Math.PI * 2);
    let distance = Math.min(stageWidth, stageHeight) * rand(0.35, 0.55);
    let tx = Math.cos(angle) * distance;
    let ty = Math.sin(angle) * distance;

    /* 尝试找一个与其他弹幕不冲突的方向/距离，如果舞台太满就接受轻微重叠 */
    let ok = false;
    for (let i = 0; i < 30; i++) {
      angle = rand(0, Math.PI * 2);
      distance = Math.min(stageWidth, stageHeight) * rand(0.35, 0.55);
      tx = Math.cos(angle) * distance;
      ty = Math.sin(angle) * distance;
      const sampleX = cx + tx * 0.4;
      const sampleY = cy + ty * 0.4;
      if (!overlaps(sampleX, sampleY, radius, 'explode')) {
        ok = true;
        break;
      }
    }

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION.explode.min, CFG.DURATION.explode.max);
    const rotateMid = rand(-25, 25);
    const rotateEnd = rand(-60, 60);

    el.classList.add('mode-explode');
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.style.setProperty('--rotate-mid', `${rotateMid}deg`);
    el.style.setProperty('--rotate-end', `${rotateEnd}deg`);
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    addActiveBox({ el, x: cx + tx * 0.4, y: cy + ty * 0.4, radius });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* ---------- 模式：随机漂浮 ---------- */
  function spawnFloat() {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const { width, height } = measureDanmaku(el);
    const radius = computeRadius(width, height, 'float');

    /* 在舞台内随机找不重叠的位置 */
    let startX = rand(stageWidth * 0.2, stageWidth * 0.8);
    let startY = rand(stageHeight * 0.15, stageHeight * 0.75);
    let found = false;
    for (let i = 0; i < 40; i++) {
      startX = rand(stageWidth * 0.15, stageWidth * 0.85);
      startY = rand(stageHeight * 0.12, stageHeight * 0.78);
      if (!overlaps(startX, startY, radius, 'float')) {
        found = true;
        break;
      }
    }

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION.float.min, CFG.DURATION.float.max);
    const scale = rand(0.6, 1.0);
    el.style.setProperty('--tx-a', `${rand(-120, 120) * scale}px`);
    el.style.setProperty('--ty-a', `${rand(-100, -40) * scale}px`);
    el.style.setProperty('--rot-a', `${rand(-12, 12)}deg`);
    el.style.setProperty('--tx-b', `${rand(-160, 160) * scale}px`);
    el.style.setProperty('--ty-b', `${rand(-60, 100) * scale}px`);
    el.style.setProperty('--rot-b', `${rand(-15, 15)}deg`);
    el.style.setProperty('--tx-c', `${rand(-120, 180) * scale}px`);
    el.style.setProperty('--ty-c', `${rand(40, 140) * scale}px`);
    el.style.setProperty('--rot-c', `${rand(-12, 12)}deg`);
    el.style.setProperty('--tx-d', `${rand(-100, 100) * scale}px`);
    el.style.setProperty('--ty-d', `${rand(-60, 80) * scale}px`);
    el.style.setProperty('--rot-d', `${rand(-20, 20)}deg`);

    el.classList.add('mode-float');
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    addActiveBox({ el, x: startX, y: startY, radius });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* ---------- 模式：心跳弹出 ---------- */
  function spawnPop() {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const { width, height } = measureDanmaku(el);
    const radius = computeRadius(width, height, 'pop');

    /* 在中心附近随机找不重叠的位置 */
    let cx = stageWidth * rand(0.35, 0.65);
    let cy = stageHeight * rand(0.25, 0.65);
    for (let i = 0; i < 30; i++) {
      cx = stageWidth * rand(0.3, 0.7);
      cy = stageHeight * rand(0.2, 0.7);
      if (!overlaps(cx, cy, radius, 'pop')) break;
    }

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION.pop.min, CFG.DURATION.pop.max);

    el.classList.add('mode-pop');
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    addActiveBox({ el, x: cx, y: cy, radius });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* ---------- 调度 ---------- */
  function spawnDanmaku() {
    const mode = getCurrentMode();
    let ok = false;

    switch (mode) {
      case 'explode': ok = spawnExplode(); break;
      case 'float': ok = spawnFloat(); break;
      case 'pop': ok = spawnPop(); break;
    }

    if (ok) {
      maybeSwitchMode();
    }

    return ok;
  }

  function checkModuleComplete() {
    if (switchingModule) return;
    if (hasMoreComments()) return;
    if (activeDanmakuCount() > 0) return;

    switchingModule = true;
    stopDanmakuTimer();

    setTimeout(() => {
      switchingModule = false;
      nextModule();
    }, CFG.MODULE_PAUSE_MS);
  }

  function stopDanmakuTimer() {
    if (danmakuTimer) {
      clearTimeout(danmakuTimer);
      danmakuTimer = null;
    }
  }

  function stopDanmaku() {
    stopDanmakuTimer();
    danmakuStage.innerHTML = '';
    featuredEl = null;
    activeBoxes = [];
  }

  function startDanmaku() {
    stopDanmaku();
    spawnCounter = 0;
    updateModeIndicator();

    const tick = () => {
      if (hasMoreComments()) {
        /* 如果同屏弹幕已经很多，先等一会再尝试，避免重叠 */
        if (activeDanmakuCount() >= CFG.MAX_ACTIVE_DANMAKU) {
          danmakuTimer = setTimeout(tick, 500);
          return;
        }
        spawnDanmaku();
        danmakuTimer = setTimeout(tick, CFG.RETRY_MS);
      } else {
        checkModuleComplete();
      }
    };
    tick();
  }

  function updateIndicators(index) {
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  function switchModule(index) {
    questionPanel.classList.add('fade-out');

    setTimeout(() => {
      currentModuleIndex = index;
      const mod = MODULES[index];

      questionText.textContent = mod.question;
      updateIndicators(index);

      commentPool = shuffle(mod.comments);
      poolIndex = 0;
      updateProgress();

      /* 切换模块时重置为爆炸飞散，让节奏更稳 */
      currentModeIndex = 0;

      questionPanel.classList.remove('fade-out');
      stopDanmaku();
      startDanmaku();
    }, 600);
  }

  function nextModule() {
    const next = (currentModuleIndex + 1) % MODULES.length;
    switchModule(next);
  }

  function init() {
    initParticles();
    updateModeIndicator();
    switchModule(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
