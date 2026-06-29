(function () {
  'use strict';

  /** 每轮展示时长（毫秒），与倒计时、自动切屏一致 */
  const ROUND_MS = 60 * 1000;

  const questionText = document.getElementById('questionText');
  const questionPanel = document.getElementById('questionPanel');
  const danmakuStage = document.getElementById('danmakuStage');
  const timerEl = document.getElementById('timer');
  const dots = document.querySelectorAll('.dot');
  const particlesEl = document.getElementById('particles');

  let currentModuleIndex = 0;
  let moduleTimer = null;
  let countdownTimer = null;
  let danmakuTimer = null;
  let remainingSeconds = ROUND_MS / 1000;
  const LANE_COUNT = 12;
  let commentPool = [];
  let poolIndex = 0;
  let laneState = Array(LANE_COUNT).fill(null);
  let featuredEl = null;

  /* ---------- 工具函数 ---------- */

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

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function nextComment() {
    if (poolIndex >= commentPool.length) {
      commentPool = shuffle(MODULES[currentModuleIndex].comments);
      poolIndex = 0;
    }
    return commentPool[poolIndex++];
  }

  function peekComment() {
    if (poolIndex >= commentPool.length) {
      commentPool = shuffle(MODULES[currentModuleIndex].comments);
      poolIndex = 0;
    }
    return commentPool[poolIndex];
  }

  /* ---------- 背景粒子 ---------- */

  function initParticles() {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = randInt(2, 6);
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${rand(0, 100)}%;
        animation-duration:${rand(8, 20)}s;
        animation-delay:${rand(0, 10)}s;
      `;
      particlesEl.appendChild(p);
    }
  }

  /* ---------- 弹幕 ---------- */

  function resetLanes() {
    laneState = Array(LANE_COUNT).fill(null);
  }

  function getLaneTop(lane) {
    const stageHeight = danmakuStage.clientHeight;
    const laneHeight = stageHeight / LANE_COUNT;
    return lane * laneHeight + laneHeight * 0.1;
  }

  function canSpawnInLane(lane, width, speed) {
    const state = laneState[lane];
    if (!state) return true;

    const stageWidth = danmakuStage.clientWidth;
    const elapsed = (Date.now() - state.startTime) / 1000;
    const currentLeft = stageWidth - state.speed * elapsed;
    const currentRight = currentLeft + state.width;

    // 若新弹幕更快，需等前一条留出足够间距，避免追尾
    const gap = state.featured || width > 400 ? DANMAKU_GAP * 1.5 : DANMAKU_GAP;
    if (currentRight + gap > stageWidth) return false;

  // 同轨道速度不同：若新弹幕更快，检查是否会在轨道内追上前一条
    if (speed > state.speed && elapsed < state.duration) {
      const catchUpTime = (stageWidth - currentRight - gap) / (speed - state.speed);
      if (catchUpTime > 0 && catchUpTime < state.duration - elapsed) {
        return false;
      }
    }

    return true;
  }

  function findAvailableLane(width, speed) {
    const lanes = shuffle([...Array(LANE_COUNT).keys()]);
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

  function spawnDanmaku() {
    const text = peekComment();
    const isFeatured = !featuredEl && Math.random() < DANMAKU_FEATURED_CHANCE;

    const el = document.createElement('div');
    el.className = 'danmaku-item' + (isFeatured ? ' danmaku-featured' : '');
    el.textContent = text;

    const fontSize = isFeatured ? DANMAKU_FEATURED_FONT_SIZE : DANMAKU_FONT_SIZE;
    el.style.fontSize = `${fontSize}rem`;
    el.style.color = isFeatured ? '#ffe066' : DANMAKU_COLORS[randInt(0, DANMAKU_COLORS.length - 1)];

    const width = measureDanmaku(el);
    const speed = rand(DANMAKU_SPEED.min, DANMAKU_SPEED.max);
    const lane = findAvailableLane(width, speed);
    if (lane === -1) return false;

    nextComment();

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
    });

    return true;
  }

  function startDanmaku() {
    stopDanmaku();
    resetLanes();

    const tick = () => {
      spawnDanmaku();
      danmakuTimer = setTimeout(tick, DANMAKU_RETRY_MS);
    };
    tick();
  }

  function stopDanmaku() {
    if (danmakuTimer) {
      clearTimeout(danmakuTimer);
      danmakuTimer = null;
    }
    danmakuStage.innerHTML = '';
    featuredEl = null;
    resetLanes();
  }

  /* ---------- 倒计时 ---------- */

  function startCountdown() {
    remainingSeconds = ROUND_MS / 1000;
    timerEl.textContent = formatTime(remainingSeconds);

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remainingSeconds--;
      timerEl.textContent = formatTime(Math.max(remainingSeconds, 0));
      if (remainingSeconds <= 0) clearInterval(countdownTimer);
    }, 1000);
  }

  /* ---------- 模块切换 ---------- */

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

      questionPanel.classList.remove('fade-out');
      stopDanmaku();
      startDanmaku();
      startCountdown();
    }, 600);
  }

  function nextModule() {
    const next = (currentModuleIndex + 1) % MODULES.length;
    switchModule(next);
  }

  function startModuleLoop() {
    switchModule(0);

    if (moduleTimer) clearInterval(moduleTimer);
    moduleTimer = setInterval(nextModule, ROUND_MS);
  }

  /* ---------- 启动 ---------- */

  function init() {
    timerEl.textContent = formatTime(ROUND_MS / 1000);
    initParticles();
    startModuleLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
