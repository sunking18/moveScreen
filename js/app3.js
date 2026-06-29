(function () {
  'use strict';

  /* index3 特效大屏配置 */
  const CFG = {
    FONT_SIZE: 1.8,
    FEATURED_FONT_SIZE: 2.6,
    FEATURED_CHANCE: 0.05,
    GAP: 200,
    RETRY_MS: 500,
    LANE_COUNT: 8,
    MODULE_PAUSE_MS: 1500,
    /* 每隔多少条弹幕切换一次特效模式 */
    MODE_SWITCH_INTERVAL: 6,
    /* 特效模式列表 */
    MODES: ['scroll', 'explode', 'float', 'pop'],
    /* 模式显示名称 */
    MODE_NAMES: {
      scroll: '滚动瀑布',
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
    /* 各模式持续时间配置（秒） */
    DURATION: {
      scroll: { min: 7, max: 11 },
      explode: { min: 2.2, max: 3.4 },
      float: { min: 5.5, max: 8.5 },
      pop: { min: 2.8, max: 4.2 },
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
  let laneState = Array(CFG.LANE_COUNT).fill(null);
  let featuredEl = null;
  let switchingModule = false;
  let currentModeIndex = 0;
  let spawnCounter = 0;

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

  function resetLanes() {
    laneState = Array(CFG.LANE_COUNT).fill(null);
  }

  function getLaneTop(lane) {
    const stageHeight = danmakuStage.clientHeight;
    const laneHeight = stageHeight / CFG.LANE_COUNT;
    return lane * laneHeight + laneHeight * 0.12;
  }

  function canSpawnInLane(lane, width, speed) {
    const state = laneState[lane];
    if (!state) return true;

    const stageWidth = danmakuStage.clientWidth;
    const elapsed = (Date.now() - state.startTime) / 1000;
    const currentLeft = stageWidth - state.speed * elapsed;
    const currentRight = currentLeft + state.width;

    const gap = state.featured || width > 400 ? CFG.GAP * 1.5 : CFG.GAP;
    if (currentRight + gap > stageWidth) return false;

    if (speed > state.speed && elapsed < state.duration) {
      const catchUpTime = (stageWidth - currentRight - gap) / (speed - state.speed);
      if (catchUpTime > 0 && catchUpTime < state.duration - elapsed) {
        return false;
      }
    }

    return true;
  }

  function findAvailableLane(width, speed) {
    const lanes = shuffle([...Array(CFG.LANE_COUNT).keys()]);
    for (const lane of lanes) {
      if (canSpawnInLane(lane, width, speed)) return lane;
    }
    return -1;
  }

  function measureDanmaku(el) {
    el.style.visibility = 'hidden';
    el.style.top = '-9999px';
    danmakuStage.appendChild(el);
    const width = el.offsetWidth;
    el.remove();
    el.style.visibility = '';
    el.style.top = '';
    return width;
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
    modeNameEl.parentElement.classList.remove('mode-scroll', 'mode-explode', 'mode-float', 'mode-pop');
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

  /* ---------- 模式：滚动瀑布 ---------- */
  function spawnScroll() {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    const width = measureDanmaku(el);
    const speed = rand(72, 115);
    const lane = findAvailableLane(width, speed);
    if (lane === -1) return false;

    nextComment();
    updateProgress();

    const stageWidth = danmakuStage.clientWidth;
    const duration = (stageWidth + width + 20) / speed;

    el.classList.add('mode-scroll');
    el.dataset.lane = lane;
    el.style.top = `${getLaneTop(lane)}px`;
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    laneState[lane] = {
      width,
      speed,
      duration,
      featured: isFeatured,
      startTime: Date.now(),
      element: el,
    };

    el.addEventListener('animationend', () => {
      if (laneState[lane]?.element === el) laneState[lane] = null;
      if (featuredEl === el) featuredEl = null;
      el.remove();
      checkModuleComplete();
    });

    return true;
  }

  /* ---------- 模式：爆炸飞散 ---------- */
  function spawnExplode() {
    const base = createBaseDanmaku();
    if (!base) return false;
    const { el, isFeatured } = base;

    nextComment();
    updateProgress();

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const duration = rand(CFG.DURATION.explode.min, CFG.DURATION.explode.max);

    /* 从舞台中心出发，随机角度和距离 */
    const angle = rand(0, Math.PI * 2);
    const distance = Math.min(stageWidth, stageHeight) * rand(0.35, 0.55);
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const rotateMid = rand(-25, 25);
    const rotateEnd = rand(-60, 60);

    el.classList.add('mode-explode');
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.style.setProperty('--rotate-mid', `${rotateMid}deg`);
    el.style.setProperty('--rotate-end', `${rotateEnd}deg`);
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
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

    nextComment();
    updateProgress();

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const duration = rand(CFG.DURATION.float.min, CFG.DURATION.float.max);

    /* 随机起点（不贴边太近） */
    const startX = rand(stageWidth * 0.2, stageWidth * 0.8);
    const startY = rand(stageHeight * 0.15, stageHeight * 0.75);

    /* 随机漂浮路径节点 */
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

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
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

    nextComment();
    updateProgress();

    const stageWidth = danmakuStage.clientWidth;
    const stageHeight = danmakuStage.clientHeight;
    const duration = rand(CFG.DURATION.pop.min, CFG.DURATION.pop.max);

    /* 随机中心附近位置 */
    const cx = stageWidth * rand(0.35, 0.65);
    const cy = stageHeight * rand(0.25, 0.65);

    el.classList.add('mode-pop');
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.animationDuration = `${duration}s`;

    danmakuStage.appendChild(el);
    if (isFeatured) featuredEl = el;

    el.addEventListener('animationend', () => {
      if (featuredEl === el) featuredEl = null;
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
      case 'scroll': ok = spawnScroll(); break;
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
    resetLanes();
  }

  function startDanmaku() {
    stopDanmaku();
    resetLanes();
    spawnCounter = 0;
    updateModeIndicator();

    const tick = () => {
      if (hasMoreComments()) {
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

      /* 切换模块时重置为滚动，让节奏更稳 */
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
