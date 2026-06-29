(function () {
  'use strict';

  /* index3 特效大屏配置：所有弹幕从中心生长并向周边扩散 */
  const CFG = {
    FONT_SIZE: 1.6,
    FEATURED_FONT_SIZE: 2.4,
    FEATURED_CHANCE: 0.05,
    /* 每 2 秒出现一条，同屏 12 条大约 24 秒铺满 */
    RETRY_MS: 2000,
    MAX_ACTIVE_DANMAKU: 12,
    MODULE_PAUSE_MS: 1500,
    /* 每 3 条弹幕切换一次特效模式 */
    MODE_SWITCH_INTERVAL: 3,
    MODES: ['explode', 'bloom', 'float', 'pop', 'spiral'],
    MODE_NAMES: {
      explode: '爆炸飞散',
      bloom: '中心绽放',
      float: '随机漂浮',
      pop: '心跳弹出',
      spiral: '螺旋飞散',
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
      explode: { min: 5, max: 8 },
      bloom: { min: 5.5, max: 8.5 },
      float: { min: 12, max: 17 },
      pop: { min: 5, max: 7.5 },
      spiral: { min: 7, max: 11 },
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

  function getCenter() {
    return {
      cx: danmakuStage.clientWidth * 0.5,
      cy: danmakuStage.clientHeight * 0.5,
    };
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

  /* 空间占位管理：记录每个弹幕的位置/半径/角度，防止中心弹幕拥挤 */
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
    return Math.max(width, height) * 0.55 + 60;
  }

  /* 所有效果都从中心出发，按角度错开，避免同时长在同一方向 */
  function pickAngle(radius) {
    const centerBoxes = activeBoxes.filter((b) => b.fromCenter);
    const minAngleGap = Math.max(0.35, Math.min(0.85, 1.5 - radius / 500));

    for (let i = 0; i < 36; i++) {
      const angle = rand(0, Math.PI * 2);
      let ok = true;
      for (const box of centerBoxes) {
        const diff = Math.abs(angle - box.angle);
        const normalized = Math.min(diff, Math.PI * 2 - diff);
        if (normalized < minAngleGap) {
          ok = false;
          break;
        }
      }
      if (ok) return angle;
    }
    return rand(0, Math.PI * 2);
  }

  function spawnFromCenter(mode, setupFn) {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const { cx, cy } = getCenter();
    const { width, height } = measureDanmaku(el);
    const radius = computeRadius(width, height);
    const angle = pickAngle(radius);

    const distance = Math.min(danmakuStage.clientWidth, danmakuStage.clientHeight);

    nextComment();
    updateProgress();

    const duration = rand(CFG.DURATION[mode].min, CFG.DURATION[mode].max);
    el.classList.add(`mode-${mode}`);
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.animationDuration = `${duration}s`;

    setupFn({ el, cx, cy, angle, distance, radius, isFeatured });

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    addActiveBox({ el, x: cx, y: cy, radius, angle, fromCenter: true });

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
      removeActiveBox(el);
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* ---------- 爆炸飞散：从中心快速向四周炸开 ---------- */
  function spawnExplode() {
    return spawnFromCenter('explode', ({ el, angle, distance }) => {
      const fly = distance * rand(0.35, 0.55);
      const tx = Math.cos(angle) * fly;
      const ty = Math.sin(angle) * fly;
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
      el.style.setProperty('--rotate-mid', `${rand(-25, 25)}deg`);
      el.style.setProperty('--rotate-end', `${rand(-60, 60)}deg`);
    });
  }

  /* ---------- 中心绽放：从中心慢慢放大并向外漂移 ---------- */
  function spawnBloom() {
    return spawnFromCenter('bloom', ({ el, angle, distance }) => {
      const drift = distance * rand(0.18, 0.32);
      const tx = Math.cos(angle) * drift;
      const ty = Math.sin(angle) * drift;
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  /* ---------- 随机漂浮：从中心向外沿随机曲线路径漂浮 ---------- */
  function spawnFloat() {
    return spawnFromCenter('float', ({ el, angle, distance }) => {
      const scale = rand(0.6, 1.0);
      const base = distance * 0.5;

      const mk = (ratio, range) => {
        const a = angle + rand(-0.5, 0.5);
        const r = base * ratio + rand(-range, range);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      };

      const p1 = mk(0.25, 60);
      const p2 = mk(0.55, 90);
      const p3 = mk(0.85, 80);
      const p4 = mk(1.1, 70);

      el.style.setProperty('--tx-a', `${p1.x}px`);
      el.style.setProperty('--ty-a', `${p1.y}px`);
      el.style.setProperty('--rot-a', `${rand(-12, 12)}deg`);
      el.style.setProperty('--tx-b', `${p2.x}px`);
      el.style.setProperty('--ty-b', `${p2.y}px`);
      el.style.setProperty('--rot-b', `${rand(-15, 15)}deg`);
      el.style.setProperty('--tx-c', `${p3.x}px`);
      el.style.setProperty('--ty-c', `${p3.y}px`);
      el.style.setProperty('--rot-c', `${rand(-12, 12)}deg`);
      el.style.setProperty('--tx-d', `${p4.x}px`);
      el.style.setProperty('--ty-d', `${p4.y}px`);
      el.style.setProperty('--rot-d', `${rand(-20, 20)}deg`);
      el.style.setProperty('--scale', `${scale}`);
    });
  }

  /* ---------- 心跳弹出：从中心弹跳着轻微向外移动 ---------- */
  function spawnPop() {
    return spawnFromCenter('pop', ({ el, angle, distance }) => {
      const drift = distance * rand(0.12, 0.25);
      const tx = Math.cos(angle) * drift;
      const ty = Math.sin(angle) * drift;
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
    });
  }

  /* ---------- 螺旋飞散：从中心旋转着向外飞出 ---------- */
  function spawnSpiral() {
    return spawnFromCenter('spiral', ({ el, angle, distance }) => {
      const spiralLoops = 2.5;
      const maxR = distance * rand(0.4, 0.6);
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const ratio = i / steps;
        const r = maxR * ratio;
        const theta = angle + spiralLoops * ratio * Math.PI * 2;
        const tx = Math.cos(theta) * r;
        const ty = Math.sin(theta) * r;
        const rot = theta * (180 / Math.PI) * 0.6;
        el.style.setProperty(`--tx-${i}`, `${tx}px`);
        el.style.setProperty(`--ty-${i}`, `${ty}px`);
        el.style.setProperty(`--rot-${i}`, `${rot}deg`);
      }
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
      case 'spiral': ok = spawnSpiral(); break;
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
