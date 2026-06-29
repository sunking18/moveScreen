(function () {
  'use strict';

  /* index3 特效大屏配置：每次从屏幕中心弹出 1 条弹幕，向四周大幅扩散，停留 8 秒 */
  const CFG = {
    FONT_SIZE: 1.6,
    FEATURED_FONT_SIZE: 2.4,
    FEATURED_CHANCE: 0.05,
    /* 每 1.5 秒弹出 1 条，同屏 25 条约 37 秒铺满 */
    RETRY_MS: 1500,
    SPAWN_BATCH_MIN: 1,
    SPAWN_BATCH_MAX: 1,
    MAX_ACTIVE_DANMAKU: 25,
    MODULE_PAUSE_MS: 1500,
    MODE_SWITCH_INTERVAL: 3,
    MODES: ['explode', 'bloom', 'float', 'pop', 'ripple'],
    MODE_NAMES: {
      explode: '爆炸扩散',
      bloom: '轻柔绽放',
      float: '随机漂浮',
      pop: '心跳弹出',
      ripple: '波纹扩散',
    },
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
    DURATION: {
      explode: { min: 8, max: 8 },
      bloom: { min: 8, max: 8 },
      float: { min: 8, max: 8 },
      pop: { min: 8, max: 8 },
      ripple: { min: 8, max: 8 },
    },
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
  let currentModeIndex = 0;
  let spawnCounter = 0;
  let activeBoxes = [];

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

  function maybeSwitchMode() {
    spawnCounter++;
    if (spawnCounter >= CFG.MODE_SWITCH_INTERVAL) {
      spawnCounter = 0;
      currentModeIndex = (currentModeIndex + 1) % CFG.MODES.length;
    }
  }

  /* 空间占位管理 */
  function addActiveBox(box) {
    activeBoxes.push(box);
  }

  function removeActiveBox(el) {
    activeBoxes = activeBoxes.filter((b) => b.el !== el);
  }

  function overlaps(x, y, radius) {
    for (const box of activeBoxes) {
      const dx = x - box.x;
      const dy = y - box.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < radius + box.radius) return true;
    }
    return false;
  }

  /* 通用：所有弹幕从屏幕中心弹出，再按角度向四周扩散 */
  function spawnAtCenter(mode, setupFn, angle) {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const w = danmakuStage.clientWidth;
    const h = danmakuStage.clientHeight;
    const x = w / 2;
    const y = h / 2;

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION[mode].min, CFG.DURATION[mode].max);
    el.classList.add(`mode-${mode}`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.animationDuration = `${duration}s`;

    setupFn({ el, x, y, angle, isFeatured });

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    // 中心弹幕用较小占位半径，允许初始瞬间重叠，扩散后自然分开
    addActiveBox({ el, x, y, radius: 20 });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* 按角度向外扩散，距离随机且范围更大，避免拥挤 */
  function spreadByAngle(angle, minDistance, maxDistance) {
    const distance = Math.min(danmakuStage.clientWidth, danmakuStage.clientHeight) * rand(minDistance, maxDistance);
    return {
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
    };
  }

  /* ---------- 爆炸扩散：从中心快速长大并向外弹出 ---------- */
  function spawnExplode(angle) {
    return spawnAtCenter('explode', ({ el, angle }) => {
      const { tx, ty } = spreadByAngle(angle, 0.45, 0.85);
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    }, angle);
  }

  /* ---------- 轻柔绽放：从中心慢慢放大并向外漂移 ---------- */
  function spawnBloom(angle) {
    return spawnAtCenter('bloom', ({ el, angle }) => {
      const { tx, ty } = spreadByAngle(angle, 0.38, 0.75);
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    }, angle);
  }

  /* ---------- 随机漂浮：从中心沿角度向外曲线漂浮 ---------- */
  function spawnFloat(angle) {
    return spawnAtCenter('float', ({ el, angle }) => {
      const scale = rand(0.75, 1.0);
      const distance = Math.min(danmakuStage.clientWidth, danmakuStage.clientHeight) * rand(0.40, 0.80);
      const baseX = Math.cos(angle);
      const baseY = Math.sin(angle);

      el.style.setProperty('--tx-a', `${baseX * distance * rand(0.2, 0.4)}px`);
      el.style.setProperty('--ty-a', `${baseY * distance * rand(0.2, 0.4)}px`);
      el.style.setProperty('--tx-b', `${baseX * distance * rand(0.5, 0.8)}px`);
      el.style.setProperty('--ty-b', `${baseY * distance * rand(0.5, 0.8)}px`);
      el.style.setProperty('--tx-c', `${baseX * distance * rand(0.8, 1.1)}px`);
      el.style.setProperty('--ty-c', `${baseY * distance * rand(0.8, 1.1)}px`);
      el.style.setProperty('--tx-d', `${baseX * distance * rand(1.0, 1.4)}px`);
      el.style.setProperty('--ty-d', `${baseY * distance * rand(1.0, 1.4)}px`);
      el.style.setProperty('--scale', `${scale}`);
    }, angle);
  }

  /* ---------- 心跳弹出：从中心弹跳着向外移动 ---------- */
  function spawnPop(angle) {
    return spawnAtCenter('pop', ({ el, angle }) => {
      const { tx, ty } = spreadByAngle(angle, 0.38, 0.72);
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    }, angle);
  }

  /* ---------- 波纹扩散：从中心向外放大扩散，无旋转 ---------- */
  function spawnRipple(angle) {
    return spawnAtCenter('ripple', ({ el, angle }) => {
      const { tx, ty } = spreadByAngle(angle, 0.42, 0.80);
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    }, angle);
  }

  function spawnDanmaku(angle) {
    const mode = getCurrentMode();
    let ok = false;

    switch (mode) {
      case 'explode': ok = spawnExplode(angle); break;
      case 'bloom': ok = spawnBloom(angle); break;
      case 'float': ok = spawnFloat(angle); break;
      case 'pop': ok = spawnPop(angle); break;
      case 'ripple': ok = spawnRipple(angle); break;
    }

    if (ok) maybeSwitchMode();
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
        if (activeDanmakuCount() >= CFG.MAX_ACTIVE_DANMAKU) {
          danmakuTimer = setTimeout(tick, 500);
          return;
        }
        const angle = rand(0, Math.PI * 2);
        spawnDanmaku(angle);
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
