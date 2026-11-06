(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const el = {
    stage: $('#stage'),
    field: $('#field'),
    title: $('#title-screen'),
    hud: $('#hud'),
    pause: $('#pause-screen'),
    results: $('#results'),
    hint: $('#hint'),
    dusk: $('#dusk'),
    altitude: $('#altitude'),
    btnMain: $('#btn-main'),
    btnPause: $('#btn-pause'),
    btnRestart: $('#btn-restart'),
    btnResume: $('#btn-resume'),
    btnPauseRestart: $('#btn-pause-restart'),
    btnAgain: $('#btn-again'),
    btnHome: $('#btn-home'),
    soundBtn: $('#sound-btn'),
    hudPadi: $('#hud-padi'),
    hudTali: $('#hud-tali'),
    hudJarak: $('#hud-jarak'),
    hudSkor: $('#hud-skor'),
    threadFill: $('#thread-fill'),
    routeDot: $('#route-dot'),
    resultEyebrow: $('#result-eyebrow'),
    resultTitle: $('#result-title'),
    resultSub: $('#result-sub'),
    resultSkor: $('#result-skor'),
    resultPadi: $('#result-padi'),
    resultJarak: $('#result-jarak'),
    resultBest: $('#result-best')
  };

  let MB = null;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const DEFAULTS = {
    kecepatan: 170,
    jarak_finish: 1200,
    kemudi: 7,
    tarikan_tali: 3,
    pulih_tali: 2,
    hembusan: 0.34,
    nilai_padi: 60,
    nilai_wajit: 120,
    nilai_angklung: 180,
    nilai_jarak: 0.35,
    jeda_rival: 5.4,
    volume: 0.7,
    aksen: '#B4552F'
  };
  let TUNE = Object.assign({}, DEFAULTS);

  const progress = { schemaVersion: 1, best: 0, plays: 0 };
  let progressReady = false;
  let saveReady = false;

  let mode = 'title';
  let runActive = false;
  let runPaused = false;
  let lastStats = { skor: 0, padi: 0, jarak: 0, tali: 100 };
  let soundOn = true;
  let hintTimer = 0;
  let pendingStart = false;

  const sceneBox = { value: null };

  /* ------------------------------------------------------------------ sound */

  function readSoundPref() {
    try {
      if (MB && MB.sound && typeof MB.sound.on === 'boolean') return MB.sound.on;
    } catch (e) {}
    try {
      return localStorage.getItem('mgsound') !== 'off';
    } catch (e) {
      return true;
    }
  }

  function formatNum(n) {
    try {
      return Math.round(n).toLocaleString('id-ID');
    } catch (e) {
      return String(Math.round(n));
    }
  }

  const UI = {
    sync(s) {
      lastStats = s;
      if (!el.hudPadi) return;
      el.hudPadi.textContent = String(s.padi);
      el.hudTali.textContent = Math.round(s.tali) + '%';
      el.hudJarak.textContent = formatNum(s.jarak) + ' m';
      el.hudSkor.textContent = formatNum(s.skor);
      el.threadFill.style.width = clamp(s.tali, 0, 100) + '%';
      const pct = clamp((s.jarak / Math.max(1, TUNE.jarak_finish)) * 100, 0, 100);
      el.routeDot.style.left = pct + '%';
      el.threadFill.style.background = s.tali < 25
        ? 'linear-gradient(90deg,#8d1f16,#e0623f)'
        : 'linear-gradient(90deg,#9e2f21,#d45135)';
    },

    end(result) {
      if (mode === 'results') return;
      const best = Math.max(progress.best || 0, Math.round(result.skor));
      progress.best = best;
      progress.plays = (progress.plays || 0) + 1;

      if (runActive) {
        if (runPaused) {
          try { MB && MB.run && MB.run.resume && MB.run.resume(); } catch (e) {}
          runPaused = false;
        }
        try {
          if (MB && MB.run && MB.run.end) {
            MB.run.end({
              hasil: result.finish ? 'talaga' : 'tali_putus',
              seconds: Math.round(result.seconds),
              skor: Math.round(result.skor),
              padi: result.padi,
              jarak: Math.round(result.jarak)
            });
          }
        } catch (e) {}
        runActive = false;
      }

      try {
        if (MB && MB.event) {
          MB.event('skor', { value: Math.round(result.skor) });
          if (result.finish) MB.event('sampai_talaga', { skor: Math.round(result.skor), jarak: Math.round(result.jarak) });
          else MB.event('tali_putus', { sebab: result.reason || 'rival', jarak: Math.round(result.jarak) });
        }
      } catch (e) {}

      el.resultEyebrow.textContent = result.finish ? 'Perjalanan selesai' : 'Perjalanan terhenti';
      el.resultTitle.textContent = result.finish ? 'Sampai di Talaga Remis' : 'Tali putus';
      el.resultSub.textContent = result.finish
        ? 'Matahari turun di atas air, layanganmu pulang.'
        : (result.reason === 'tegang'
          ? 'Tali terlalu tegang. Turunkan layangan untuk mengendurkannya.'
          : 'Tali merah layangan lain memotong talimu di udara.');
      el.resultSkor.textContent = formatNum(result.skor);
      el.resultPadi.textContent = formatNum(result.padi);
      el.resultJarak.textContent = formatNum(result.jarak) + ' m';
      el.resultBest.textContent = formatNum(best);

      el.hud.hidden = true;
      el.hint.hidden = true;
      el.pause.hidden = true;
      el.results.hidden = false;
      mode = 'results';
      UI.saveProgress();
    },

    saveProgress() {
      try {
        if (MB && MB.save && saveReady) {
          MB.save('progress', progress).catch(function () {});
        } else {
          localStorage.setItem('mgprogress', JSON.stringify(progress));
        }
      } catch (e) {}
    },

    start() {
      if (mode === 'playing' || mode === 'paused') return;
      if (!sceneBox.value) {
        pendingStart = true;
        return;
      }
      pendingStart = false;
      el.title.hidden = true;
      el.results.hidden = true;
      el.pause.hidden = true;
      el.hud.hidden = false;
      el.hint.hidden = false;
      el.hint.classList.remove('faint');
      el.dusk.style.opacity = '0';
      el.altitude.style.opacity = '0';
      mode = 'playing';
      runActive = true;
      runPaused = false;
      lastStats = { skor: 0, padi: 0, jarak: 0, tali: 100 };
      UI.sync(lastStats);
      if (sceneBox.value) {
        sceneBox.value.unlockAudio();
        sceneBox.value.beginRound();
      }
      try { if (MB && MB.run && MB.run.start) MB.run.start(); } catch (e) {}
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () {
        if (mode === 'playing') el.hint.classList.add('faint');
      }, 9000);
    },

    endActiveRun(reason) {
      if (!runActive) return;
      if (runPaused) {
        try { MB && MB.run && MB.run.resume && MB.run.resume(); } catch (e) {}
        runPaused = false;
      }
      try {
        if (MB && MB.run && MB.run.end) {
          MB.run.end({
            hasil: reason || 'ulangi',
            skor: Math.round(lastStats.skor),
            padi: lastStats.padi,
            jarak: Math.round(lastStats.jarak)
          });
        }
      } catch (e) {}
      runActive = false;
    },

    restart() {
      if (mode === 'paused') {
        el.pause.hidden = true;
        if (sceneBox.value) sceneBox.value.resumeGame();
        try { if (MB && MB.run && MB.run.resume) MB.run.resume(); } catch (e) {}
        runPaused = false;
      }
      if (runActive) UI.endActiveRun('ulangi');
      el.results.hidden = true;
      el.pause.hidden = true;
      mode = 'results';
      UI.start();
    },

    home() {
      el.results.hidden = true;
      el.pause.hidden = true;
      el.hud.hidden = true;
      el.hint.hidden = true;
      el.title.hidden = false;
      el.dusk.style.opacity = '0';
      el.altitude.style.opacity = '0';
      mode = 'title';
      runActive = false;
      if (sceneBox.value) sceneBox.value.toTitle();
    },

    pause() {
      if (mode !== 'playing') return;
      if (sceneBox.value && sceneBox.value.state !== 'playing') return;
      mode = 'paused';
      el.pause.hidden = false;
      el.hint.classList.add('faint');
      if (sceneBox.value) sceneBox.value.pauseGame();
      if (runActive && !runPaused) {
        try { if (MB && MB.run && MB.run.pause) MB.run.pause(); } catch (e) {}
        runPaused = true;
      }
    },

    resume() {
      if (mode !== 'paused') return;
      el.pause.hidden = true;
      mode = 'playing';
      if (sceneBox.value) sceneBox.value.resumeGame();
      if (runActive && runPaused) {
        try { if (MB && MB.run && MB.run.resume) MB.run.resume(); } catch (e) {}
        runPaused = false;
      }
    },

    sceneReady() {
      if (el.btnMain) {
        el.btnMain.disabled = false;
        const label = el.btnMain.querySelector('span');
        if (label) label.textContent = 'MAIN';
      }
      if (pendingStart && mode === 'title') {
        pendingStart = false;
        UI.start();
      }
    },

    setSound(on, save) {
      soundOn = !!on;
      el.soundBtn.classList.toggle('muted', !soundOn);
      el.soundBtn.setAttribute('aria-pressed', String(soundOn));
      el.soundBtn.setAttribute('aria-label', soundOn ? 'Matikan suara' : 'Nyalakan suara');
      el.soundBtn.title = soundOn ? 'Matikan suara' : 'Nyalakan suara';
      if (sceneBox.value) sceneBox.value.setSound(soundOn);
      try {
        if (MB && MB.sound && MB.sound.set) MB.sound.set(soundOn);
      } catch (e) {}
      if (save !== false) {
        try { localStorage.setItem('mgsound', soundOn ? 'on' : 'off'); } catch (e) {}
      }
    }
  };

  /* ------------------------------------------------------------------ boot */

  function applyTuneToCss() {
    const root = document.documentElement;
    if (TUNE.aksen) root.style.setProperty('--clay', TUNE.aksen);
  }

  async function loadTune() {
    let values = null;
    if (MB && MB.tune) {
      try {
        values = await Promise.race([
          MB.tune(),
          new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 1800); })
        ]);
      } catch (e) {
        values = null;
      }
    }
    if (!values) {
      try {
        const res = await fetch('tune.json', { cache: 'no-store' });
        const file = await res.json();
        values = {};
        Object.keys(file).forEach(function (k) {
          const entry = file[k];
          if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
            values[k] = entry.value;
          }
        });
      } catch (e) {
        values = null;
      }
    }
    if (!values) return Object.assign({}, DEFAULTS);
    const merged = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(function (k) {
      if (values[k] !== undefined && values[k] !== null) merged[k] = values[k];
    });
    return merged;
  }

  async function loadProgress() {
    try {
      if (MB && MB.load) {
        const saved = await MB.load('progress');
        progressReady = true;
        saveReady = true;
        if (saved && saved.value && typeof saved.value === 'object') {
          if (typeof saved.value.best === 'number' && isFinite(saved.value.best)) progress.best = saved.value.best;
          if (typeof saved.value.plays === 'number' && isFinite(saved.value.plays)) progress.plays = saved.value.plays;
        }
      } else {
        const raw = localStorage.getItem('mgprogress');
        if (raw) {
          const v = JSON.parse(raw);
          if (v && typeof v.best === 'number') progress.best = v.best;
          if (v && typeof v.plays === 'number') progress.plays = v.plays;
        }
        progressReady = true;
        saveReady = false;
      }
    } catch (e) {
      progressReady = false;
      saveReady = false;
    }
  }

  function attachUI() {
    el.btnMain.addEventListener('click', function () { UI.start(); });
    el.btnPause.addEventListener('click', function () { UI.pause(); });
    el.btnRestart.addEventListener('click', function () { UI.restart(); });
    el.btnResume.addEventListener('click', function () { UI.resume(); });
    el.btnPauseRestart.addEventListener('click', function () { UI.restart(); });
    el.btnAgain.addEventListener('click', function () { UI.restart(); });
    el.btnHome.addEventListener('click', function () { UI.home(); });
    el.soundBtn.addEventListener('click', function () { UI.setSound(!soundOn); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && mode === 'playing' && sceneBox.value && sceneBox.value.state === 'playing') UI.pause();
    });

    window.addEventListener('keydown', function (e) {
      const code = e.code;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
        if (mode === 'title' || mode === 'results') {
          e.preventDefault();
          UI.start();
          return;
        }
        if (mode === 'paused') {
          e.preventDefault();
          UI.resume();
          return;
        }
      }
      if (code === 'Escape' || code === 'KeyP') {
        if (mode === 'playing') {
          e.preventDefault();
          UI.pause();
        } else if (mode === 'paused') {
          e.preventDefault();
          UI.resume();
        }
      }
    });

    document.addEventListener('pointerdown', function unlockOnce() {
      document.removeEventListener('pointerdown', unlockOnce);
      if (sceneBox.value) sceneBox.value.unlockAudio();
      else if (soundOn) pendingAudioUnlock = true;
    }, { once: false });
  }

  let pendingAudioUnlock = false;

  function initialSound() {
    soundOn = readSoundPref();
    UI.setSound(soundOn, false);
    try {
      if (MB && MB.sound && MB.sound.onchange) {
        MB.sound.onchange(function (on) { UI.setSound(on, false); });
      }
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ scene */

  const KITE_FRAMES = {
    glide: { key: 'kite_glide', oy: 0.534 },
    climb: { key: 'kite_climb', oy: 0.5 },
    dive: { key: 'kite_dive', oy: 0.579 },
    flutter1: { key: 'kite_flutter1', oy: 0.59 },
    flutter2: { key: 'kite_flutter2', oy: 0.608 },
    cut: { key: 'kite_cut', oy: 0.567 }
  };

  const PICKUP_META = {
    padi: { key: 'pickup_padi', h: 590, label: '+', sound: 'paper_flutter' },
    angklung: { key: 'pickup_angklung', h: 513, label: '+', sound: 'angklung_chime' },
    wajit: { key: 'pickup_wajit', h: 372, label: '+', sound: 'paper_flutter' }
  };

  const RIVAL_META = {
    green: { key: 'rival_green', h: 376 },
    black: { key: 'rival_black', h: 376 },
    red: { key: 'rival_red', h: 373 }
  };

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return { d: Math.hypot(px - cx, py - cy), x: cx, y: cy, t: t };
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'main' });
    }

    preload() {
      const img = this.load.image.bind(this.load);
      this.load.image('sky', 'assets/sky_ciremai_band.webp');
      this.load.image('far', 'assets/far_terraces_band_seam.webp');
      this.load.image('near', 'assets/near_fields_band_seam.webp');
      this.load.image('mid', 'assets/mid_terraces_band.webp');
      this.load.image('talaga', 'assets/talaga_remis_band.webp');
      this.load.image('kite_glide', 'assets/player_kite_01_glide.webp');
      this.load.image('kite_climb', 'assets/player_kite_02_climb.webp');
      this.load.image('kite_dive', 'assets/player_kite_03_dive.webp');
      this.load.image('kite_flutter1', 'assets/player_kite_04_flutter_1.webp');
      this.load.image('kite_flutter2', 'assets/player_kite_05_flutter_2.webp');
      this.load.image('kite_cut', 'assets/player_kite_06_string_cut_tumble.webp');
      this.load.image('rival_green', 'assets/rival_kites_01_rival_kite_green.webp');
      this.load.image('rival_black', 'assets/rival_kites_02_rival_kite_black.webp');
      this.load.image('rival_red', 'assets/rival_kites_03_rival_kite_red.webp');
      this.load.image('pickup_padi', 'assets/pickups_01_padi_sheaf.webp');
      this.load.image('pickup_angklung', 'assets/pickups_02_angklung.webp');
      this.load.image('pickup_wajit', 'assets/pickups_03_wajit_parcel.webp');
      this.load.image('gust_small', 'assets/gust_curls_01_gust_small.webp');
      this.load.image('gust_medium', 'assets/gust_curls_02_gust_medium.webp');
      this.load.image('gust_large', 'assets/gust_curls_03_gust_large.webp');

      this.load.audio('wind_loop', 'audio/wind_loop.mp3');
      this.load.audio('paper_flutter', 'audio/paper_flutter.mp3');
      this.load.audio('angklung_chime', 'audio/angklung_chime.mp3');
      this.load.audio('string_pluck', 'audio/string_pluck.mp3');
      this.load.audio('gong_soft', 'audio/gong_soft.mp3');

      this.load.on('loaderror', function (file) {
        if (window.console) console.warn('gagal memuat', file && file.src);
      });
    }

    create() {
      sceneBox.value = this;
      this.dpr = DPR;
      this.W = this.scale.width;
      this.H = this.scale.height;
      this.state = 'title';
      this.paused = false;
      this.t = 0;
      this.playSeconds = 0;
      this.skor = 0;
      this.padi = 0;
      this.jarak = 0;
      this.tali = 100;
      this.targetY = this.H * 0.4;
      this.kiteFrame = '';
      this.cutT = 0;
      this.endT = 0;
      this.endReason = '';
      this.flutterClock = 0;
      this.pickupClock = 1.2;
      this.gustClock = 2.4;
      this.rivalClock = 6;
      this.flutterSfxClock = 4;
      this.inGust = false;
      this.gustGlow = 0;
      this.lineSlack = 0.35;
      this.scrollSpeed = 0;
      this.titleClock = 0;
      this.soundOn = soundOn;
      this.soundStarted = false;
      this.spark = null;

      this.keys = { up: false, down: false };
      this.pointerActive = false;
      this.talagaAlpha = 0;
      this.finished = false;

      this.pickups = [];
      this.gusts = [];
      this.rivals = [];
      this.dynamic = [];

      this.makeSpark();
      this.makeLandWash();
      this.buildLayers();

      this.stringGfx = this.add.graphics().setDepth(27);
      this.rivalGfx = this.add.graphics().setDepth(26);
      this.cutLineGfx = this.add.graphics().setDepth(33);

      this.kite = this.add.sprite(this.W * 0.2, this.H * 0.33, 'kite_glide').setDepth(28);
      this.setKiteFrame('glide');
      this.kite.setScale(0.2);

      this.sparks = this.add.particles(0, 0, 'spark', {
        lifespan: 720,
        speed: { min: 35, max: 180 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.0, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 220,
        tint: [0xffe7ad, 0xe4b23c, 0xf2a65a, 0xf7efd6],
        emitting: false
      }).setDepth(41);

      this.layout();
      this.toTitle(true);

      this.bindInput();
      this.scale.on('resize', this.onResize, this);

      window.__state = {
        scene: this,
        get kite() { return this.scene.kite; },
        get bounds() { return { top: this.scene.topBound, bottom: this.scene.bottomBound, left: this.scene.kiteX }; },
        get pos() { return { x: this.scene.kite.x, y: this.scene.kite.y }; }
      };
      window.MG = window.__state;

      this.startWind();
      if (pendingAudioUnlock) {
        pendingAudioUnlock = false;
        this.unlockAudio();
      }
      UI.sceneReady();
    }

    makeSpark() {
      if (this.textures.exists('spark')) return;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffe6a8, 1);
      g.fillCircle(5, 5, 4.5);
      g.generateTexture('spark', 10, 10);
      g.destroy();
    }

    makeLandWash() {
      if (this.textures.exists('landwash')) return;
      const tex = this.textures.createCanvas('landwash', 8, 512);
      const ctx = tex.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#a7c47b');
      grad.addColorStop(0.18, '#79a464');
      grad.addColorStop(0.46, '#517f50');
      grad.addColorStop(0.74, '#31583c');
      grad.addColorStop(1, '#16342a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 512);
      tex.refresh();
    }

    buildLayers() {
      this.sky = this.add.image(0, 0, 'sky').setOrigin(0.5, 0).setDepth(0);
      this.land = this.add.image(0, 0, 'landwash').setOrigin(0.5, 0).setDepth(5);
      this.far = this.add.tileSprite(0, 0, 10, 10, 'far').setOrigin(0.5, 0).setDepth(10);
      this.talaga = this.add.image(0, 0, 'talaga').setOrigin(0.5, 0.15).setDepth(12).setAlpha(0);
      this.huts = [];
      for (let i = 0; i < 2; i++) {
        this.huts.push(this.add.image(0, 0, 'mid').setOrigin(0.5, 0.95).setDepth(14));
      }
      this.near = this.add.tileSprite(0, 0, 10, 10, 'near').setOrigin(0.5, 1).setDepth(32);
      this.haze = this.add.rectangle(0, 0, 10, 10, 0xf7d9a4, 0.16).setOrigin(0, 0.5).setDepth(8);
      this.warmline = this.add.rectangle(0, 0, 10, 3, 0xffdda3, 0.4).setOrigin(0, 0.5).setDepth(9);
    }

    layout() {
      this.W = this.scale.width;
      this.H = this.scale.height;
      this.cssW = this.W / this.dpr;
      this.cssH = this.H / this.dpr;
      this.wide = this.W / this.H > 1.12;
      this.horizon = this.H * (this.wide ? 0.545 : 0.465);
      this.kiteX = this.W * (this.wide ? 0.285 : 0.30);
      this.topBound = Math.max(this.H * (this.wide ? 0.19 : 0.17), 96 * this.dpr);
      this.bottomBound = this.H * (this.wide ? 0.635 : 0.6);
      this.kiteTarget = clamp(this.H * (this.wide ? 0.19 : 0.155), 96 * this.dpr, 360 * this.dpr);
      this.kiteScale = this.kiteTarget / 445;
      this.speed = TUNE.kecepatan * clamp(this.cssW / 1280, 0.55, 1.25) * this.dpr;

      const skyS = Math.max(this.W / 1536, this.H / 1024);
      this.sky.setScale(skyS).setPosition(this.W / 2, 0);

      this.land.setPosition(this.W / 2, this.horizon - 1);
      this.land.setDisplaySize(this.W + 4, this.H - this.horizon + 12);

      const farH = this.H * (this.wide ? 0.27 : 0.245);
      this.far.setSize(this.W + 6, farH);
      this.far.tileScaleX = farH / 315;
      this.far.tileScaleY = farH / 315;
      this.far.setPosition(this.W / 2, this.horizon - farH * 0.30);

      const nearH = this.H * (this.wide ? 0.335 : 0.30);
      this.near.setSize(this.W + 6, nearH);
      this.near.tileScaleX = nearH / 461;
      this.near.tileScaleY = nearH / 461;
      this.near.setPosition(this.W / 2, this.H + 3 * this.dpr);

      const hutH = this.H * (this.wide ? 0.118 : 0.105);
      this.huts.forEach((hut, i) => {
        if (!hut.getData('placed')) {
          hut.setData('placed', true);
          hut.x = this.W * (i === 0 ? 0.78 : 0.28);
        }
        hut.setScale(hutH / 233);
        hut.y = this.horizon + this.H * (this.wide ? 0.155 : 0.14);
      });

      this.talagaScale = (this.H * 0.19) / 162;
      this.talaga.setScale(this.talagaScale);
      this.talaga.y = this.horizon - this.H * 0.005;

      this.haze.setPosition(0, this.horizon + this.H * 0.012);
      this.haze.setSize(this.W, this.H * 0.035);
      this.warmline.setPosition(0, this.horizon + this.H * 0.006);
      this.warmline.setSize(this.W, 2.4 * this.dpr);

      if (this.talagaAlpha === undefined) this.talagaAlpha = 0;
      this.talaga.setAlpha(this.state === 'ending' && this.endReason === 'finish' ? 1 : this.talagaAlpha);

      this.kite.setScale(this.kiteScale);
      if (this.state === 'title') {
        this.titlePose(true);
      } else {
        this.kite.x = this.kiteX;
        this.kite.y = clamp(this.kite.y, this.topBound, this.bottomBound);
        this.targetY = clamp(this.targetY, this.topBound, this.bottomBound);
      }

      this.pickups.forEach((p) => {
        p.baseY = clamp(p.baseY, this.topBound, this.bottomBound);
        p.targetH = this.kiteTarget * p.scaleFactor;
        p.bob = clamp(this.H * 0.018, 4 * this.dpr, 18 * this.dpr);
        p.spr.setScale(p.targetH / p.nativeH);
      });
      this.gusts.forEach((g) => {
        g.targetH = this.kiteTarget * g.scaleFactor;
        g.spr.setScale(g.targetH / g.spr.height);
        g.baseY = clamp(g.baseY, this.topBound, this.bottomBound);
      });
      this.rivals.forEach((r) => {
        r.targetH = this.kiteTarget * 0.62;
        r.yBase = clamp(r.yBase, this.topBound, this.bottomBound * 0.95);
        r.amp = clamp(this.H * 0.055, 12 * this.dpr, 70 * this.dpr);
        r.spr.setScale(r.targetH / r.nativeH);
      });

      if (this.state === 'ending' && this.endReason === 'finish') {
        this.talaga.setAlpha(1);
      }
    }

    onResize() {
      this.layout();
    }

    bindInput() {
      this.input.on('pointerdown', (p) => {
        if (this.state === 'title') return;
        this.pointerActive = true;
        this.targetY = clamp(p.y, this.topBound, this.bottomBound);
      });
      this.input.on('pointermove', (p) => {
        if (this.state !== 'playing') return;
        if (this.pointerActive || !this.sys.game.device.input.touch) {
          this.targetY = clamp(p.y, this.topBound, this.bottomBound);
        }
      });
      this.input.on('pointerup', () => { this.pointerActive = false; });
      this.input.on('gameout', () => { this.pointerActive = false; });

      const down = (e) => {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.keys.up = true; if (this.scrollSpeed !== undefined) e.preventDefault(); }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.keys.down = true; e.preventDefault(); }
      };
      const up = (e) => {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.up = false;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') this.keys.down = false;
      };
      window.addEventListener('keydown', down, { passive: false });
      window.addEventListener('keyup', up);
    }

    /* ---------------------------------------------------------- audio */

    unlockAudio() {
      try {
        if (this.sound && this.sound.context && this.sound.context.state !== 'running') {
          this.sound.context.resume();
        }
      } catch (e) {}
      if (this.soundOn) this.startWind();
    }

    startWind() {
      if (!this.soundOn) return;
      try {
        if (!this.wind) {
          this.wind = this.sound.add('wind_loop', { loop: true, volume: 0 });
        }
        if (!this.wind.isPlaying) this.wind.play({ volume: 0 });
        this.soundStarted = true;
      } catch (e) {}
    }

    setSound(on) {
      this.soundOn = !!on;
      this.sound.mute = !soundOn;
      if (soundOn) {
        this.unlockAudio();
        this.startWind();
      }
    }

    playSfx(key, volume, rate) {
      if (!this.soundOn) return;
      try {
        if (!this.cache.audio.exists(key)) return;
        const s = this.sound.add(key, { volume: volume, rate: rate || 1 });
        s.play();
        s.once('complete', function () { s.destroy(); });
      } catch (e) {}
    }

    /* ---------------------------------------------------------- states */

    toTitle(first) {
      this.state = 'title';
      this.paused = false;
      this.clearDynamic();
      this.talagaAlpha = 0;
      this.talaga.setAlpha(0).setX(this.W * 1.4);
      this.targetY = this.H * 0.34;
      this.titleClock = 0;
      this.inGust = false;
      this.gustGlow = 0;
      if (el.dusk) el.dusk.style.opacity = '0';
      if (this.sparks) this.sparks.killAll();
      this.setKiteFrame('glide');
      this.kite.setScale(this.kiteScale);
      this.titlePose(true);
      this.titlePopulate();
      this.startWind();
      this.soundOn = soundOn;
      this.sound.mute = !soundOn;
    }

    titlePose(instant) {
      const tx = Math.max(this.W * (this.wide ? 0.205 : 0.20), this.kite.displayWidth * 0.5 + 14 * this.dpr);
      const ty = this.H * (this.wide ? 0.31 : 0.65);
      if (instant) {
        this.kite.x = tx;
        this.kite.y = ty;
        this.kite.rotation = -0.14;
      }
    }

    titlePopulate() {
      const specs = [
        { type: 'padi', x: 0.14, y: 0.6 },
        { type: 'wajit', x: 0.83, y: 0.4 },
        { type: 'angklung', x: 0.2, y: 0.56 },
        { type: 'gust', x: 0.68, y: 0.47, size: 'large' },
        { type: 'gust', x: 0.9, y: 0.7, size: 'small' },
        { type: 'rival', x: 1.02, y: 0.24, kind: 'green' },
        { type: 'rival', x: 1.15, y: 0.44, kind: 'black' }
      ];
      specs.forEach((s) => {
        if (s.type === 'rival') this.spawnRival(s.kind, this.W * s.x, this.H * s.y, true);
        else if (s.type === 'gust') this.spawnGust(s.size, this.W * s.x, this.H * s.y, true);
        else this.spawnPickup(s.type, this.W * s.x, this.H * s.y, true);
      });
    }

    beginRound() {
      this.state = 'playing';
      this.paused = false;
      this.skor = 0;
      this.padi = 0;
      this.jarak = 0;
      this.tali = 100;
      this.playSeconds = 0;
      this.cutT = 0;
      this.endT = 0;
      this.endReason = '';
      this.talagaAlpha = 0;
      this.talaga.setAlpha(0).setX(this.W * 1.4);
      this.pickupClock = 0.75;
      this.gustClock = 2.2;
      this.rivalClock = 7.5;
      this.flutterSfxClock = 4;
      this.inGust = false;
      this.gustGlow = 0;
      this.clearDynamic();
      this.kite.x = this.kiteX;
      this.targetY = this.H * 0.42;
      this.kite.y = this.targetY;
      this.kite.rotation = -0.06;
      this.kite.setScale(this.kiteScale);
      this.setKiteFrame('glide');
      if (el.dusk) el.dusk.style.opacity = '0';
      this.startWind();
      this.soundOn = soundOn;
      this.sound.mute = !soundOn;
      this.flutterClock = 0;
      this.flutterAlt = 0;
      this.finished = false;
      this.snapStats();
    }

    pauseGame() {
      this.paused = true;
      this.keys.up = false;
      this.keys.down = false;
      this.pointerActive = false;
    }

    resumeGame() {
      this.paused = false;
    }

    clearDynamic() {
      this.pickups = [];
      this.gusts = [];
      this.rivals = [];
      if (this.dynamic) {
        this.dynamic.forEach(function (o) {
          try { if (o.active) o.destroy(); } catch (e) {}
        });
      }
      this.dynamic = [];
    }

    calmAir() {
      const fade = (spr) => {
        if (!spr || !spr.active) return;
        this.tweens.add({
          targets: spr,
          alpha: 0,
          duration: 520,
          ease: 'Sine.easeIn',
          onComplete: function () { try { spr.destroy(); } catch (e) {} }
        });
      };
      this.pickups.forEach((p) => fade(p.spr));
      this.gusts.forEach((g) => fade(g.spr));
      this.rivals.forEach((r) => fade(r.spr));
      this.pickups = [];
      this.gusts = [];
      this.rivals = [];
      this.dynamic = [];
    }

    snapStats() {
      UI.sync({
        skor: this.skor,
        padi: this.padi,
        jarak: this.jarak,
        tali: this.tali
      });
    }

    /* ---------------------------------------------------------- spawns */

    track(obj) {
      this.dynamic.push(obj);
      return obj;
    }

    spawnPickup(type, x, y, decor) {
      const meta = PICKUP_META[type];
      const targetH = this.kiteTarget * (type === 'padi' ? 0.52 : type === 'angklung' ? 0.46 : 0.4);
      const spr = this.add.image(x, y, meta.key).setDepth(18);
      spr.setScale(targetH / meta.h);
      const entry = {
        spr: spr,
        type: type,
        baseY: y,
        phase: rand(0, Math.PI * 2),
        targetH: targetH,
        nativeH: meta.h,
        scaleFactor: type === 'padi' ? 0.52 : type === 'angklung' ? 0.46 : 0.4,
        bob: clamp(this.H * 0.018, 4 * this.dpr, 18 * this.dpr),
        collected: false,
        decor: !!decor,
        value: type === 'padi' ? TUNE.nilai_padi : type === 'wajit' ? TUNE.nilai_wajit : TUNE.nilai_angklung
      };
      this.pickups.push(entry);
      this.track(spr);
      return entry;
    }

    spawnGust(size, x, y, decor) {
      const keys = { small: 'gust_small', medium: 'gust_medium', large: 'gust_large' };
      const key = keys[size] || 'gust_medium';
      const targetH = this.kiteTarget * (size === 'large' ? 1.25 : size === 'medium' ? 0.82 : 0.5);
      const spr = this.add.image(x, y, key).setDepth(20).setAlpha(0.72);
      spr.setScale(targetH / spr.height);
      spr.setRotation(rand(-0.2, 0.2));
      const entry = {
        spr: spr,
        size: size,
        baseY: y,
        phase: rand(0, Math.PI * 2),
        targetH: targetH,
        scaleFactor: size === 'large' ? 1.25 : size === 'medium' ? 0.82 : 0.5,
        wob: rand(-0.14, 0.14),
        rise: rand(5, 14) * this.dpr,
        decor: !!decor,
        touched: false
      };
      this.gusts.push(entry);
      this.track(spr);
      return entry;
    }

    spawnRival(kind, x, y, decor) {
      const meta = RIVAL_META[kind] || RIVAL_META.green;
      const targetH = this.kiteTarget * 0.62;
      const spr = this.add.image(x, y, meta.key).setDepth(24);
      spr.setScale(targetH / meta.h);
      const entry = {
        spr: spr,
        baseY: y,
        imgY: y,
        phase: rand(0, Math.PI * 2),
        amp: clamp(this.H * 0.055, 12 * this.dpr, 70 * this.dpr),
        targetH: targetH,
        nativeH: meta.h,
        kind: kind,
        decor: !!decor,
        dead: false
      };
      this.rivals.push(entry);
      this.track(spr);
      return entry;
    }

    /* ---------------------------------------------------------- update */

    update(time, delta) {
      const dt = Math.min(delta, 80) / 1000;
      if (this.paused) return;
      this.t += dt;
      this.speed = TUNE.kecepatan * clamp(this.cssW / 1280, 0.55, 1.25) * this.dpr;
      this.scrollSpeed = this.state === 'playing'
        ? this.speed
        : this.state === 'title'
          ? this.speed * 0.34
          : this.speed * 0.25;

      this.scrollLayers(dt, this.scrollSpeed);

      if (this.state === 'title') {
        this.updateTitle(dt);
        this.drawLines();
        this.drawRivalLines();
        return;
      }

      if (this.state === 'playing') {
        this.updatePlaying(dt);
        this.drawLines();
        this.drawRivalLines();
        this.updateHudClock = (this.updateHudClock || 0) + dt;
        if (this.updateHudClock > 0.1) {
          this.updateHudClock = 0;
          this.snapStats();
        }
        return;
      }

      if (this.state === 'ending') {
        this.updateEnding(dt);
        this.drawLines();
        this.drawRivalLines(true);
        return;
      }

      if (this.state === 'results') {
        this.updateResults(dt);
        this.drawLines();
      }
    }

    scrollLayers(dt, speed) {
      if (!this.far || !this.near) return;
      const farPx = speed * 0.11;
      const nearPx = speed * 1.85;
      this.far.tilePositionX += (farPx / Math.max(0.001, this.far.tileScaleX)) * dt;
      this.near.tilePositionX += (nearPx / Math.max(0.001, this.near.tileScaleX)) * dt;

      const hutSpeed = speed * 0.24;
      const hutW = this.huts[0] ? this.huts[0].displayWidth : this.W * 0.2;
      this.huts.forEach((hut) => {
        hut.x -= hutSpeed * dt;
        if (hut.x < -hutW * 0.75) {
          hut.x = this.W + hutW * rand(0.6, 1.5);
          hut.y = this.horizon + this.H * (this.wide ? rand(0.13, 0.17) : rand(0.12, 0.15));
        }
      });

      if (this.state === 'playing' || this.state === 'title') {
        const t = clamp((this.jarak - (TUNE.jarak_finish * 0.78)) / (TUNE.jarak_finish * 0.22), 0, 1);
        this.talagaAlpha = t * t;
        this.talaga.setAlpha(this.talagaAlpha);
        this.talaga.x = this.W * 0.5 + (1 - t) * this.W * 0.42;
      }

      if (this.state === 'ending' && this.endReason === 'finish') {
        this.talagaAlpha = 1;
        this.talaga.setAlpha(1);
        this.talaga.x += (this.W * 0.5 - this.talaga.x) * Math.min(1, dt * 1.4);
      }
    }

    updateTitle(dt) {
      this.titleClock += dt;
      const tx = Math.max(this.W * (this.wide ? 0.205 : 0.20), this.kite.displayWidth * 0.5 + 14 * this.dpr);
      const ty = this.H * (this.wide ? 0.31 : 0.65);
      this.kite.x = tx + Math.sin(this.titleClock * 0.5) * this.W * 0.006;
      this.kite.y = ty + Math.sin(this.titleClock * 0.9) * this.H * 0.018;
      this.kite.rotation = -0.14 + Math.sin(this.titleClock * 0.75) * 0.055;
      this.flutterClock += dt;
      if (this.flutterClock > 0.55) {
        this.flutterClock = 0;
        this.flutterAlt = this.flutterAlt ? 0 : 1;
      }
      this.setKiteFrame(this.flutterAlt ? 'flutter2' : 'flutter1');

      this.moveDecor(dt, 0.34);
      this.fadeWind(dt, 0.14);
    }

    moveDecor(dt, factor) {
      const sp = this.speed * factor;
      this.pickups.forEach((p) => {
        p.spr.x -= sp * dt;
        p.spr.y = p.baseY + Math.sin(this.t * 1.3 + p.phase) * p.bob;
        p.spr.rotation = Math.sin(this.t * 0.9 + p.phase) * 0.05;
        if (p.spr.x < -p.spr.displayWidth) {
          p.spr.x = this.W + p.spr.displayWidth * rand(0.4, 1.4);
          p.baseY = rand(this.topBound, this.bottomBound);
        }
      });
      this.gusts.forEach((g) => {
        g.spr.x -= sp * 0.85 * dt;
        g.spr.y -= g.rise * dt * 0.2;
        g.spr.rotation += g.wob * dt;
        g.spr.alpha = 0.7 + Math.sin(this.t * 1.1 + g.phase) * 0.08;
        if (g.spr.x < -g.spr.displayWidth || g.spr.y < this.topBound - g.spr.displayHeight) {
          g.spr.x = this.W + g.spr.displayWidth * rand(0.4, 1.5);
          g.spr.y = rand(this.topBound + this.H * 0.05, this.bottomBound);
          g.baseY = g.spr.y;
        }
      });
      this.rivals.forEach((r) => {
        r.spr.x -= sp * 1.08 * dt;
        r.spr.y = r.baseY + Math.sin(this.t * 0.8 + r.phase) * r.amp;
        this.faceRival(r, dt);
        if (r.spr.x < -r.spr.displayWidth) {
          r.spr.x = this.W + r.spr.displayWidth * rand(0.7, 1.5);
          r.baseY = rand(this.topBound + this.H * 0.03, this.H * 0.44);
          r.spr.y = r.baseY;
          r.phase = rand(0, Math.PI * 2);
        }
      });
    }

    updatePlaying(dt) {
      this.playSeconds += dt;
      this.jarak += (TUNE.jarak_finish / 70) * dt;
      this.skor += TUNE.nilai_jarak * (TUNE.jarak_finish / 70) * dt;

      const prevY = this.kite.y;
      let keyDir = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      if (keyDir !== 0) {
        this.targetY = clamp(this.targetY + keyDir * this.H * 0.9 * dt, this.topBound, this.bottomBound);
      }

      this.inGust = false;
      let gustHeld = null;
      const kx = this.kite.x;
      const ky = this.kite.y;
      const kr = this.kite.displayWidth * 0.36;

      this.gusts.forEach((g) => {
        const d = Phaser.Math.Distance.Between(kx, ky, g.spr.x, g.spr.y);
        const rr = g.spr.displayWidth * 0.36 + kr;
        if (d < rr) {
          this.inGust = true;
          gustHeld = g;
          g.spr.setAlpha(0.9);
        } else {
          g.spr.setAlpha(0.7 + Math.sin(this.t * 1.1 + g.phase) * 0.07);
        }
      });

      if (this.inGust) {
        this.targetY -= this.H * TUNE.hembusan * dt;
        this.gustGlow = clamp(this.gustGlow + dt * 2.2, 0, 1);
        this.skor += 10 * dt;
      } else {
        this.gustGlow = clamp(this.gustGlow - dt * 1.4, 0, 1);
      }
      this.targetY = clamp(this.targetY, this.topBound, this.bottomBound);
      this.kite.y += (this.targetY - this.kite.y) * Math.min(1, TUNE.kemudi * dt);
      this.kite.y = clamp(this.kite.y, this.topBound, this.bottomBound);

      const vy = (this.kite.y - prevY) / Math.max(dt, 0.001);
      this.lastVy = vy;
      this.lineSlack = clamp(0.4 + vy / (this.H * 0.85), 0.06, 1);
      this.kite.rotation = clamp(-vy * 0.00055, -0.24, 0.24) + Math.sin(this.t * 1.6) * 0.015;

      const climbN = clamp(-vy / (this.H * 0.5), 0, 1);
      const diveN = clamp(vy / (this.H * 0.5), 0, 1);
      if (!this.inGust) {
        this.tali += (-TUNE.tarikan_tali * climbN + TUNE.pulih_tali * diveN - 0.12) * dt;
      } else {
        this.tali += (-0.12 + 0.35 * (1 - climbN)) * dt;
      }
      this.tali = clamp(this.tali, 0, 100);
      if (this.tali <= 0) {
        this.cutString('tegang', this.kite.x, this.kite.y);
        return;
      }

      this.flutterClock += dt;
      if (this.flutterClock > 0.42) {
        this.flutterClock = 0;
        this.flutterAlt = (this.flutterAlt + 1) % 3;
      }
      if (this.kiteFrame !== 'cut') {
        if (vy < -70 * this.dpr) this.setKiteFrame('climb');
        else if (vy > 70 * this.dpr) this.setKiteFrame('dive');
        else this.setKiteFrame(['glide', 'flutter1', 'flutter2'][this.flutterAlt % 3]);
      }

      const alt = clamp((this.bottomBound - this.kite.y) / (this.bottomBound - this.topBound), 0, 1);
      if (el.altitude) el.altitude.style.opacity = String(0.02 + alt * 0.17 + this.gustGlow * 0.035);
      this.fadeWind(dt, 0.16 + climbN * 0.075 + alt * 0.05);

      this.pickupClock -= dt;
      this.gustClock -= dt;
      this.rivalClock -= dt;
      const progress = clamp(this.jarak / TUNE.jarak_finish, 0, 1);
      if (this.pickupClock <= 0) {
        this.pickupClock = rand(1.45, 2.5) * (0.9 + progress * 0.25);
        this.spawnPickup(
          this.rollPickup(),
          this.W + 80 * this.dpr,
          rand(this.topBound + this.H * 0.04, this.bottomBound - this.H * 0.02)
        );
      }
      if (this.gustClock <= 0) {
        this.gustClock = rand(3.1, 5.2);
        const size = pick(['small', 'medium', 'medium', 'large']);
        this.spawnGust(size, this.W + 100 * this.dpr, rand(this.topBound + this.H * 0.03, this.bottomBound - this.H * 0.03));
      }
      if (this.rivalClock <= 0) {
        this.rivalClock = rand(TUNE.jeda_rival * 0.82, TUNE.jeda_rival * 1.35) * (progress > 0.55 ? 0.82 : 1);
        if (this.rivals.filter((r) => !r.dead).length < 2) {
          this.spawnRival(
            pick(['green', 'black', 'red']),
            this.W + 130 * this.dpr,
            rand(this.topBound + this.H * 0.055, this.H * 0.40)
          );
        }
      }

      this.pickups.forEach((p) => {
        p.spr.x -= this.speed * 0.96 * dt;
        p.spr.y = p.baseY + Math.sin(this.t * 1.5 + p.phase) * p.bob;
        p.spr.rotation = Math.sin(this.t * 1.0 + p.phase) * 0.06;
        if (!p.collected) {
          const d = Phaser.Math.Distance.Between(kx, ky, p.spr.x, p.spr.y);
          const rr = p.spr.displayHeight * 0.32 + kr * 0.85;
          if (d < rr) this.collect(p);
        }
      });

      for (let gi = this.gusts.length - 1; gi >= 0; gi--) {
        const g = this.gusts[gi];
        g.spr.x -= this.speed * 0.9 * dt;
        g.spr.y -= g.rise * dt;
        g.spr.rotation += g.wob * dt;
        if (g.spr.x < -g.spr.displayWidth || g.spr.y < this.topBound - g.spr.displayHeight) {
          g.spr.destroy();
          this.gusts.splice(gi, 1);
          const j = this.dynamic.indexOf(g.spr);
          if (j >= 0) this.dynamic.splice(j, 1);
        }
      }

      this.rivals.forEach((r) => {
        r.spr.x -= this.speed * 1.12 * dt;
        r.spr.y = r.baseY + Math.sin(this.t * 0.75 + r.phase) * r.amp;
        this.faceRival(r, dt);
      });

      this.checkRivalCollisions(kx, ky, kr);

      this.pickups = this.pickups.filter((p) => {
        if (p.collected) return false;
        if (p.spr.x < -p.spr.displayWidth * 1.2) {
          p.spr.destroy();
          const j = this.dynamic.indexOf(p.spr);
          if (j >= 0) this.dynamic.splice(j, 1);
          return false;
        }
        return true;
      });
      this.rivals = this.rivals.filter((r) => {
        if (r.spr.x < -r.spr.displayWidth * 1.2) {
          r.spr.destroy();
          const j = this.dynamic.indexOf(r.spr);
          if (j >= 0) this.dynamic.splice(j, 1);
          return false;
        }
        return true;
      });

      this.flutterSfxClock -= dt;
      if (this.flutterSfxClock <= 0) {
        this.flutterSfxClock = rand(4.5, 8);
        this.playSfx('paper_flutter', 0.12, rand(0.9, 1.1));
      }

      if (this.jarak >= TUNE.jarak_finish) {
        this.finishRun();
      }
    }

    faceRival(r, dt) {
      const target = Math.sin(this.t * 0.75 + r.phase) * 0.12 - 0.05;
      r.spr.rotation += (target - r.spr.rotation) * Math.min(1, dt * 3);
    }

    rollPickup() {
      const r = Math.random();
      if (r < 0.62) return 'padi';
      if (r < 0.84) return 'wajit';
      return 'angklung';
    }

    collect(p) {
      p.collected = true;
      this.padi += p.type === 'padi' ? 1 : 0;
      this.skor += p.value;
      if (p.type === 'angklung') this.tali = clamp(this.tali + 14, 0, 100);

      this.sparks.explode(14, p.spr.x, p.spr.y);
      this.playSfx(p.type === 'angklung' ? 'angklung_chime' : 'paper_flutter', p.type === 'angklung' ? 0.42 : 0.16, rand(0.95, 1.06));

      const label = this.add.text(p.spr.x, p.spr.y - p.spr.displayHeight * 0.3, '+' + Math.round(p.value), {
        fontFamily: 'Chivo Mono, monospace',
        fontSize: Math.round(15 * this.dpr) + 'px',
        color: '#ffe9b8',
        stroke: '#0e2a33',
        strokeThickness: Math.round(3 * this.dpr)
      }).setOrigin(0.5).setDepth(42);
      this.tweens.add({
        targets: label,
        y: label.y - this.H * 0.075,
        alpha: 0,
        duration: 850,
        ease: 'Cubic.easeOut',
        onComplete: function () { label.destroy(); }
      });

      this.snapStats();
      p.spr.destroy();
      const j = this.dynamic.indexOf(p.spr);
      if (j >= 0) this.dynamic.splice(j, 1);
    }

    checkRivalCollisions(kx, ky, kr) {
      for (let i = 0; i < this.rivals.length; i++) {
        const r = this.rivals[i];
        if (r.dead) continue;
        const w = r.spr.displayWidth;
        const h = r.spr.displayHeight;
        const sx = r.spr.x + w * 0.2;
        const sy = r.spr.y + h * 0.25;
        const ex = this.W + 30 * this.dpr;
        const ey = sy + this.H * 0.72;
        const hit = distToSegment(kx, ky, sx, sy, ex, ey);
        if (hit.d < kr * 0.86 + 3 * this.dpr) {
          this.cutString('rival', hit.x, hit.y);
          return;
        }
      }
    }

    cutString(reason, x, y) {
      if (this.state !== 'playing') return;
      this.state = 'ending';
      this.endReason = reason;
      this.calmAir();
      this.cutT = 0;
      this.endT = 0;
      this.setKiteFrame('cut');
      this.cutVy = -this.H * 0.2;
      this.cutVx = -this.W * 0.06;
      this.cutSpin = 2.2;
      this.cutX = x;
      this.cutY = y;
      this.finished = false;
      this.tali = 0;
      this.lastVy = 0;
      this.lineSlack = 0.2;
      if (el.hint) el.hint.hidden = true;

      const flash = this.add.circle(x, y, 9 * this.dpr, 0xfff7df, 1).setDepth(45);
      this.tweens.add({
        targets: flash,
        scale: 5.5,
        alpha: 0,
        duration: 320,
        ease: 'Cubic.easeOut',
        onComplete: function () { flash.destroy(); }
      });
      this.cameras.main.shake(170, 0.006);
      this.playSfx('string_pluck', 0.62, 1);
      this.fadeWind(0.05, 0, true);
      if (el.dusk) el.dusk.style.opacity = '0.5';
      this.targetY = this.kite.y;
      this.snapStats();
    }

    finishRun() {
      if (this.state !== 'playing') return;
      this.state = 'ending';
      this.endReason = 'finish';
      this.calmAir();
      this.endT = 0;
      this.talagaAlpha = 1;
      this.talaga.setAlpha(1);
      this.playSfx('gong_soft', 0.42, 1);
      if (el.dusk) el.dusk.style.opacity = '0.44';
      this.tweens.add({
        targets: this.kite,
        x: this.W * 0.44,
        y: this.H * 0.35,
        rotation: 0,
        duration: 1700,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: this.talaga,
        x: this.W * 0.5,
        duration: 1700,
        ease: 'Sine.easeInOut'
      });
      this.targetY = this.H * 0.35;
      if (el.hint) el.hint.hidden = true;
      this.snapStats();
    }

    updateEnding(dt) {
      this.endT += dt;
      this.cutT += dt;
      if (this.endReason === 'finish') {
        this.kite.y += (this.H * 0.35 - this.kite.y) * Math.min(1, dt * 1.8);
        this.kite.rotation += (0 - this.kite.rotation) * Math.min(1, dt * 2);
        this.setKiteFrame('glide');
        this.fadeWind(dt, 0.07);
        if (this.endT > 2.3 && !this.finished) {
          this.finished = true;
          this.state = 'results';
          this.finalize(true);
        }
      } else {
        this.cutVy += this.H * 1.2 * dt;
        this.kite.x += this.cutVx * dt;
        this.kite.y += this.cutVy * dt;
        this.kite.rotation += this.cutSpin * dt;
        this.kite.x = clamp(this.kite.x, -this.W * 0.2, this.W * 1.1);
        this.fadeWind(dt, 0);
        if (this.endT > 1.65 && !this.finished) {
          this.finished = true;
          this.state = 'results';
          this.finalize(false);
        }
      }
    }

    updateResults(dt) {
      this.fadeWind(dt, 0.05);
      this.gusts.forEach((g) => {
        g.spr.x -= this.speed * 0.1 * dt;
        g.spr.rotation += g.wob * dt * 0.3;
      });
    }

    finalize(finish) {
      this.finished = false;
      UI.end({
        skor: this.skor,
        padi: this.padi,
        jarak: this.jarak,
        tali: this.tali,
        seconds: this.playSeconds,
        finish: finish,
        reason: this.endReason
      });
    }

    fadeWind(dt, target, immediate) {
      if (!this.wind || !this.wind.isPlaying) return;
      const wanted = this.soundOn ? target * TUNE.volume : 0;
      const k = immediate ? 1 : Math.min(1, dt * 2.2);
      this.wind.volume += (wanted - this.wind.volume) * k;
      if (this.wind.volume < 0.002 && !this.soundOn) {
        this.wind.volume = 0;
      }
    }

    setKiteFrame(name) {
      if (this.kiteFrame === name) return;
      const f = KITE_FRAMES[name];
      if (!f) return;
      this.kiteFrame = name;
      this.kite.setTexture(f.key);
      this.kite.setOrigin(0.5, f.oy);
    }

    drawLines() {
      if (!this.stringGfx || !this.kite) return;
      const g = this.stringGfx;
      g.clear();

      const w = this.kite.displayWidth;
      const h = this.kite.displayHeight;
      const sx = this.kite.x - w * 0.34;
      const sy = this.kite.y + h * 0.25;

      if ((this.state === 'ending' || this.state === 'results') && this.endReason === 'rival') {
        this.drawCutLine(g, sx, sy);
        return;
      }

      const slack = this.state === 'playing' ? (this.lineSlack === undefined ? 0.35 : this.lineSlack) : 0.35;
      const ax = this.W * 0.02;
      const ay = this.H * 1.1;
      const sag = this.H * (0.015 + slack * 0.13);
      const cxp = sx + (ax - sx) * 0.42 + this.W * 0.06;
      const cyp = sy + (ay - sy) * 0.5 + sag * 0.45;

      g.lineStyle(2.2 * this.dpr, 0x8f2419, 0.28);
      const pts = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const mt = 1 - t;
        pts.push(new Phaser.Math.Vector2(
          mt * mt * sx + 2 * mt * t * cxp + t * t * ax,
          mt * mt * sy + 2 * mt * t * cyp + t * t * ay
        ));
      }
      g.strokePoints(pts, false);
      g.lineStyle(1.15 * this.dpr, 0xb63a2b, 0.9);
      g.strokePoints(pts, false);
    }

    drawCutLine(g, sx, sy) {
      const t = this.cutT || 0;
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        pts.push(new Phaser.Math.Vector2(
          sx - u * this.W * 0.22 + Math.sin(u * 9 + t * 15) * this.W * 0.012 * u,
          sy - u * this.H * 0.18 + Math.cos(u * 7 + t * 12) * this.H * 0.02 * u
        ));
      }
      g.lineStyle(2.2 * this.dpr, 0x8f2419, 0.3);
      g.strokePoints(pts, false);
      g.lineStyle(1.2 * this.dpr, 0xb63a2b, 0.9);
      g.strokePoints(pts, false);
    }

    drawRivalLines(dim) {
      if (!this.rivalGfx) return;
      const g = this.rivalGfx;
      g.clear();
      if (this.state === 'ending' && this.endReason === 'rival') {
        return;
      }
      this.rivals.forEach((r) => {
        if (!r.spr || !r.spr.active) return;
        const w = r.spr.displayWidth;
        const h = r.spr.displayHeight;
        const sx = r.spr.x + w * 0.2;
        const sy = r.spr.y + h * 0.25;
        const ex = this.W + 30 * this.dpr;
        const ey = sy + this.H * 0.72;
        g.lineStyle(5.5 * this.dpr, 0x3a1712, 0.22);
        g.lineBetween(sx, sy, ex, ey);
        g.lineStyle(2.1 * this.dpr, 0xb73022, 0.96);
        g.lineBetween(sx, sy, ex, ey);
        // a small knot of thread at the kite corner
        g.fillStyle(0xd14834, 1);
        g.fillCircle(sx, sy, 2.4 * this.dpr);
      });
    }
  }

  /* ------------------------------------------------------------------ init */

  async function waitForSDK() {
    const start = Date.now();
    while (!window.mindblown && Date.now() - start < 1400) {
      await new Promise(function (r) { setTimeout(r, 70); });
    }
    MB = window.mindblown || null;
  }

  async function init() {
    await waitForSDK();
    TUNE = await loadTune();
    applyTuneToCss();
    loadProgress();

    initialSound();
    attachUI();

    const rect = el.stage.getBoundingClientRect();
    const gw = Math.max(320, Math.round(rect.width * DPR));
    const gh = Math.max(480, Math.round(rect.height * DPR));

    if (!window.Phaser) {
      const intro = document.querySelector('.intro');
      if (intro) intro.textContent = 'Mesin game belum termuat. Muat ulang halaman.';
      return;
    }

    const config = {
      type: Phaser.AUTO,
      parent: 'field',
      transparent: true,
      width: gw,
      height: gh,
      scale: { mode: Phaser.Scale.NONE, width: gw, height: gh },
      render: {
        antialias: true,
        roundPixels: false,
        powerPreference: 'high-performance'
      },
      banner: false,
      scene: [GameScene]
    };

    const game = new Phaser.Game(config);
    window.__mgGame = game;

    function fit() {
      const r = el.stage.getBoundingClientRect();
      game.scale.resize(Math.max(320, Math.round(r.width * DPR)), Math.max(480, Math.round(r.height * DPR)));
    }
    window.addEventListener('resize', fit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 180); });

    try {
      if (MB && MB.tune && MB.tune.on) {
        MB.tune.on(function (values) {
          if (!values) return;
          Object.keys(DEFAULTS).forEach(function (k) {
            if (values[k] !== undefined) TUNE[k] = values[k];
          });
          applyTuneToCss();
        });
      }
    } catch (e) {}

    try {
      MB && MB.measure && MB.measure([
        { name: 'sampai_talaga', kind: 'count', label: 'Mencapai Talaga Remis' },
        { name: 'tali_putus', kind: 'count', label: 'Tali putus' },
        { name: 'skor', kind: 'value', label: 'Skor akhir' }
      ]);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
