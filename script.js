/* ============================================================
   MINA, IN FOCUS
   one question, all of me
   ============================================================ */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let lenis = null;
  let applyFocusMode = null;
  let noiseSignal = 0.18;

  /* ── toast ──────────────────────────────────────────────── */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(message, duration = 2800) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), duration);
  }

  /* ── scroll lock ────────────────────────────────────────── */
  const scrollLocks = new Set();
  function lockScroll(key) {
    if (!scrollLocks.size) {
      root.classList.add('is-locked');
      doc.body.classList.add('is-locked');
      lenis?.stop();
    }
    scrollLocks.add(key);
  }
  function unlockScroll(key) {
    scrollLocks.delete(key);
    if (!scrollLocks.size) {
      root.classList.remove('is-locked');
      doc.body.classList.remove('is-locked');
      lenis?.start();
    }
  }

  /* ── tiny synth ─────────────────────────────────────────── */
  const Sound = (() => {
    let ctx = null;
    let master = null;
    let ambient = null;
    let enabled = false;

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(ctx.destination);
      } catch (err) {
        ctx = null;
      }
      return ctx;
    }

    function resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    function pluck(freq = 440, dur = 0.55, type = 'sine', vol = 0.055) {
      if (!enabled) return;
      const c = ensure();
      if (!c || !master) return;
      resume();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    function startAmbient() {
      if (!enabled) return;
      const c = ensure();
      if (!c || !master) return;
      stopAmbient();
      resume();
      const t = c.currentTime;
      const bus = c.createGain();
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.linearRampToValueAtTime(0.045, t + 1.8);
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 440;
      filter.Q.value = 0.7;
      bus.connect(filter);
      filter.connect(master);

      const oscs = [110, 164.81, 220].map((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = i === 2 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        osc.detune.value = i === 1 ? 6 : -4;
        g.gain.value = i === 2 ? 0.16 : 0.5;
        osc.connect(g);
        g.connect(bus);
        osc.start(t);
        return osc;
      });

      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.frequency.value = 0.055;
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(t);

      ambient = { bus, oscs, lfo };
    }

    function stopAmbient() {
      if (!ambient || !ctx) return;
      const t = ctx.currentTime;
      ambient.bus.gain.cancelScheduledValues(t);
      ambient.bus.gain.setValueAtTime(Math.max(ambient.bus.gain.value, 0.0001), t);
      ambient.bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      ambient.oscs.forEach((osc) => {
        try { osc.stop(t + 0.62); } catch (err) { /* already stopped */ }
      });
      try { ambient.lfo.stop(t + 0.62); } catch (err) { /* already stopped */ }
      ambient = null;
    }

    function toggle() {
      enabled = !enabled;
      if (enabled) {
        ensure();
        resume();
        startAmbient();
        pluck(523.25, 0.7, 'sine', 0.04);
      } else {
        stopAmbient();
      }
      return enabled;
    }

    return {
      pluck,
      toggle,
      resume,
      get enabled() { return enabled; },
    };
  })();

  /* ── reveal on scroll ───────────────────────────────────── */
  function initReveals() {
    const els = $$('.reveal');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ── smooth scroll ──────────────────────────────────────── */
  function initSmoothScroll() {
    if (reduced || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({
      lerp: 0.09,
      wheelMultiplier: 1,
      smoothWheel: true,
      anchors: false,
    });
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add((time) => lenis.raf(time * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
  }

  function scrollToTarget(target) {
    if (!target) return;
    if (lenis) {
      lenis.scrollTo(target, { offset: -84, duration: 1.15 });
    } else {
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ── nav ────────────────────────────────────────────────── */
  function initNav() {
    const nav = $('#site-nav');
    const links = $$('.nav-links a');
    const sections = links
      .map((a) => $(a.getAttribute('href')))
      .filter(Boolean);
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY || root.scrollTop;
      nav?.classList.toggle('is-scrolled', y > 24);
      const probe = y + window.innerHeight * 0.36;
      let activeId = '';
      sections.forEach((section) => {
        const top = section.getBoundingClientRect().top + y;
        if (top <= probe) activeId = section.id;
      });
      links.forEach((a) => {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + activeId);
      });
    }

    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    on(window, 'scroll', requestUpdate, { passive: true });
    on(window, 'resize', requestUpdate);
    update();
  }

  /* ── mobile menu ────────────────────────────────────────── */
  let menuOpen = false;
  let menuOpener = null;

  function openMobileMenu() {
    const menu = $('#mobile-menu');
    const toggle = $('#menu-toggle');
    if (!menu || menuOpen) return;
    menuOpen = true;
    menuOpener = doc.activeElement;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    toggle?.setAttribute('aria-expanded', 'true');
    lockScroll('menu');
    window.setTimeout(() => $('.mobile-links a', menu)?.focus({ preventScroll: true }), 180);
  }

  function closeMobileMenu(returnFocus = true) {
    const menu = $('#mobile-menu');
    const toggle = $('#menu-toggle');
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    toggle?.setAttribute('aria-expanded', 'false');
    unlockScroll('menu');
    if (returnFocus && menuOpener instanceof HTMLElement) menuOpener.focus({ preventScroll: true });
  }

  function initMobileMenu() {
    const toggle = $('#menu-toggle');
    const close = $('#menu-close');
    on(toggle, 'click', openMobileMenu);
    on(close, 'click', () => closeMobileMenu());
    $$('.mobile-links a').forEach((a) => a.addEventListener('click', () => closeMobileMenu(false)));
    on(doc, 'keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) {
        e.preventDefault();
        closeMobileMenu();
      }
    });
  }

  function initAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      if (a.classList.contains('skip-link')) return;
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = $(id);
        if (!target) return;
        e.preventDefault();
        closeMobileMenu(false);
        scrollToTarget(target);
      });
    });
  }

  /* ── custom cursor ──────────────────────────────────────── */
  function initCursor() {
    const cursor = $('#cursor');
    const label = $('#cursor-label');
    if (!cursor) return;
    if (isTouch || reduced) {
      cursor.style.display = 'none';
      return;
    }
    const dot = $('.cursor-dot', cursor);
    const ring = $('.cursor-ring', cursor);
    let x = pointer.x;
    let y = pointer.y;
    let rx = x;
    let ry = y;
    let raf = 0;
    let visible = false;

    function frame() {
      raf = 0;
      rx = lerp(rx, x, 0.18);
      ry = lerp(ry, y, 0.18);
      if (dot) {
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
      }
      if (ring) {
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
      }
      if (Math.abs(rx - x) > 0.1 || Math.abs(ry - y) > 0.1) raf = requestAnimationFrame(frame);
    }

    function queue() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    on(doc, 'pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        cursor.classList.remove('is-hidden');
        rx = x;
        ry = y;
      }
      queue();
    }, { passive: true });

    on(doc, 'pointerover', (e) => {
      const target = e.target instanceof Element ? e.target.closest('[data-cursor]') : null;
      if (!target) return;
      cursor.classList.add('is-active');
      if (label) label.textContent = target.getAttribute('data-cursor') || '';
    });

    on(doc, 'pointerout', (e) => {
      const target = e.target instanceof Element ? e.target.closest('[data-cursor]') : null;
      if (!target) return;
      if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
      cursor.classList.remove('is-active');
      if (label) label.textContent = '';
    });

    on(root, 'mouseleave', () => {
      visible = false;
      cursor.classList.add('is-hidden');
    });
    on(root, 'mouseenter', () => {
      visible = true;
      cursor.classList.remove('is-hidden');
    });
    on(window, 'blur', () => cursor.classList.add('is-hidden'));
    on(window, 'focus', () => cursor.classList.remove('is-hidden'));
  }

  /* ── focus mode ─────────────────────────────────────────── */
  function initFocusMode() {
    const toggle = $('#focus-toggle');
    const overlay = $('#focus-overlay');
    if (!toggle || !overlay || isTouch) return;
    let active = false;

    function place(x, y) {
      overlay.style.setProperty('--fx', x + 'px');
      overlay.style.setProperty('--fy', y + 'px');
    }

    function set(value, announce = true) {
      if (active === value) return;
      active = value;
      doc.body.classList.toggle('focus-mode', active);
      toggle.setAttribute('aria-pressed', String(active));
      const word = $('span', toggle);
      if (word) word.textContent = active ? 'exit' : 'focus';
      if (active) {
        place(pointer.x, pointer.y);
        if (announce) toast('focus mode — move your lens. esc to exit.');
      }
    }

    applyFocusMode = set;

    on(toggle, 'click', () => set(!active));
    on(doc, 'pointermove', (e) => {
      if (active && e.pointerType !== 'touch') place(e.clientX, e.clientY);
    }, { passive: true });
    on(doc, 'keydown', (e) => {
      if (e.key === 'Escape' && active) {
        e.preventDefault();
        set(false, false);
      }
    });
  }

  /* ── signal HUD ─────────────────────────────────────────── */
  function initHud() {
    const hud = $('#signal-hud');
    const fill = $('#hud-fill');
    const num = $('#hud-num');
    if (!hud || !fill || !num) return;
    const hero = $('.hero');
    const footer = $('.footer');
    let last = -1;

    function update() {
      const max = root.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp((window.scrollY || root.scrollTop) / max, 0, 1) : 0;
      const value = Math.round(18 + p * 79);
      if (value !== last) {
        last = value;
        fill.style.width = value + '%';
        num.textContent = value + '%';
      }
      const heroGone = !hero || hero.getBoundingClientRect().bottom <= 0;
      const footerNear = footer ? footer.getBoundingClientRect().top < window.innerHeight : false;
      hud.classList.toggle('is-hidden', !heroGone || footerNear);
    }

    on(window, 'scroll', update, { passive: true });
    on(window, 'resize', update);
    update();
  }

  /* ── hero neural field ──────────────────────────────────── */
  function initHeroCanvas() {
    const canvas = $('#hero-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const section = canvas.parentElement;
    const palette = ['#FF5C45', '#2F5BFF', '#FFC53D', '#8FE3B0', '#C4B5FD'];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let nodes = [];
    let sparks = [];
    let raf = 0;
    let last = 0;
    let visible = true;

    function build() {
      const rect = section.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(clamp((w * h) / 30000, 26, 58));
      nodes = Array.from({ length: count }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        vx: rand(-0.2, 0.2),
        vy: rand(-0.2, 0.2),
        r: rand(1.1, 2.6),
        color: Math.random() < 0.18 ? pick(palette) : '#171512',
        alpha: rand(0.22, 0.52),
      }));
      sparks = [];
      if (reduced) draw(0);
    }

    function draw(dt) {
      ctx.clearRect(0, 0, w, h);
      const rect = section.getBoundingClientRect();
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;

      if (!reduced) {
        const step = dt / 16.67;
        nodes.forEach((n) => {
          n.x += n.vx * step;
          n.y += n.vy * step;
          if (n.x < -24) n.x = w + 24;
          if (n.x > w + 24) n.x = -24;
          if (n.y < -24) n.y = h + 24;
          if (n.y > h + 24) n.y = -24;
          const dx = n.x - px;
          const dy = n.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000 && d2 > 2) {
            const force = (1 - d2 / 14000) * 0.8 * step;
            const d = Math.sqrt(d2);
            n.x += (dx / d) * force;
            n.y += (dy / d) * force;
          }
        });
      }

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 22500) {
            const d = Math.sqrt(d2);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = 'rgba(23, 21, 18, ' + ((1 - d / 150) * 0.14).toFixed(3) + ')';
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      if (!reduced && Math.random() < 0.032 && nodes.length) {
        const source = pick(nodes);
        sparks.push({ x: source.x, y: source.y, r: 2, life: 1 });
      }
      sparks = sparks.filter((s) => s.life > 0);
      sparks.forEach((s) => {
        s.life -= dt * 0.0015;
        s.r += dt * 0.026;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 92, 69, ' + (clamp(s.life, 0, 1) * 0.5).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      nodes.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = n.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function loop(time) {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(48, time - (last || time));
      last = time;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (reduced || raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    build();
    start();

    let resizeTimer = 0;
    on(window, 'resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        if (!reduced) start();
      }, 160);
    });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      }, { rootMargin: '100px' });
      io.observe(section);
    }
  }

  function initHeroIntro() {
    if (reduced || !window.gsap) return;
    const gsap = window.gsap;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.hero-title-line', { yPercent: 26, opacity: 0, duration: 1.05 })
      .from('.hero-title-sub', { y: 28, opacity: 0, duration: 0.8 }, '-=0.72')
      .from('.hero-tagline', { y: 22, opacity: 0, duration: 0.7 }, '-=0.58')
      .from('.hero-lede', { y: 18, opacity: 0, duration: 0.7 }, '-=0.54')
      .from('.hero-actions', { y: 16, opacity: 0, duration: 0.6 }, '-=0.48')
      .from('.hero-status', { y: 12, opacity: 0, duration: 0.55 }, '-=0.44')
      .from('.focus-dial', { scale: 0.9, opacity: 0, duration: 0.95 }, '-=1')
      .from('.hero-stickers .sticker', { opacity: 0, duration: 0.55, stagger: 0.07 }, '-=0.55');
  }

  /* ── dial tilt ──────────────────────────────────────────── */
  function initDial() {
    const dial = $('#focus-dial');
    const stage = $('.hero-visual');
    if (!dial || !stage || isTouch || reduced) return;
    on(stage, 'pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      dial.style.transform = 'perspective(900px) rotateX(' + (-ny * 7).toFixed(2) + 'deg) rotateY(' + (nx * 9).toFixed(2) + 'deg)';
    });
    on(stage, 'pointerleave', () => { dial.style.transform = ''; });
  }

  /* ── draggable stickers ─────────────────────────────────── */
  function initStickers() {
    const shelf = $('.hero-stickers');
    const stickers = $$('.sticker.draggable');
    const reset = $('#sticker-reset');
    if (!stickers.length) return;
    const offsets = new Map();
    let anyMoved = false;

    function applyOffset(sticker) {
      const offset = offsets.get(sticker) || { x: 0, y: 0 };
      sticker.style.setProperty('--tx', offset.x + 'px');
      sticker.style.setProperty('--ty', offset.y + 'px');
    }

    stickers.forEach((sticker) => {
      let dragging = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;

      function begin(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        const origin = offsets.get(sticker) || { x: 0, y: 0 };
        originX = origin.x;
        originY = origin.y;
        sticker.classList.add('is-dragging');
        try { sticker.setPointerCapture(pointerId); } catch (err) { /* no capture */ }
      }

      function move(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 2) anyMoved = true;
        offsets.set(sticker, { x: originX + dx, y: originY + dy });
        applyOffset(sticker);
        if (anyMoved) shelf?.classList.add('is-dirty');
        e.preventDefault();
      }

      function end(e) {
        if (!dragging || (e && e.pointerId !== pointerId)) return;
        dragging = false;
        sticker.classList.remove('is-dragging');
        if (pointerId !== null) {
          try { sticker.releasePointerCapture(pointerId); } catch (err) { /* no capture */ }
        }
        pointerId = null;
      }

      on(sticker, 'pointerdown', begin);
      on(sticker, 'pointermove', move);
      on(sticker, 'pointerup', end);
      on(sticker, 'pointercancel', end);
      on(sticker, 'lostpointercapture', end);

      on(sticker, 'keydown', (e) => {
        const amount = e.shiftKey ? 24 : 10;
        const origin = offsets.get(sticker) || { x: 0, y: 0 };
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -amount;
        else if (e.key === 'ArrowRight') dx = amount;
        else if (e.key === 'ArrowUp') dy = -amount;
        else if (e.key === 'ArrowDown') dy = amount;
        else return;
        e.preventDefault();
        offsets.set(sticker, { x: origin.x + dx, y: origin.y + dy });
        applyOffset(sticker);
        anyMoved = true;
        shelf?.classList.add('is-dirty');
      });
    });

    on(reset, 'click', () => {
      offsets.clear();
      stickers.forEach((sticker) => {
        sticker.style.removeProperty('--tx');
        sticker.style.removeProperty('--ty');
      });
      anyMoved = false;
      shelf?.classList.remove('is-dirty');
      toast('tidied. for now.');
    });
  }

  /* ── timeline fill ──────────────────────────────────────── */
  function initTimeline() {
    const timeline = $('.timeline');
    if (!timeline) return;
    function update() {
      const rect = timeline.getBoundingClientRect();
      const p = clamp((window.innerHeight * 0.82 - rect.top) / (rect.height + window.innerHeight * 0.18), 0, 1);
      timeline.style.setProperty('--fill', p.toFixed(3));
    }
    on(window, 'scroll', update, { passive: true });
    on(window, 'resize', update);
    update();
  }

  /* ── the paper, in one slider ───────────────────────────── */
  function initCleft() {
    const range = $('#cleft-range');
    if (!range) return;
    const gapEl = $('#cleft-gap');
    const crossEl = $('#cleft-cross');
    const sparks = $('#cleft-sparks');
    const label = $('#cleft-label');
    const touch = $('#fiber-touch');
    const pain = $('#fiber-pain');
    const pinch = $('#cleft-pinch');

    function update() {
      const p = clamp(Number(range.value) / 100, 0, 1);
      const gap = Math.round(lerp(120, 2, p));
      const crosstalk = Math.round(lerp(4, 92, Math.pow(p, 0.85)));
      if (gapEl) gapEl.textContent = 'gap ' + gap + ' µm';
      if (crossEl) crossEl.textContent = 'crosstalk ' + crosstalk + '%';
      if (touch) touch.setAttribute('transform', 'translate(0 ' + (p * 20).toFixed(1) + ')');
      if (pain) pain.setAttribute('transform', 'translate(0 ' + (-p * 20).toFixed(1) + ')');
      if (pinch) pinch.setAttribute('transform', 'translate(0 ' + (p * 26).toFixed(1) + ')');
      if (sparks) sparks.style.opacity = p > 0.1 ? String(clamp((p - 0.1) * 1.5, 0, 1)) : '0';
      if (label) label.style.opacity = p > 0.55 ? '1' : '0';
    }

    on(range, 'input', update);
    update();
  }

  /* ── noise field ────────────────────────────────────────── */
  function initNoiseCanvas() {
    const canvas = $('#noise-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const section = canvas.parentElement;
    const palette = ['#FF5C45', '#FFC53D', '#8FE3B0', '#8ED8F8', '#C4B5FD'];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let last = 0;
    let visible = false;

    function build() {
      const rect = section.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(clamp((w * h) / 18000, 70, 170));
      particles = Array.from({ length: count }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.18, 0.75),
        size: rand(0.7, 2.2),
        color: pick(palette),
        seed: rand(0, 100),
      }));
      if (reduced) draw(0);
    }

    function waveY(x, t) {
      return h * 0.56
        + Math.sin(x * 0.012 + t * 0.0011) * (h * 0.052)
        + Math.sin(x * 0.027 - t * 0.0007) * (h * 0.02);
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);
      const sig = clamp(noiseSignal, 0, 1);
      const t = time || 0;

      if (sig > 0.02) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = waveY(x, t);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(143, 227, 176, ' + (0.06 + sig * 0.36).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = waveY(x, t) + Math.sin(x * 0.02 + t * 0.002) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(142, 216, 248, ' + (0.03 + sig * 0.16).toFixed(3) + ')';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      particles.forEach((p) => {
        if (!reduced) {
          p.x += p.speed * 0.32;
          if (p.x > w + 12) p.x = -12;
        }
        const targetY = waveY(p.x, t + p.seed * 38);
        const jitterX = Math.sin(t * 0.001 + p.phase) * 9 * (1 - sig);
        const jitterY = Math.cos(t * 0.0013 + p.phase) * 20 * (1 - sig);
        const y = lerp(p.y + jitterY, targetY, sig * 0.9);
        const x = p.x + jitterX;
        const alpha = (1 - sig) * 0.36 + sig * 0.72;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (sig > 0.55) {
        const glintCount = 5;
        for (let i = 0; i < glintCount; i += 1) {
          const x = ((t * 0.035 + i * (w / glintCount)) % (w + 40)) - 20;
          const y = waveY(x, t);
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFF9EE';
          ctx.globalAlpha = (sig - 0.55) * 1.4;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    function loop(time) {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(48, time - (last || time));
      last = time;
      draw(time);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (reduced || raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    build();

    let resizeTimer = 0;
    on(window, 'resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        if (!reduced) start();
      }, 160);
    });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      }, { rootMargin: '120px' });
      io.observe(section);
    } else {
      visible = true;
      start();
    }
  }

  /* ── the focus knob ─────────────────────────────────────── */
  function initKnob() {
    const knob = $('#focus-knob');
    if (!knob) return;
    const handle = $('#knob-handle');
    const valueEl = $('#knob-value');
    const noiseVal = $('#noise-val');
    const signalVal = $('#signal-val');
    const noiseBar = $('#noise-bar');
    const signalBar = $('#signal-bar');
    const reveal = $('#noise-reveal');
    const auto = $('#auto-focus');
    let value = 18;
    let dragging = false;
    let pointerId = null;
    let lastTick = 18;
    let autoRaf = 0;
    let announced = false;

    function angleFor(v) {
      return -135 + v * 2.7;
    }

    function cancelAuto() {
      if (autoRaf) cancelAnimationFrame(autoRaf);
      autoRaf = 0;
      if (auto) {
        auto.disabled = false;
        auto.textContent = 'show me';
        auto.setAttribute('data-cursor', 'show me');
      }
    }

    function apply(next, options = {}) {
      value = clamp(next, 0, 100);
      const signal = Math.round(value);
      const noise = 100 - signal;
      if (handle) handle.style.transform = 'rotate(' + angleFor(value).toFixed(2) + 'deg)';
      if (valueEl) valueEl.textContent = String(signal);
      if (noiseVal) noiseVal.textContent = noise + '%';
      if (signalVal) signalVal.textContent = signal + '%';
      if (noiseBar) noiseBar.style.width = noise + '%';
      if (signalBar) signalBar.style.width = signal + '%';
      knob.setAttribute('aria-valuenow', String(signal));
      knob.setAttribute('aria-valuetext', 'Noise ' + noise + ' percent, signal ' + signal + ' percent');
      noiseSignal = signal / 100;
      reveal?.classList.toggle('is-on', signal >= 78);
      if (options.sound && Math.abs(signal - lastTick) >= 5) {
        Sound.pluck(220 + signal * 4.2, 0.18, 'triangle', 0.022);
        lastTick = signal;
      }
      if (signal >= 78 && !announced && options.announce) {
        announced = true;
        toast('there it is. the answer was in the noise.');
        Sound.pluck(392, 0.5, 'sine', 0.04);
        window.setTimeout(() => Sound.pluck(587.33, 0.7, 'sine', 0.035), 120);
      }
    }

    function valueFromEvent(e) {
      const rect = knob.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let deg = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
      if (deg > 180) deg -= 360;
      deg = clamp(deg, -135, 135);
      return (deg + 135) / 270 * 100;
    }

    function begin(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancelAuto();
      dragging = true;
      pointerId = e.pointerId;
      try { knob.setPointerCapture(pointerId); } catch (err) { /* no capture */ }
      apply(valueFromEvent(e), { sound: true });
      e.preventDefault();
    }

    function move(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      apply(valueFromEvent(e), { sound: true });
      e.preventDefault();
    }

    function end(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      if (pointerId !== null) {
        try { knob.releasePointerCapture(pointerId); } catch (err) { /* no capture */ }
      }
      pointerId = null;
    }

    on(knob, 'pointerdown', begin);
    on(knob, 'pointermove', move);
    on(knob, 'pointerup', end);
    on(knob, 'pointercancel', end);
    on(knob, 'lostpointercapture', end);

    on(knob, 'keydown', (e) => {
      let next = value;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += 2;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= 2;
      else if (e.key === 'PageUp') next += 10;
      else if (e.key === 'PageDown') next -= 10;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 100;
      else return;
      e.preventDefault();
      cancelAuto();
      apply(next, { sound: true, announce: true });
    });

    on(auto, 'click', () => {
      if (autoRaf) return;
      const from = value >= 94 ? 18 : value;
      if (from !== value) apply(from, { sound: false });
      const to = 96;
      const start = performance.now();
      const duration = 1700;
      if (auto) {
        auto.disabled = true;
        auto.textContent = 'focusing…';
        auto.setAttribute('data-cursor', 'focusing');
      }
      function tick(now) {
        const p = clamp((now - start) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        apply(lerp(from, to, eased), { sound: false });
        if (p < 1) {
          autoRaf = requestAnimationFrame(tick);
        } else {
          autoRaf = 0;
          apply(to, { announce: true });
          if (auto) {
            auto.disabled = false;
            auto.textContent = 'again';
            auto.setAttribute('data-cursor', 'again');
          }
        }
      }
      autoRaf = requestAnimationFrame(tick);
    });

    apply(18);
  }

  /* ── the bridge ─────────────────────────────────────────── */
  function initBridge() {
    const button = $('#bridge-btn');
    if (!button) return;
    const readout = $('#bridge-readout');
    const weightEl = $('#bridge-weight');
    const callout = $('#bridge-callout');
    const flag = $('#bridge-flag');
    const deck = $('#bridge-deck');
    const steps = [10, 20, 30, 40, 45];
    let index = 0;
    let done = false;

    function renderWeight(weight) {
      if (weightEl) {
        weightEl.innerHTML = '<span>' + weight + '</span><small>kg</small>';
        weightEl.classList.add('is-visible');
        weightEl.classList.remove('is-dropping');
        void weightEl.offsetWidth;
        weightEl.classList.add('is-dropping');
        window.setTimeout(() => weightEl.classList.remove('is-dropping'), 650);
      }
      if (deck) deck.style.transform = 'translateY(' + (weight * 0.07).toFixed(2) + 'px)';
    }

    on(button, 'click', () => {
      if (done) {
        index = 0;
        done = false;
        button.textContent = 'add 10 kg';
        if (readout) readout.textContent = 'required: 10 kg';
        weightEl?.classList.remove('is-visible');
        callout?.classList.remove('is-visible');
        flag?.setAttribute('opacity', '0');
        if (deck) deck.style.transform = '';
        toast('again. ten more rebuilds if you want.');
        return;
      }

      const weight = steps[index];
      renderWeight(weight);
      Sound.pluck(110 + index * 26, 0.3, 'triangle', 0.045);

      if (weight === 45) {
        done = true;
        button.textContent = 'rebuild it';
        if (readout) readout.textContent = 'held: 45 kg';
        flag?.setAttribute('opacity', '1');
        callout?.classList.add('is-visible');
        toast('45 kg. a professor asked for my number.');
        window.setTimeout(() => Sound.pluck(440, 0.6, 'sine', 0.04), 140);
      } else {
        index += 1;
        const next = steps[index];
        button.textContent = 'add ' + (next - weight) + ' kg';
        if (readout) readout.textContent = 'load: ' + weight + ' kg';
      }
    });
  }

  /* ── the banana ─────────────────────────────────────────── */
  function initBanana() {
    const project = $('#project-banana');
    const button = $('#banana-btn');
    if (!project || !button) return;
    let peeled = false;

    on(button, 'click', () => {
      peeled = !peeled;
      project.classList.toggle('is-peeled', peeled);
      button.textContent = peeled ? 're-wrap it' : 'peel it';
      Sound.pluck(peeled ? 329.63 : 220, 0.45, 'sine', 0.04);
      if (peeled) toast('banana stems → printable filament. 2nd place at IEEE IC-SIT.');
    });
  }

  /* ── the near-infrared sensor ───────────────────────────── */
  function initSensor() {
    const project = $('#project-sensor');
    const button = $('#sensor-btn');
    const valueEl = $('#sensor-value');
    const statusEl = $('#sensor-status');
    const screenValue = $('#sensor-screen-value');
    const screenStatus = $('#sensor-screen-status');
    const screenDot = $('#sensor-screen-dot');
    if (!project || !button) return;
    let clear = false;

    function render() {
      project.classList.toggle('is-clear', clear);
      if (valueEl) valueEl.textContent = clear ? '96%' : '62%';
      if (statusEl) statusEl.textContent = clear ? 'clear' : 'noisy';
      if (screenValue) {
        screenValue.textContent = clear ? '96%' : '62%';
        screenValue.setAttribute('fill', clear ? '#7BE0AD' : '#FF8A73');
      }
      if (screenStatus) screenStatus.textContent = clear ? 'NIR · clear' : 'NIR · noisy';
      if (screenDot) screenDot.setAttribute('fill', clear ? '#7BE0AD' : '#FF5C45');
      button.textContent = clear ? 'turn noise back on' : 'turn on noise-cancelling';
    }

    on(button, 'click', () => {
      clear = !clear;
      render();
      Sound.pluck(clear ? 523.25 : 174.61, 0.5, 'sine', 0.04);
      if (clear) toast('noise learned. noise subtracted. signal left standing.');
    });
  }

  /* ── the e-waste pH meter ───────────────────────────────── */
  function initMeter() {
    const range = $('#ph-range');
    if (!range) return;
    const liquid = $('#ph-liquid');
    const screen = $('#ph-screen');
    const big = $('#ph-big');

    function update() {
      const value = clamp(Number(range.value), 0, 14);
      const hue = value <= 7
        ? lerp(8, 145, value / 7)
        : lerp(145, 220, (value - 7) / 7);
      const color = 'hsl(' + hue.toFixed(1) + ' 72% 58%)';
      if (liquid) liquid.setAttribute('fill', color);
      const label = value.toFixed(1);
      if (screen) screen.textContent = label;
      if (big) big.textContent = label;
      range.setAttribute('aria-valuetext', label + ' pH');
    }

    on(range, 'input', update);
    update();
  }

  /* ── the aquaponics farm ────────────────────────────────── */
  function initFarm() {
    const project = $('#project-farm');
    const button = $('#farm-btn');
    if (!project || !button) return;
    let feeding = false;
    let timer = 0;

    on(button, 'click', () => {
      if (feeding) return;
      feeding = true;
      project.classList.add('is-feeding');
      button.disabled = true;
      button.textContent = 'feeding…';
      Sound.pluck(392, 0.35, 'sine', 0.035);
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        project.classList.remove('is-feeding');
        feeding = false;
        button.disabled = false;
        button.textContent = 'feed the fish';
        toast('six hours unmanned. still balanced.');
        Sound.pluck(587.33, 0.5, 'sine', 0.035);
      }, 3400);
    });
  }

  /* ── the AI grader ──────────────────────────────────────── */
  function initGrader() {
    const project = $('#project-grader');
    const button = $('#grader-btn');
    const circle = $('#grade-circle');
    if (!project || !button) return;
    let grading = false;
    let graded = false;

    function finish() {
      project.classList.remove('is-grading');
      project.classList.add('is-graded');
      if (circle) circle.textContent = '84';
      grading = false;
      graded = true;
      button.disabled = false;
      button.textContent = 'grade again';
      Sound.pluck(659.25, 0.45, 'sine', 0.04);
      toast('reads it. solves it. marks it. mostly.');
    }

    on(button, 'click', () => {
      if (grading) return;
      if (graded) {
        project.classList.remove('is-graded');
        graded = false;
      }
      grading = true;
      project.classList.add('is-grading');
      button.disabled = true;
      button.textContent = 'reading…';
      if (circle) circle.textContent = '0';

      if (reduced) {
        window.setTimeout(finish, 300);
        return;
      }

      const start = performance.now();
      const duration = 1250;
      function tick(now) {
        const p = clamp((now - start) / duration, 0, 1);
        if (circle) circle.textContent = String(Math.round(p * 84));
        if (p < 1) requestAnimationFrame(tick);
        else finish();
      }
      requestAnimationFrame(tick);
    });
  }

  /* ── nine petals ────────────────────────────────────────── */
  function initGarden() {
    const flower = $('#flower');
    const face = $('#flower-face');
    const readout = $('#club-readout');
    const bee = $('#bee');
    const petals = $$('.petal');
    if (!flower || !petals.length) return;
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
    const played = new Set();
    if (isTouch && readout) readout.textContent = 'tap a petal · each one is a club';

    function moveBee(petal) {
      if (!bee) return;
      const fr = flower.getBoundingClientRect();
      const pr = petal.getBoundingClientRect();
      const dx = (pr.left + pr.width / 2) - (fr.left + fr.width / 2);
      const dy = (pr.top + pr.height / 2) - (fr.top + fr.height / 2);
      bee.style.setProperty('--bx', dx.toFixed(1) + 'px');
      bee.style.setProperty('--by', dy.toFixed(1) + 'px');
      bee.style.setProperty('--br', clamp(dx / 14, -14, 14).toFixed(1) + 'deg');
    }

    petals.forEach((petal, i) => {
      const club = petal.getAttribute('data-club') || 'club';
      const note = Number(petal.getAttribute('data-note') || i);

      function announce() {
        if (readout) readout.textContent = club + ' · club ' + (i + 1) + ' of 9';
      }

      on(petal, 'mouseenter', announce);
      on(petal, 'focus', announce);

      on(petal, 'click', () => {
        if (readout) readout.textContent = club + ' · note ' + (i + 1) + ' of 9';
        petal.classList.add('is-played');
        played.add(petal);
        Sound.pluck(notes[note % notes.length], 0.8, 'sine', 0.055);
        moveBee(petal);
        if (face) {
          face.dataset.mood = played.size >= 9 ? 'star' : played.size >= 3 ? 'note' : 'smile';
        }
        flower.classList.remove('is-awake');
        void flower.offsetWidth;
        flower.classList.add('is-awake');

        if (played.size === petals.length) {
          if (readout) readout.textContent = 'nine clubs · still growing';
          toast('nine petals. nine clubs. one very tired founder.');
          window.setTimeout(() => Sound.pluck(1046.5, 1.1, 'sine', 0.045), 220);
        }
      });
    });

    if (bee) window.requestAnimationFrame(() => moveBee(petals[petals.length - 1]));
  }

  /* ── the candy jar ──────────────────────────────────────── */
  function initCandy() {
    const button = $('#candy-btn');
    const jar = $('#candy-jar');
    const countEl = $('#candy-count');
    if (!button) return;
    const words = ['thank you', 'شكراً', 'merci', 'спасибо', 'danke', 'gracias', 'grazie', 'obrigado', 'ありがとう', '고마워'];
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    let count = 0;

    on(button, 'click', () => {
      count += 1;
      if (countEl) countEl.textContent = 'candies shared: ' + count;
      if (jar) {
        jar.classList.remove('is-wobbling');
        void jar.offsetWidth;
        jar.classList.add('is-wobbling');
      }

      const source = jar || button;
      const rect = source.getBoundingClientRect();
      const float = doc.createElement('span');
      float.className = 'thank-float';
      float.textContent = words[(count - 1) % words.length];
      float.style.left = (rect.left + rect.width * rand(0.28, 0.72)) + 'px';
      float.style.top = (rect.top + rect.height * rand(0.26, 0.42)) + 'px';
      float.style.color = pick(['#171512', '#FF5C45', '#2F5BFF', '#171512']);
      doc.body.appendChild(float);
      window.setTimeout(() => float.remove(), 2000);

      Sound.pluck(notes[(count - 1) % notes.length], 0.55, 'sine', 0.045);

      if (count === 5) toast('a bag of candy on Mouled El-Nabawy. best way I knew to say: welcome home.');
      if (count === 9) toast('nine candies. nine clubs. thank you for taking one.');
    });
  }

  /* ── thank-you notes ────────────────────────────────────── */
  function initNotes() {
    $$('.thank-note').forEach((note) => {
      on(note, 'click', () => {
        const flipped = note.classList.toggle('is-flipped');
        note.setAttribute('aria-pressed', String(flipped));
        Sound.pluck(flipped ? 392 : 293.66, 0.35, 'triangle', 0.03);
      });
    });
  }

  /* ── flashlight poem ────────────────────────────────────── */
  function initFlashlight() {
    const box = $('#flashlight');
    const mask = $('#flashlight-mask');
    const glow = $('#flashlight-glow');
    const hint = $('#flashlight-hint');
    if (!box || !mask || !glow || isTouch) return;
    let raf = 0;
    let mx = 0;
    let my = 0;

    function paint() {
      raf = 0;
      mask.style.setProperty('--mx', mx + 'px');
      mask.style.setProperty('--my', my + 'px');
      glow.style.setProperty('--mx', mx + 'px');
      glow.style.setProperty('--my', my + 'px');
    }

    on(box, 'pointermove', (e) => {
      const rect = box.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
      if (!raf) raf = requestAnimationFrame(paint);
      if (hint) hint.style.opacity = '0';
    }, { passive: true });

    on(box, 'pointerleave', () => {
      if (hint) hint.style.opacity = '';
    });
  }

  /* ── the receipt ────────────────────────────────────────── */
  function initReceipt() {
    const receipt = $('#receipt-card');
    if (!receipt || reduced || !window.gsap || !window.ScrollTrigger) return;
    const gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);
    gsap.from(receipt, {
      clipPath: 'inset(0 0 100% 0)',
      duration: 1.15,
      ease: 'power3.out',
      scrollTrigger: { trigger: receipt, start: 'top 84%', once: true },
      onComplete: () => gsap.set(receipt, { clearProps: 'clipPath' }),
    });
  }

  /* ── copy email ─────────────────────────────────────────── */
  function fallbackCopy(text) {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    doc.body.appendChild(area);
    area.select();
    try { doc.execCommand('copy'); } catch (err) { /* no clipboard */ }
    area.remove();
  }

  function initCopyEmail() {
    const button = $('#copy-email');
    if (!button) return;
    const email = 'minasaied2024@gmail.com';
    const original = button.innerHTML;
    let timer = 0;

    on(button, 'click', () => {
      const done = () => {
        button.textContent = 'copied ✓';
        clearTimeout(timer);
        timer = window.setTimeout(() => { button.innerHTML = original; }, 2200);
        toast('email copied. talk soon.');
        Sound.pluck(659.25, 0.35, 'sine', 0.035);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(done).catch(() => { fallbackCopy(email); done(); });
      } else {
        fallbackCopy(email);
        done();
      }
    });
  }

  /* ── Cairo clock ────────────────────────────────────────── */
  function initClock() {
    const el = $('#cairo-time');
    if (!el) return;
    let formatter = null;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch (err) {
      formatter = null;
    }
    function tick() {
      const now = new Date();
      if (formatter) el.textContent = formatter.format(now);
      else el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.setAttribute('title', 'current time in Cairo');
    }
    tick();
    window.setInterval(tick, 15000);
  }

  /* ── the answer dialog ──────────────────────────────────── */
  function initDialog() {
    const dialog = $('#answer-dialog');
    if (!dialog) return;
    const closeButton = $('#dialog-close');
    let opener = null;

    function openDialog() {
      opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      applyFocusMode?.(false);
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      lockScroll('dialog');
      $('.dialog-paper', dialog)?.scrollTo({ top: 0 });
    }

    function closeDialog() {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
        unlockScroll('dialog');
        opener?.focus({ preventScroll: true });
      }
    }

    $$('[data-open-answer]').forEach((button) => on(button, 'click', openDialog));
    on(closeButton, 'click', closeDialog);
    on(dialog, 'click', (e) => {
      if (e.target === dialog) closeDialog();
    });
    on(dialog, 'close', () => {
      unlockScroll('dialog');
      opener?.focus({ preventScroll: true });
    });
  }

  /* ── sound toggle ───────────────────────────────────────── */
  function initSound() {
    const button = $('#sound-toggle');
    if (!button) return;
    on(button, 'click', () => {
      const enabled = Sound.toggle();
      button.classList.toggle('is-on', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on');
      toast(enabled ? 'sound on. headphones recommended.' : 'sound off. the quiet is nice too.');
    });
  }

  /* ── thank you easter egg ───────────────────────────────── */
  function initEasterEgg() {
    let buffer = '';
    const colors = ['#FF5C45', '#2F5BFF', '#FFC53D', '#8FE3B0', '#C4B5FD', '#8ED8F8', '#FF9ECD'];

    function rain() {
      const layer = $('#candy-rain');
      if (!layer) return;
      const count = reduced ? 8 : 42;
      for (let i = 0; i < count; i += 1) {
        const candy = doc.createElement('span');
        candy.className = 'falling-candy';
        candy.style.left = rand(0, 100).toFixed(2) + '%';
        candy.style.background = pick(colors);
        candy.style.width = rand(9, 18).toFixed(1) + 'px';
        candy.style.height = rand(13, 24).toFixed(1) + 'px';
        candy.style.setProperty('--dur', rand(2.2, 4.2).toFixed(2) + 's');
        candy.style.setProperty('--drift', rand(-90, 90).toFixed(0) + 'px');
        candy.style.animationDelay = rand(0, 0.85).toFixed(2) + 's';
        layer.appendChild(candy);
        window.setTimeout(() => candy.remove(), 6000);
      }
      toast('thank you for reading. have a candy.');
      Sound.pluck(523.25, 0.5, 'sine', 0.045);
      window.setTimeout(() => Sound.pluck(659.25, 0.5, 'sine', 0.04), 130);
      window.setTimeout(() => Sound.pluck(783.99, 0.8, 'sine', 0.04), 260);
    }

    on(doc, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) return;
      if (!e.key || e.key.length !== 1) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-24);
      if (buffer.includes('thank you')) {
        buffer = '';
        rain();
      }
    });

    const mark = $('.footer-mark');
    if (mark) {
      mark.setAttribute('role', 'button');
      mark.setAttribute('tabindex', '0');
      mark.setAttribute('data-cursor', 'thank you');
      mark.setAttribute('aria-label', 'A small thank you');
      on(mark, 'click', rain);
      on(mark, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          rain();
        }
      });
    }
  }

  /* ── magnetic buttons ───────────────────────────────────── */
  function initMagnetic() {
    if (isTouch || reduced || !window.gsap) return;
    const gsap = window.gsap;
    $$('.magnetic').forEach((button) => {
      const setX = gsap.quickTo(button, 'x', { duration: 0.45, ease: 'power3.out' });
      const setY = gsap.quickTo(button, 'y', { duration: 0.45, ease: 'power3.out' });
      on(button, 'pointermove', (e) => {
        const rect = button.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) * 0.14;
        const y = (e.clientY - rect.top - rect.height / 2) * 0.2;
        setX(clamp(x, -7, 7));
        setY(clamp(y, -6, 6));
      });
      on(button, 'pointerleave', () => {
        gsap.to(button, {
          x: 0,
          y: 0,
          duration: 0.45,
          ease: 'power3.out',
          onComplete: () => gsap.set(button, { clearProps: 'transform' }),
        });
      });
    });
  }

  /* ── thursday sleep mode (12 hours) ──────────────────────── */
  let thursdayMode = false;
  function toggleThursdayMode() {
    thursdayMode = !thursdayMode;
    doc.body.classList.toggle('thursday-mode', thursdayMode);
    const toggle = $('#thursday-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(thursdayMode));
      toggle.classList.toggle('is-on', thursdayMode);
    }
    if (thursdayMode) {
      toast('Thursday mode on 🌙: 12 hours of sleep to pay the body back.');
      Sound.pluck(261.63, 0.7, 'sine', 0.05);
      window.setTimeout(() => Sound.pluck(329.63, 0.7, 'sine', 0.04), 140);
      window.setTimeout(() => Sound.pluck(392.00, 0.9, 'sine', 0.04), 280);
    } else {
      toast('day mode on ☀️: back to the lab.');
      Sound.pluck(523.25, 0.4, 'sine', 0.04);
    }
  }

  function initThursdayMode() {
    const toggle = $('#thursday-toggle');
    if (toggle) on(toggle, 'click', toggleThursdayMode);
  }

  /* ── orbit badges ───────────────────────────────────────── */
  function initOrbitBadges() {
    const badges = $$('.orbit-badge');
    if (!badges.length) return;
    badges.forEach((b) => {
      const type = b.getAttribute('data-badge');
      on(b, 'click', (e) => {
        b.classList.remove('is-clicked');
        void b.offsetWidth;
        b.classList.add('is-clicked');
        if (type === 'candy') {
          toast('candy on day one: best way I knew to make STEM feel like home 🍬');
          $('#candy-btn')?.click();
        } else if (type === 'neuron') {
          toast('one sideways question: how does the brain know what to ignore? ⚡');
          Sound.pluck(659.25, 0.4, 'triangle', 0.045);
          window.setTimeout(() => Sound.pluck(880, 0.5, 'sine', 0.04), 100);
        } else if (type === 'bridge') {
          toast('45 kg held. A university professor asked for my number 🌉');
          $('#bridge-btn')?.click();
        } else if (type === 'moon') {
          toggleThursdayMode();
        } else if (type === 'pen') {
          toast('poems, after hours. Scrolling down to the flashlight ✍️');
          const words = $('#words');
          if (words) scrollToTarget(words);
        } else if (type === 'banana') {
          toast('banana stems into 3D filament! 🍌');
          $('#banana-btn')?.click();
        }
      });
    });
  }

  /* ── 3d tilt cards ──────────────────────────────────────── */
  function initTiltCards() {
    if (isTouch || reduced) return;
    const cards = $$('.project.tilt');
    cards.forEach((card) => {
      let raf = 0;
      on(card, 'pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rx = ((y - cy) / cy) * -6.5;
        const ry = ((x - cx) / cx) * 6.5;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            card.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-4px)';
            raf = 0;
          });
        }
      });
      on(card, 'pointerleave', () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        card.style.transform = '';
      });
    });
  }

  /* ── essay interactions & annotations ───────────────────── */
  function initEssayInteractions() {
    const fullEssayText = `One question, all of me.\nBy Mina Saied Attia Rizk\nColorado College · Block Plan supplement\n\nLast year, in eleventh-grade biology, the class was learning how a nerve fires. I asked the opposite question: with so much activity in the body, how does the brain know what to ignore?\n\nI couldn't put it down. For three and a half weeks, I lived inside it — reading until I understood the noise, building a closed-loop core-conductor model of ephaptic crosstalk, testing how space and time sum the interference when a nerve is compressed. I rebuilt the model more times than I can count. Everything else went quiet.\n\nThe result was a sole-authored paper now in second-round review at the Journal of Computational Neuroscience. What stayed with me wasn't the result. It was the quiet: one question, all of me, for as long as it took. That is the luxury I want a Block Plan for.\n\nOutcome: Sole author · second-round peer review · Springer Nature`;

    function copyEssay() {
      const done = () => {
        toast('essay text copied! (though the interactive site is the real story 😉)', 3200);
        Sound.pluck(587.33, 0.4, 'sine', 0.04);
        window.setTimeout(() => Sound.pluck(783.99, 0.5, 'sine', 0.04), 120);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(fullEssayText).then(done).catch(() => { fallbackCopy(fullEssayText); done(); });
      } else {
        fallbackCopy(fullEssayText);
        done();
      }
    }

    on($('#copy-essay-btn'), 'click', copyEssay);
    on($('#copy-essay-btn-top'), 'click', copyEssay);
    on($('#dialog-copy-btn'), 'click', copyEssay);

    const marginCard = $('#margin-note-card');
    const marginText = $('#margin-note-text');
    const annotations = $$('.essay-annotation');

    annotations.forEach((item) => {
      const note = item.getAttribute('data-note') || '';
      function activate() {
        if (marginText && note) marginText.textContent = note;
        marginCard?.classList.add('is-active');
        Sound.pluck(440, 0.2, 'sine', 0.02);
      }
      function deactivate() {
        marginCard?.classList.remove('is-active');
      }
      on(item, 'mouseenter', activate);
      on(item, 'focus', activate);
      on(item, 'mouseleave', deactivate);
      on(item, 'blur', deactivate);
      on(item, 'click', () => {
        activate();
        toast('note pinned 📌');
      });
    });
  }

  /* ── timeline step details ──────────────────────────────── */
  function initTimelineSteps() {
    const steps = $$('.timeline-step');
    const popover = $('#timeline-popover');
    const popText = $('#timeline-popover-text');
    const stepNum = $('#timeline-step-num');
    if (!steps.length) return;

    const pitches = [261.63, 293.66, 329.63, 392.00, 523.25];

    steps.forEach((step, idx) => {
      on(step, 'click', () => {
        steps.forEach((s) => s.classList.remove('is-selected'));
        step.classList.add('is-selected');
        const note = step.getAttribute('data-note');
        if (popText && note) popText.textContent = note;
        if (stepNum) stepNum.textContent = String(idx + 1);
        if (popover) {
          popover.classList.remove('is-pulsing');
          void popover.offsetWidth;
          popover.classList.add('is-pulsing');
        }
        Sound.pluck(pitches[idx % pitches.length], 0.35, 'triangle', 0.035);
      });
    });
  }

  /* ── receipt count-up animation ─────────────────────────── */
  function initReceiptCounters() {
    const nums = $$('.receipt-num');
    if (!nums.length) return;
    let animated = false;

    function runCounters() {
      if (animated) return;
      animated = true;
      nums.forEach((el) => {
        const target = parseFloat(el.getAttribute('data-target') || '0');
        const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        const duration = 1200;
        const start = performance.now();

        function tick(now) {
          const p = clamp((now - start) / duration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const current = (target * eased).toFixed(decimals);
          el.textContent = current;
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = target.toFixed(decimals);
        }
        requestAnimationFrame(tick);
      });
      Sound.pluck(523.25, 0.4, 'sine', 0.03);
    }

    if (window.ScrollTrigger) {
      window.ScrollTrigger.create({
        trigger: '#receipt-card',
        start: 'top 82%',
        once: true,
        onEnter: runCounters,
      });
    } else {
      const io = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          runCounters();
          io.disconnect();
        }
      }, { threshold: 0.2 });
      const card = $('#receipt-card');
      if (card) io.observe(card);
    }
  }

  /* ── words interactive widget ───────────────────────────── */
  function initWordsInteractive() {
    const pill = $('#word-counter-pill');
    const textEl = $('#word-counter-text');
    const footText = $('#words-foot-text');
    const tags = $$('.word-tag');

    const snippets = [
      '60+ published poems on HelloPoetry',
      '14 student speaker talks coached (TEDx Youth)',
      '12,000+ words of STEM campus documentation',
      '4,200 words (sole-authored neural paper)',
      '246 words (this Block Plan supplement)'
    ];
    let sIdx = 0;

    if (pill && textEl) {
      on(pill, 'click', () => {
        sIdx = (sIdx + 1) % snippets.length;
        textEl.textContent = snippets[sIdx];
        Sound.pluck(349.23 + sIdx * 45, 0.35, 'sine', 0.035);
      });
    }

    tags.forEach((tag) => {
      on(tag, 'click', () => {
        const story = tag.getAttribute('data-story');
        if (footText && story) {
          footText.textContent = story;
          footText.style.color = '#FFC53D';
          window.setTimeout(() => { footText.style.color = ''; }, 3500);
        }
        Sound.pluck(440, 0.3, 'sine', 0.035);
      });
    });
  }

  /* ── konami code easter egg ─────────────────────────────── */
  function initKonami() {
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let idx = 0;

    on(doc, 'keydown', (e) => {
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) return;

      if (e.key.toLowerCase() === code[idx].toLowerCase()) {
        idx += 1;
        if (idx === code.length) {
          idx = 0;
          toast('🕹️ KONAMI CODE UNLOCKED! You found the gamer in me (used to stay up till 4 a.m. before STEM took over).', 4500);
          [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            window.setTimeout(() => Sound.pluck(freq, 0.45, 'triangle', 0.05), i * 95);
          });
          const mark = $('.footer-mark');
          mark?.click();
        }
      } else {
        idx = 0;
      }
    });
  }

  /* ── subtle sparkle cursor trail ────────────────────────── */
  function initSparkleTrail() {
    if (isTouch || reduced) return;
    let count = 0;
    const colors = ['#FF5C45', '#FFC53D', '#8FE3B0', '#8ED8F8', '#C4B5FD'];

    on(doc, 'pointermove', (e) => {
      count += 1;
      if (count % 8 !== 0) return;
      const span = doc.createElement('span');
      span.className = 'sparkle-trail';
      span.style.left = (e.clientX + rand(-4, 4)) + 'px';
      span.style.top = (e.clientY + rand(-4, 4)) + 'px';
      const size = rand(3, 6);
      span.style.width = size + 'px';
      span.style.height = size + 'px';
      span.style.background = pick(colors);
      span.style.setProperty('--dx', rand(-18, 18) + 'px');
      span.style.setProperty('--dy', rand(-24, 12) + 'px');
      doc.body.appendChild(span);
      window.setTimeout(() => span.remove(), 900);
    }, { passive: true });
  }

  /* ── go ─────────────────────────────────────────────────── */
  function init() {
    initReveals();
    initSmoothScroll();
    initNav();
    initMobileMenu();
    initAnchors();
    initCursor();
    initFocusMode();
    initHud();
    initHeroCanvas();
    initHeroIntro();
    initDial();
    initStickers();
    initTimeline();
    initCleft();
    initNoiseCanvas();
    initKnob();
    initBridge();
    initBanana();
    initSensor();
    initMeter();
    initFarm();
    initGrader();
    initGarden();
    initCandy();
    initNotes();
    initFlashlight();
    initReceipt();
    initCopyEmail();
    initClock();
    initDialog();
    initSound();
    initEasterEgg();
    initMagnetic();

    /* New playful interactions */
    initThursdayMode();
    initOrbitBadges();
    initTiltCards();
    initEssayInteractions();
    initTimelineSteps();
    initReceiptCounters();
    initWordsInteractive();
    initKonami();
    initSparkleTrail();

    doc.body.classList.add('is-ready');
    doc.fonts?.ready.then(() => window.ScrollTrigger?.refresh());
    on(window, 'load', () => window.ScrollTrigger?.refresh());
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
