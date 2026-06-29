(function () {
  'use strict';

  /* index3 特效大屏配置：弹幕随机从屏幕某处生长，扩散到附近 */
  const CFG = {
    FONT_SIZE: 1.6,
    FEATURED_FONT_SIZE: 2.4,
    FEATURED_CHANCE: 0.05,
    /* 每 1.5 秒出现一条，同屏 25 条大约 37 秒铺满 */
    RETRY_MS: 1500,
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
      explode: { min: 4, max: 6.5 },
      bloom: { min: 5, max: 8 },
      float: { min: 10, max: 14 },
      pop: { min: 4.5, max: 7 },
      ripple: { min: 5, max: 8 },
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

  function updateModeIndicator() {
    const mode = getCurrentMode();
    modeNameEl.textContent = CFG.MODE_NAMES[mode];
    modeNameEl.parentElement.className = 'mode-indicator';
  }

  function maybeSwitchMode() {
    spawnCounter++;
    if (spawnCounter >= CFG.MODE_SWITCH_INTERVAL) {
      spawnCounter = 0;
      currentModeIndex = (currentModeIndex + 1) % CFG.MODES.length;
      updateModeIndicator();
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

  function computeRadius(width, height) {
    return Math.max(width, height) * 0.55 + 50;
  }

  /* 随机找一个不重叠的屏幕位置 */
  function pickRandomPosition(radius) {
    const w = danmakuStage.clientWidth;
    const h = danmakuStage.clientHeight;
    const margin = 0.08;
    let x, y;

    for (let i = 0; i < 45; i++) {
      x = rand(w * margin, w * (1 - margin));
      y = rand(h * margin, h * (1 - margin));
      if (!overlaps(x, y, radius)) return { x, y };
    }

    /* 如果实在找不到，也返回一个随机位置，避免卡死 */
    return { x: rand(w * margin, w * (1 - margin)), y: rand(h * margin, h * (1 - margin)) };
  }

  /* 通用：在随机位置生成弹幕，再扩散到附近 */
  function spawnAtRandom(mode, setupFn) {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const { width, height } = measureDanmaku(el);
    const radius = computeRadius(width, height);
    const { x, y } = pickRandomPosition(radius);

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION[mode].min, CFG.DURATION[mode].max);
    el.classList.add(`mode-${mode}`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.animationDuration = `${duration}s`;

    setupFn({ el, x, y, radius, isFeatured });

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    addActiveBox({ el, x, y, radius });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* 扩散距离：让弹幕只飞到附近，不跨屏 */
  function nearbyOffset() {
    const distance = Math.min(danmakuStage.clientWidth, danmakuStage.clientHeight);
    const angle = rand(0, Math.PI * 2);
    const len = distance * rand(0.08, 0.22);
    return { tx: Math.cos(angle) * len, ty: Math.sin(angle) * len };
  }

  /* ---------- 爆炸扩散：随机位置快速长大并向外弹出 ---------- */
  function spawnExplode() {
    return spawnAtRandom('explode', ({ el }) => {
      const { tx, ty } = nearbyOffset();
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  /* ---------- 轻柔绽放：随机位置慢慢放大并轻微漂移 ---------- */
  function spawnBloom() {
    return spawnAtRandom('bloom', ({ el }) => {
      const { tx, ty } = nearbyOffset();
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  /* ---------- 随机漂浮：随机位置向外沿小范围曲线漂浮 ---------- */
  function spawnFloat() {
    return spawnAtRandom('float', ({ el }) => {
      const scale = rand(0.7, 1.0);
      const range = Math.min(danmakuStage.clientWidth, danmakuStage.clientHeight) * 0.12;

      const mk = () => ({ x: rand(-range, range), y: rand(-range, range) });
      const p1 = mk();
      const p2 = mk();
      const p3 = mk();
      const p4 = mk();

      el.style.setProperty('--tx-a', `${p1.x}px`);
      el.style.setProperty('--ty-a', `${p1.y}px`);
      el.style.setProperty('--tx-b', `${p2.x}px`);
      el.style.setProperty('--ty-b', `${p2.y}px`);
      el.style.setProperty('--tx-c', `${p3.x}px`);
      el.style.setProperty('--ty-c', `${p3.y}px`);
      el.style.setProperty('--tx-d', `${p4.x}px`);
      el.style.setProperty('--ty-d', `${p4.y}px`);
      el.style.setProperty('--scale', `${scale}`);
    });
  }

  /* ---------- 心跳弹出：随机位置弹跳着轻微向外移动 ---------- */
  function spawnPop() {
    return spawnAtRandom('pop', ({ el }) => {
      const { tx, ty } = nearbyOffset();
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  /* ---------- 波纹扩散：随机位置向外放大扩散，无旋转 ---------- */
  function spawnRipple() {
    return spawnAtRandom('ripple', ({ el }) => {
      const { tx, ty } = nearbyOffset();
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  function spawnDanmaku() {
    const mode = getCurrentMode();
    let ok = false;

    switch (mode) {
      case 'explode': ok = spawnExplode(); break;
      case 'bloom': ok = spawnBloom(); break;
      case 'float': ok = spawnFloat(); break;
      case 'pop': ok = spawnPop(); break;
      case 'ripple': ok = spawnRipple(); break;
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
