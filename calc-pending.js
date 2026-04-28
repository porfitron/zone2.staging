/**
 * Zone 2 calculation interstitial (from Claude Design handoff).
 * Timeline-based animation, no React. Matches Zone 2 Calculation Animation.html behavior.
 */
(function () {
  'use strict';

  const DUR = 3.4;
  const Z2_CENTER = 0.2;
  const Z2_LEFT = 0.1;
  const Z2_RIGHT = 0.3;

  const MESSAGES = [
    { text: 'Comparing formulas.', start: 0.55, end: 1.45 },
    { text: 'Finding your range.', start: 1.5, end: 2.3 },
    { text: 'Locking in your sweet spot.', start: 2.35, end: 3.4 }
  ];

  const Easing = {
    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    },
    easeOutCubic(t) {
      return --t * t * t + 1;
    },
    easeInCubic(t) {
      return t * t * t;
    }
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
    return function (t) {
      if (t <= start) return from;
      if (t >= end) return to;
      const local = (t - start) / (end - start);
      return from + (to - from) * ease(local);
    };
  }

  function finderPosAt(t) {
    let finderPos;
    if (t < 0.55) finderPos = 0;
    else if (t < 1.45) {
      const p = (t - 0.55) / (1.45 - 0.55);
      finderPos = Easing.easeInOutCubic(p);
    } else if (t < 2.3) {
      const p = (t - 1.45) / (2.3 - 1.45);
      const base = 1.0 + (Z2_CENTER - 1.0) * Easing.easeInOutCubic(p);
      const wobble = Math.sin(p * Math.PI * 3) * 0.04 * (1 - p);
      finderPos = base + wobble;
    } else if (t < 3.1) {
      const p = (t - 2.3) / (3.1 - 2.3);
      finderPos = Z2_CENTER + (1 - Easing.easeOutCubic(p)) * 0.015;
    } else finderPos = Z2_CENTER;
    return clamp(finderPos, 0, 1);
  }

  function paintFrame(els, t, dims) {
    const { barW, barH, barY } = dims;
    if (!els.strip || !els.bar || !els.beam) return;

    const stripOp = animate({ from: 0, to: 1, start: 0, end: 0.3, ease: Easing.easeOutCubic })(t);
    els.strip.style.opacity = String(stripOp);

    const wordOp = animate({ from: 0, to: 1, start: 0.05, end: 0.4, ease: Easing.easeOutCubic })(t);
    els.wordmark.style.opacity = String(wordOp);

    const barOp = animate({ from: 0, to: 1, start: 0.2, end: 0.55, ease: Easing.easeOutCubic })(t);
    els.bar.style.opacity = String(barOp);

    const finderPos = finderPosAt(t);
    const finderCenterPx = finderPos * barW;

    const settled = animate({ from: 0, to: 1, start: 2.6, end: 3.1, ease: Easing.easeOutCubic })(t);
    const pulse = t > 3.0 ? Math.sin((t - 3.0) * 5) * 0.12 + 0.88 : 1;
    const z2RegionOp = animate({ from: 0, to: 1, start: 2.3, end: 3.0, ease: Easing.easeOutCubic })(t);

    if (els.z2glow) {
      els.z2glow.style.opacity = String(barOp * z2RegionOp * 0.18);
      els.z2glow.style.top = barY - 8 + 'px';
      els.z2glow.style.height = barH + 16 + 'px';
    }

    const beamWidth = 2 + settled * 20;
    const beamOp = barOp * (0.7 + settled * 0.3) * pulse;
    els.beam.style.left = finderCenterPx + 'px';
    els.beam.style.marginLeft = -beamWidth / 2 + 'px';
    els.beam.style.top = barY - 14 + 'px';
    els.beam.style.width = beamWidth + 'px';
    els.beam.style.height = barH + 28 + 'px';
    els.beam.style.opacity = String(beamOp);
    const blurPx = settled > 0.5 ? 0 : 1;
    const glow = 6 + settled * 10;
    els.beam.style.filter = 'blur(' + blurPx + 'px) drop-shadow(0 0 ' + glow + 'px var(--cp-cyan, #00B4D8))';

    const showBrackets = settled > 0.1;
    const bOp = barOp * settled * 0.7;
    if (els.bracketL && els.bracketR) {
      els.bracketL.style.opacity = showBrackets ? String(bOp) : '0';
      els.bracketR.style.opacity = showBrackets ? String(bOp) : '0';
      els.bracketL.style.top = barY - 18 + 'px';
      els.bracketR.style.top = barY - 18 + 'px';
      els.bracketL.style.height = barH + 36 + 'px';
      els.bracketR.style.height = barH + 36 + 'px';
    }

    for (let i = 0; i < 5; i++) {
      const lab = els.labels[i];
      if (!lab) continue;
      const isZ2 = i === 1;
      const labelOp = barOp * (isZ2 ? 0.4 + z2RegionOp * 0.6 : 0.35 - z2RegionOp * 0.2);
      lab.style.opacity = String(labelOp);
    }

    MESSAGES.forEach((msg, i) => {
      const line = els.msgLines[i];
      if (!line) return;
      const inOp = animate({ from: 0, to: 1, start: msg.start, end: msg.start + 0.22, ease: Easing.easeOutCubic })(t);
      const outOp = animate({ from: 1, to: 0, start: msg.end - 0.18, end: msg.end, ease: Easing.easeInCubic })(t);
      const op = Math.min(inOp, outOp);
      const ty = (1 - Math.min(inOp, 1)) * 7;
      line.textContent = msg.text;
      line.style.opacity = op <= 0.01 ? '0' : String(op);
      line.style.transform = 'translateY(' + ty + 'px)';
    });

    const dotMasterIn = animate({ from: 0, to: 1, start: 0.5, end: 0.8, ease: Easing.easeOutCubic })(t);
    const dotMasterOut = animate({ from: 1, to: 0, start: 3.0, end: 3.3, ease: Easing.easeInCubic })(t);
    const masterOp = dotMasterIn * dotMasterOut;
    if (els.dotsWrap) els.dotsWrap.style.opacity = String(masterOp);
    for (let i = 0; i < 3; i++) {
      const dot = els.dots[i];
      if (!dot) continue;
      const phase = (t * 1.8 - i * 0.25) % 1;
      const dotOp = 0.25 + Math.max(0, Math.sin(phase * Math.PI)) * 0.65;
      const dotScale = 0.7 + Math.max(0, Math.sin(phase * Math.PI)) * 0.35;
      dot.style.opacity = String(dotOp);
      dot.style.transform = 'scale(' + dotScale + ')';
    }
  }

  function readDims(root) {
    const bar = root.querySelector('.calc-pending-bar');
    const spectrum = root.querySelector('.calc-pending-spectrum');
    let barW = spectrum ? spectrum.clientWidth : 0;
    if (barW < 40) {
      const card = root.querySelector('.calc-pending-card');
      const cw = card && card.clientWidth ? card.clientWidth : 320;
      barW = Math.min(300, Math.max(220, cw - 48));
    }
    const barH = bar ? bar.offsetHeight : 10;
    const barY = bar ? bar.offsetTop : 36;
    return { barW, barH, barY };
  }

  function waitNextPaint() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  /**
   * @returns {Promise<void>}
   */
  function runCalcPendingAnimation(root) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = {
      strip: root.querySelector('.calc-pending-strip'),
      wordmark: root.querySelector('.calc-pending-wordmark'),
      bar: root.querySelector('.calc-pending-bar'),
      z2glow: root.querySelector('.calc-pending-z2glow'),
      beam: root.querySelector('.calc-pending-beam'),
      bracketL: root.querySelector('.calc-pending-bracket--l'),
      bracketR: root.querySelector('.calc-pending-bracket--r'),
      labels: root.querySelectorAll('.calc-pending-zlab'),
      msgLines: root.querySelectorAll('.calc-pending-msgline'),
      dotsWrap: root.querySelector('.calc-pending-dots'),
      dots: root.querySelectorAll('.calc-pending-dot')
    };

    if (reduce) {
      return waitNextPaint().then(function () {
        const dims = readDims(root);
        paintFrame(els, DUR, dims);
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 220);
        });
      });
    }

    return waitNextPaint().then(function () {
      return new Promise(function (resolve) {
        const t0 = performance.now();
        function frame(now) {
          const elapsed = (now - t0) / 1000;
          const t = Math.min(DUR, elapsed);
          const dims = readDims(root);
          paintFrame(els, t, dims);
          if (elapsed < DUR) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });
    });
  }

  window.runCalcPendingAnimation = runCalcPendingAnimation;
})();
