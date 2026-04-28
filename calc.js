/* Calculator page (load after site-shared.js + calc-pending.js) */
let calcInFlight = false;


/** Plain "how it works" copy for the formula coach (ELI5 level). */
const FORMULA_HOW = {
  karvonen: 'Think of your slow morning heart rate at the bottom and your hardest possible heart rate at the top. Karvonen fills the gap between those two and picks Zone 2 inside that gap. It needs your resting number to work.',
  maffetone: 'Starts with 180 minus your age, then nudges down a little if you are newer or up a little if you have years of steady training. Think of it as a gentle guardrail that keeps easy days truly easy.',
  pctmax: 'Takes a max heart rate you measured or raced to, then uses 60 to 70 percent of it for Zone 2. That is the same relative band as on the Tanaka and 220 minus age rows, so you can compare your real max to those age guesses.',
  tanaka: 'Estimates max heart rate as 208 minus seven tenths of your age, then takes 60 to 70 percent of that for Zone 2. The max guess changes more gently with age than the classic 220 minus age line.',
  age220: 'Only looks at age, guesses max with 220 minus age, then grabs the easy slice. Quick napkin math, not tailored to you.'
};

let formulaCoachSnapshot = { formulas: [], bestNote: '' };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildFormulaCoachHtml(formulas, bestNote) {
  const why = escapeHtml(bestNote || '');
  const blocks = formulas.map(f => {
    const how = escapeHtml(FORMULA_HOW[f.id] || '');
    const when = escapeHtml(f.hint || '');
    return (
      '<div class="formula-coach-block">' +
      '<div class="formula-coach-name">' + escapeHtml(f.name) + '</div>' +
      '<p class="formula-coach-how">' + how + '</p>' +
      '<p class="formula-coach-when"><strong>When this formula fits best.</strong> ' + when + '</p>' +
      '</div>'
    );
  }).join('');
  return (
    '<h3>Why this formula for you</h3>' +
    '<p>' + why + '</p>' +
    '<h3>How each formula works</h3>' +
    blocks
  );
}

function openFormulaCoachDialog() {
  const dlg = document.getElementById('formula-coach-dialog');
  const body = document.getElementById('formula-coach-body');
  if (!dlg || !body || typeof dlg.showModal !== 'function') return;
  body.innerHTML = buildFormulaCoachHtml(
    formulaCoachSnapshot.formulas,
    formulaCoachSnapshot.bestNote
  );
  dlg.showModal();
  trackEvent('formula_coach_open', {});
}
/**
 * Scroll so the "01 Calculate" row sits just below the sticky header (not the top of #calculate,
 * which sits above large padding and would hide the title under the fold).
 */
function scrollToCalculateSectionHead() {
  const siteHeader = document.querySelector('.site-header');
  const headBadge = document.querySelector('#calculate .section-num');
  if (!siteHeader || !headBadge) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gapPx = 20;
  const headerH = siteHeader.getBoundingClientRect().height;
  const rect = headBadge.getBoundingClientRect();
  const y = window.pageYOffset + rect.top - headerH - gapPx;
  window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
}

/* ════════════════════════════════════════════
   Fitness level state
   'beginner' | 'intermediate' | 'advanced'
   Drives Maffetone adjustment and formula priority.
════════════════════════════════════════════ */
let fitnessLevel = 'intermediate';

function setFitness(level) {
  fitnessLevel = level;
  ['beginner', 'intermediate', 'advanced'].forEach(l => {
    const btn = document.getElementById('fit-' + l);
    if (btn) btn.classList.toggle('active', l === level);
  });
  trackEvent('fitness_level_selected', { fitness_level: level });
}

/* ════════════════════════════════════════════
   Formula engine
   Formulas: Karvonen, Maffetone, % Max HR, Tanaka, 220−Age.
   Karvonen requires resting HR. Others use age (+ optional actual max HR).
   Tanaka: max HR estimate 208 − 0.7×age, then 60–70% for Zone 2 (same band rule as 220−Age row).
   % of Max: 60–70% of a typed max only (locked until then). Age-based max bands stay on Tanaka and 220−Age so nothing duplicates.
   Fitness level adjusts Maffetone and shifts formula priority.
   Consensus: strict intersection first; if none, try dropping one outlier (N-1).
   "Best for you" follows the first formula (by priority) that participates in that consensus band, so it stays aligned with the sweet spot.
════════════════════════════════════════════ */

function computeFormulas(age, rhr, maxHR) {
  const estMax = maxHR || (220 - age);
  const rows = [];

  // Maffetone adjustment: Maffetone himself prescribed ±5 based on training history.
  // Beginner/rebuilding: −5 (conservative, build aerobic base safely)
  // Consistent 2+ years making progress: +5 (credit for aerobic adaptation)
  const mafAdj   = fitnessLevel === 'beginner' ? -5 : fitnessLevel === 'advanced' ? 5 : 0;
  const mafBase  = 180 - age + mafAdj;
  const mafHint  = 'Use when you want an easy aerobic band from 180 minus age, without resting HR. The same rule nudges the anchor down for newer or rebuilding athletes and up for long-term consistent training.';

  // Karvonen (requires RHR). Most personalized; especially accurate for fit athletes
  // with a low RHR and tested max HR.
  if (rhr) {
    const hrr = estMax - rhr;
    // Advanced athletes with RHR → Karvonen is most accurate; beginners → Maffetone leads
    const karPriority = fitnessLevel === 'beginner' ? 2 : 1;
    rows.push({ id:'karvonen', name:'Karvonen',
      hint: maxHR ? 'Use when you trust your resting HR and you also have a max you measured or raced to.'
                  : 'Use when you trust your resting HR. Max can be measured or the usual age estimate (220 minus age) when left blank.',
      low: Math.round(hrr * 0.60 + rhr), high: Math.round(hrr * 0.70 + rhr),
      priority: karPriority, locked: false });
  } else {
    rows.push({ id:'karvonen', name:'Karvonen',
      hint:'Use when resting HR will be measured at wake-up before coffee or training. Add RHR above to unlock this row.',
      low: null, high: null, priority: 4, locked: true });
  }

  // Maffetone. Leads when no RHR, or when beginner (conservative range is intentional)
  const mafPriority = fitnessLevel === 'beginner' ? 1
                    : rhr ? 2
                    : 1;
  rows.push({ id:'maffetone', name:'Maffetone', hint: mafHint,
    low: mafBase - 10, high: mafBase,
    priority: mafPriority, locked: false });

  // % of Max HR: only when a real max is entered (avoids duplicating the 220−Age row at the same 60–70% band).
  if (maxHR) {
    const pctPriority = rhr ? 3 : (fitnessLevel === 'advanced' ? 1 : 2);
    rows.push({ id:'pctmax', name:'% of Max HR',
      hint: 'Use when you know your real max but left resting HR blank.',
      low: Math.round(maxHR * 0.60), high: Math.round(maxHR * 0.70),
      priority: pctPriority, locked: false });
  } else {
    rows.push({ id:'pctmax', name:'% of Max HR',
      hint: 'Use when you have a max from a test or a hard race. Add it above to unlock this row. Until then, Tanaka and 220 minus age already show age-based max bands at the same 60 to 70 percent rule.',
      low: null, high: null, priority: 6, locked: true });
  }

  const tanakaEstMax = Math.round(208 - 0.7 * age);
  rows.push({ id:'tanaka', name:'Tanaka',
    hint: 'Use when you want a max-from-age estimate that ages more gently than 220 minus age, especially past 40. Still only uses age.',
    low: Math.round(tanakaEstMax * 0.60),
    high: Math.round(tanakaEstMax * 0.70),
    priority: rhr ? 4 : 3,
    locked: false });

  // 220 − Age. Least personalized; deprioritized for advanced athletes over ~45
  // because estimated max HR commonly underestimates for trained older athletes.
  const ageNote = 'Use when only age is available, or as a simple yardstick next to other lines. The max guess often runs low for very fit people over 45.';
  rows.push({ id:'age220', name:'220 \u2212 Age', hint: ageNote,
    low: Math.round((220 - age) * 0.60), high: Math.round((220 - age) * 0.70),
    priority: rhr ? 5 : 4, locked: false });

  rows.sort((a, b) => a.priority - b.priority);
  return rows;
}

/**
 * Plain-language copy for the "Best for you" coachmark (priority rules in computeFormulas, then aligned to consensus overlap).
 */
function getBestForYouExplanation(featuredId, rhr, maxHR, opts) {
  const hasRhr = rhr != null && !isNaN(rhr);
  const hasMax = maxHR != null && !isNaN(maxHR);
  const leadReconciled = opts && opts.leadReconciled;
  const naturalLeadId = opts && opts.naturalLeadId;

  if (leadReconciled) {
    const names = {
      karvonen: 'Karvonen',
      maffetone: 'Maffetone',
      tanaka: 'Tanaka',
      age220: '220 minus age',
      pctmax: '% of Max HR'
    };
    const featNm = names[featuredId] || 'This line';
    const natNm = names[naturalLeadId] || 'Another line';
    if (naturalLeadId === 'karvonen') {
      return featNm + ' sits inside the overlap used for the sweet spot. Karvonen still uses your resting HR, but its band sits outside that overlap, which is common when reserve math does not line up with age-based ceilings.';
    }
    return 'We would rank ' + natNm + ' first from your inputs, but the sweet spot uses formulas that overlap here, so we highlight ' + featNm + ' because it sits in that overlap band.';
  }

  if (featuredId === 'karvonen') {
    return 'You gave us a resting heart rate, so we put Karvonen on top. It is the one that uses the gap between rest and max, which is usually the closest fit when those numbers are real.';
  }
  if (featuredId === 'maffetone') {
    if (fitnessLevel === 'beginner') {
      return 'You are starting out or rebuilding, so we put Maffetone on top. It keeps the easy range a little safer while your base comes back.';
    }
    if (!hasRhr) {
      return 'No resting heart rate yet, so we put Maffetone on top. Add that morning pulse anytime and Karvonen can take the lead instead.';
    }
    return 'Maffetone is highlighted because it matches how we resolve the sweet spot for your inputs.';
  }
  if (featuredId === 'pctmax') {
    if (fitnessLevel === 'advanced' && hasMax && !hasRhr) {
      return 'You gave a real max and you are advanced, but no resting HR, so we put percent-of-max on top. It leans on the max you typed instead of guessing from age alone.';
    }
    return 'Percent-of-max is leading here. It uses the max you entered at 60 to 70 percent, same relative band as the Tanaka and 220 minus age lines.';
  }
  if (featuredId === 'age220') {
    return 'The simple age line is leading because of what you entered and your training level. Treat it as a starting guess, not a lab result.';
  }
  if (featuredId === 'tanaka') {
    return 'Tanaka is leading because age is your main anchor here. It uses a max estimate that usually tracks adults a bit more gently over the years than 220 minus age alone.';
  }
  return 'We pick one formula to show first from your training level and which boxes you filled. Scroll the modal to read how each line works.';
}

function computeConsensus(formulas) {
  const unlocked = formulas.filter(f => !f.locked);
  if (!unlocked.length) {
    return {
      low: 120,
      high: 130,
      note: 'Add inputs to see ranges.',
      ssCaption: 'Enter your details to see a sweet spot.',
      mode: 'empty',
      includedIds: [],
      excludedIds: []
    };
  }

  // Try strict intersection of all
  const sLo = Math.max(...unlocked.map(f => f.low));
  const sHi = Math.min(...unlocked.map(f => f.high));
  if (sLo <= sHi) {
    return {
      low: sLo,
      high: sHi,
      note: 'Where every formula\'s range overlaps.',
      ssCaption: 'Every unlocked formula range overlaps in this shaded band.',
      mode: 'all',
      includedIds: unlocked.map(f => f.id),
      excludedIds: []
    };
  }

  // No strict overlap. Try dropping one formula at a time
  let best = null;
  const n = unlocked.length;
  for (let i = 0; i < n; i++) {
    const excluded = unlocked[i];
    const sub = unlocked.filter((_, j) => j !== i);
    const lo = Math.max(...sub.map(f => f.low));
    const hi = Math.min(...sub.map(f => f.high));
    if (lo <= hi && (!best || (hi - lo) > (best.high - best.low))) {
      best = {
        low: lo,
        high: hi,
        note: 'Where most formulas agree. ' + excluded.name + ' sits outside this band.',
        ssCaption: 'Sweet spot: where most formulas overlap. ' + excluded.name + ' sits outside this band.',
        mode: 'n1',
        includedIds: sub.map(f => f.id),
        excludedIds: [excluded.id]
      };
    }
  }
  if (best) return best;

  // Complete divergence. Use midpoint of medians as a reasonable estimate
  const mids = unlocked.map(f => Math.round((f.low + f.high) / 2)).sort((a,b)=>a-b);
  const center = mids[Math.floor(mids.length / 2)];
  return {
    low: center - 3,
    high: center + 3,
    note: 'No single overlap across every formula. This is a practical midpoint from the ranges above.',
    ssCaption: 'No single band fits every formula. Shaded range is a practical midpoint.',
    mode: 'midpoint',
    includedIds: unlocked.map(f => f.id),
    excludedIds: []
  };
}

/** Pick "Best for you" from formulas that actually define the consensus band (priority order preserved in `formulas`). */
function applyConsensusFeatured(formulas, consensus) {
  formulas.forEach((f) => { delete f.featured; });
  const unlocked = formulas.filter((f) => !f.locked);
  if (!unlocked.length || consensus.mode === 'empty') return;

  let pool;
  if (consensus.mode === 'n1' && consensus.includedIds && consensus.includedIds.length > 0) {
    pool = new Set(consensus.includedIds);
  } else {
    pool = new Set(unlocked.map((f) => f.id));
  }

  const pick = formulas.find((f) => !f.locked && pool.has(f.id));
  if (pick) pick.featured = true;
}

function computeScale(formulas) {
  const unlocked = formulas.filter(f => !f.locked);
  const rawMin = Math.min(...unlocked.map(f => f.low));
  const rawMax = Math.max(...unlocked.map(f => f.high));
  return {
    min: Math.floor((rawMin - 8) / 10) * 10,
    max: Math.ceil((rawMax  + 8) / 10) * 10
  };
}

/** Percent along chart track (same scale as axis ticks and formula bars). */
function pctOnScale(bpm, s) {
  return ((bpm - s.min) / (s.max - s.min)) * 100;
}
function widthPct(lo, hi, s) {
  return ((hi - lo) / (s.max - s.min)) * 100;
}

async function shareZone2() {
  const loEl = document.getElementById('ss-n-lo');
  const hiEl = document.getElementById('ss-n-hi');
  const btn = document.getElementById('btn-share');
  const label = btn && btn.querySelector('.btn-share-label');
  if (!loEl || !hiEl || !btn || !label) return;
  const lo = loEl.textContent.trim();
  const hi = hiEl.textContent.trim();
  const text = 'My Zone 2 range (Zone 2 For You): ' + lo + '-' + hi + ' bpm';
  const url = window.location.href.split('#')[0];
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Zone 2 For You', text: text, url: url });
      trackEvent('share_zone2', {
        share_method: 'native_share',
        zone2_low: lo,
        zone2_high: hi
      });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      trackEvent('share_zone2_cancelled', { share_method: 'native_share' });
      return;
    }
  }
  const full = text + (url ? '\n' + url : '');
  try {
    await navigator.clipboard.writeText(full);
    const prev = label.textContent;
    label.textContent = 'Copied to clipboard';
    btn.disabled = true;
    setTimeout(() => {
      label.textContent = prev;
      btn.disabled = false;
    }, 2200);
    trackEvent('share_zone2', {
      share_method: 'clipboard',
      zone2_low: lo,
      zone2_high: hi
    });
    return;
  } catch (e) {
    /* clipboard may be unavailable */
  }
  trackEvent('share_zone2', {
    share_method: 'manual_copy_prompt',
    zone2_low: lo,
    zone2_high: hi
  });
  window.prompt('Copy this text:', full);
}

/* ════════════════════════════════════════════
   Render the chart
════════════════════════════════════════════ */
function renderChart(formulas, consensus, scale, bestForYouNote) {
  const coachText = bestForYouNote || '';
  const ticks = [];
  for (let b = scale.min; b <= scale.max; b += 10) ticks.push(b);

  document.getElementById('axis-inner').innerHTML = ticks.map(b =>
    `<span class="axis-tick" style="left:${pctOnScale(b, scale)}%">${b}</span>`
  ).join('');

  const gls = ticks.map(b =>
    `<div class="gl" style="left:${pctOnScale(b, scale)}%"></div>`
  ).join('');
  const colL = pctOnScale(consensus.low, scale);
  const colW = widthPct(consensus.low, consensus.high, scale);
  const col = `<div class="consensus-col" style="left:${colL}%;width:${colW}%"></div>`;

  formulaCoachSnapshot.formulas = formulas;
  formulaCoachSnapshot.bestNote = coachText;

  document.getElementById('formula-rows').innerHTML = formulas.map(f => {
    if (f.locked) {
      return `
      <div class="row locked">
        <div class="meta"><span class="fn">${f.name}</span></div>
        <div class="ba">${col}${gls}</div>
      </div>`;
    }
    const bL = pctOnScale(f.low, scale);
    const bW = widthPct(f.low, f.high, scale);
    return `
      <div class="row ${f.featured ? 'featured' : ''}">
        <div class="meta">
          ${f.featured ? `<div class="best-wrap"><button type="button" class="best-coach-trigger" aria-haspopup="dialog" aria-controls="formula-coach-dialog" title="Why this formula?"><span class="tag tag-best">Best for you</span><span class="best-coach-q" aria-hidden="true">?</span><span class="sr-only">Open why this formula was selected and how each method works</span></button></div>` : ''}
          <span class="fn">${f.name}</span>
        </div>
        <div class="ba">
          ${col}${gls}
          <div class="bt">
            <div class="b-slot" style="left:${bL}%;width:${bW}%">
              <div class="b-visual"></div>
              <span class="b-edge b-edge--lo">${f.low}</span>
              <span class="b-edge b-edge--hi">${f.high}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const ssL = pctOnScale(consensus.low, scale);
  const ssW = widthPct(consensus.low, consensus.high, scale);
  const bar = document.getElementById('ss-bar');
  bar.style.left = ssL + '%';
  bar.style.width = ssW + '%';

  const bpmL = document.getElementById('ss-bpm-l');
  bpmL.textContent = consensus.low;
  bpmL.style.top = '50%';
  bpmL.style.left = ssL + '%';

  const bpmR = document.getElementById('ss-bpm-r');
  bpmR.textContent = consensus.high;
  bpmR.style.top = '50%';
  bpmR.style.left = (ssL + ssW) + '%';

  document.getElementById('ss-n-lo').textContent = consensus.low;
  document.getElementById('ss-n-hi').textContent = consensus.high;
  document.getElementById('ss-hint').textContent = consensus.ssCaption || consensus.note;
}

/* ════════════════════════════════════════════
   Calculate. Hides form, shows results
════════════════════════════════════════════ */
async function calculate() {
  if (calcInFlight) return;

  const ageVal   = document.getElementById('age').value.trim();
  const rhrVal   = document.getElementById('rhr').value.trim();
  const maxHRVal = document.getElementById('maxhr').value.trim();

  const age = parseInt(ageVal, 10);
  const rhr = rhrVal ? parseInt(rhrVal, 10) : null;

  let maxHR = null;
  if (maxHRVal) {
    const m = parseInt(maxHRVal, 10);
    if (!Number.isFinite(m) || m < 130 || m > 220) {
      trackEvent('calculate_zone2_validation_error', { field: 'maxhr' });
      document.getElementById('maxhr').focus();
      return;
    }
    maxHR = m;
  }

  if (!age || age < 15 || age > 80) {
    trackEvent('calculate_zone2_validation_error', { field: 'age' });
    document.getElementById('age').focus();
    return;
  }

  const pending = document.getElementById('calc-pending');
  const btnCalc = document.getElementById('btn-calc');
  calcInFlight = true;
  if (btnCalc) btnCalc.disabled = true;
  if (pending) {
    pending.removeAttribute('hidden');
    pending.hidden = false;
    pending.setAttribute('aria-hidden', 'false');
    pending.setAttribute('aria-busy', 'true');
    void pending.offsetHeight;
  }

  try {
    if (typeof window.runCalcPendingAnimation === 'function' && pending) {
      await window.runCalcPendingAnimation(pending);
    } else {
      await new Promise(function (r) { setTimeout(r, 500); });
    }

    const formulas  = computeFormulas(age, rhr, maxHR);
    const consensus = computeConsensus(formulas);
    applyConsensusFeatured(formulas, consensus);
    const scale = computeScale(formulas);

    const naturalLead = formulas.find((f) => !f.locked);
    const featured = formulas.find((x) => x.featured);
    const leadReconciled = !!(naturalLead && featured && naturalLead.id !== featured.id);
    const bestNote = featured
      ? getBestForYouExplanation(featured.id, rhr, maxHR, {
          leadReconciled,
          naturalLeadId: naturalLead ? naturalLead.id : null
        })
      : '';
    renderChart(formulas, consensus, scale, bestNote);
    trackEvent('calculate_zone2', {
      fitness_level: fitnessLevel,
      has_resting_hr: rhr !== null,
      has_max_hr: maxHR !== null,
      featured_formula: featured ? featured.id : 'none',
      consensus_low: consensus.low,
      consensus_high: consensus.high
    });

    document.getElementById('chips').innerHTML = [
      `<span class="chip">Age ${age}</span>`,
      rhr   ? `<span class="chip">RHR ${rhr} bpm</span>`     : `<span class="chip">RHR estimated</span>`,
      maxHR ? `<span class="chip">Max HR ${maxHR} bpm</span>` : `<span class="chip">Max HR estimated</span>`
    ].join('');

    if (pending) {
      pending.hidden = true;
      pending.setAttribute('hidden', '');
      pending.setAttribute('aria-hidden', 'true');
      pending.setAttribute('aria-busy', 'false');
    }
    document.getElementById('form-card').classList.add('hidden');
    const results = document.getElementById('results');
    results.classList.add('visible');
    setTimeout(() => {
      scrollToCalculateSectionHead();
    }, 80);
  } finally {
    calcInFlight = false;
    if (btnCalc) btnCalc.disabled = false;
    if (pending && !pending.hidden) {
      pending.hidden = true;
      pending.setAttribute('hidden', '');
      pending.setAttribute('aria-hidden', 'true');
      pending.setAttribute('aria-busy', 'false');
    }
  }
}

function backToForm() {
  const coachDlg = document.getElementById('formula-coach-dialog');
  if (coachDlg && typeof coachDlg.close === 'function' && coachDlg.open) {
    coachDlg.close();
  }
  const pending = document.getElementById('calc-pending');
  if (pending) {
    pending.hidden = true;
    pending.setAttribute('hidden', '');
    pending.setAttribute('aria-hidden', 'true');
    pending.setAttribute('aria-busy', 'false');
  }
  document.getElementById('results').classList.remove('visible');
  document.getElementById('form-card').classList.remove('hidden');
  requestAnimationFrame(() => scrollToCalculateSectionHead());
  trackEvent('back_to_inputs');
}

window.calculate = calculate;

window.addEventListener('DOMContentLoaded', () => {
  const heroCalc = document.querySelector('a.hero-cta[href="#calculate"]');
  if (heroCalc) {
    heroCalc.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToCalculateSectionHead();
      trackEvent('hero_cta_click', { destination: 'calculate' });
    });
  }

  const coachDlg = document.getElementById('formula-coach-dialog');
  if (coachDlg) {
    const coachPanel = coachDlg.querySelector('.formula-coach-panel');
    coachDlg.addEventListener('click', (e) => {
      if (coachPanel && !coachPanel.contains(e.target)) {
        coachDlg.close();
      }
    });
    const coachX = coachDlg.querySelector('.formula-coach-x');
    if (coachX) {
      coachX.addEventListener('click', (e) => {
        e.stopPropagation();
        coachDlg.close();
      });
    }
  }

  const resultsRoot = document.getElementById('results');
  if (resultsRoot) {
    resultsRoot.addEventListener('click', (e) => {
      const trig = e.target.closest('.best-coach-trigger');
      if (!trig) return;
      e.preventDefault();
      openFormulaCoachDialog();
    });
  }

  document.querySelectorAll('.steps-inner .step').forEach(step => {
    step.addEventListener('click', () => {
      const labelEl = step.querySelector('.step-label');
      const destination = step.getAttribute('href') || '';
      trackEvent('step_navigation_click', {
        step_label: labelEl ? labelEl.textContent.trim().toLowerCase() : 'unknown',
        destination: (destination || '').replace(/^[#]/, '').slice(0, 120)
      });
    });
  });

});

