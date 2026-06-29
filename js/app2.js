(function () {
  'use strict';

  /* index2 专用配置 */
  const CFG = {
    FONT_SIZE: 1.8,
    FEATURED_FONT_SIZE: 2.4,
    FEATURED_CHANCE: 0.04,
    GAP: 220,
    RETRY_MS: 650,
    SPEED: { min: 72, max: 105 },
    LANE_COUNT: 8,
    /* 马卡龙浅色：白底 +  pastel 边框，文字同色系的柔和深调 */
    DANMAKU_PALETTE: [
      { bg: 'rgba(255, 252, 252, 0.9)', color: '#b88888', border: '#f5d0d0' },
      { bg: 'rgba(252, 253, 255, 0.9)', color: '#7a9ec0', border: '#cce0f5' },
      { bg: 'rgba(252, 255, 253, 0.9)', color: '#7aad8a', border: '#c8ebd4' },
      { bg: 'rgba(253, 252, 255, 0.9)', color: '#a090c0', border: '#ddd0f0' },
      { bg: 'rgba(255, 253, 250, 0.9)', color: '#c4a070', border: '#f5e0c8' },
      { bg: 'rgba(255, 251, 253, 0.9)', color: '#c088a0', border: '#f0d0e0' },
      { bg: 'rgba(251, 255, 255, 0.9)', color: '#70a8a8', border: '#c0e8e8' },
      { bg: 'rgba(252, 252, 255, 0.9)', color: '#8898c0', border: '#d0d8f0' },
    ],
    MODULE_PAUSE_MS: 1200,
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
  let laneState = Array(CFG.LANE_COUNT).fill(null);
  let featuredEl = null;
  let switchingModule = false;

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
    for (let i = 0; i < 24; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = randInt(3, 7);
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${rand(0, 100)}%;
        animation-duration:${rand(12, 24)}s;
        animation-delay:${rand(0, 12)}s;
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
    el.style.boxShadow = '0 2px 10px rgba(148, 163, 184, 0.08)';
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

  function spawnDanmaku() {
    const text = peekComment();
    if (!text) {
      checkModuleComplete();
      return false;
    }

    const isFeatured = !featuredEl && Math.random() < CFG.FEATURED_CHANCE;

    const el = document.createElement('div');
    el.className = 'danmaku-item' + (isFeatured ? ' danmaku-featured' : '');
    el.textContent = text;

    const fontSize = isFeatured ? CFG.FEATURED_FONT_SIZE : CFG.FONT_SIZE;
    el.style.fontSize = `${fontSize}rem`;
    applyDanmakuStyle(el, isFeatured);

    const width = measureDanmaku(el);
    const speed = rand(CFG.SPEED.min, CFG.SPEED.max);
    const lane = findAvailableLane(width, speed);
    if (lane === -1) return false;

    nextComment();
    updateProgress();

    const stageWidth = danmakuStage.clientWidth;
    const duration = (stageWidth + width + 20) / speed;

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
      if (laneState[lane]?.element === el) {
        laneState[lane] = null;
      }
      if (featuredEl === el) featuredEl = null;
      el.remove();
      checkModuleComplete();
    });

    return true;
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

    // 模块刚开始时，前几条弹幕留出更宽间隔，避免一开始扎堆
    let initialSpawns = 0;
    const tick = () => {
      if (hasMoreComments()) {
        spawnDanmaku();
        initialSpawns++;
        const delay = initialSpawns < 4 ? CFG.RETRY_MS * 2 : CFG.RETRY_MS;
        danmakuTimer = setTimeout(tick, delay);
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

      questionPanel.classList.remove('fade-out');
      stopDanmaku();
      startDanmaku();
    }, 600);
  }

  function nextModule() {
    const next = (currentModuleIndex + 1) % MODULES.length;
    switchModule(next);
  }

  function startModuleLoop() {
    switchModule(0);
  }

  function init() {
    initParticles();
    startModuleLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
