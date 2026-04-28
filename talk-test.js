/* ════════════════════════════════════════════
   Talk test: reference audio error UI + mic analysis (client-side only)
════════════════════════════════════════════ */
(function setupTalkTestAudio() {
  function wire(idAudio, idMissing) {
    const a = document.getElementById(idAudio);
    const m = document.getElementById(idMissing);
    if (!a || !m) return;
    const showMissing = () => {
      a.style.display = 'none';
      m.classList.add('visible');
    };
    a.addEventListener('error', showMissing, { once: true });
  }
  window.addEventListener('DOMContentLoaded', () => {
    wire('audio-talk-z2', 'audio-talk-z2-missing');
    wire('audio-talk-hard', 'audio-talk-hard-missing');
  });
})();

let talkMediaRecorder = null;
let talkRecordChunks = [];
let talkRecordStream = null;
let talkAutoStopTimer = null;
let talkRecording = false;

function talkPickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
  }
  return '';
}

function talkClearAutoStop() {
  if (talkAutoStopTimer) {
    clearTimeout(talkAutoStopTimer);
    talkAutoStopTimer = null;
  }
}

function talkSetRecordingUi(active) {
  const btn = document.getElementById('btn-talk-record');
  const st = document.getElementById('talk-rec-status');
  if (!btn || !st) return;
  talkRecording = active;
  if (active) {
    btn.textContent = 'Stop and analyze';
    btn.classList.add('btn-record--stop');
    st.textContent = 'Recording… max 12s';
  } else {
    btn.textContent = 'Start recording';
    btn.classList.remove('btn-record--stop');
    st.textContent = '';
  }
}

function talkShowResult(html, level) {
  const el = document.getElementById('talk-result');
  if (!el) return;
  el.className = 'talk-result visible talk-result--' + level;
  el.innerHTML = html;
}

function talkAnalyzePcm(channelData, sampleRate) {
  const n = channelData.length;
  if (n < sampleRate * 0.6) {
    return { error: 'Clip was too short. Try again and say the full sentence without cutting off early.' };
  }

  const frame = Math.max(256, Math.floor(sampleRate * 0.04));
  const hop = Math.floor(frame / 2);
  const rmsArr = [];
  const zcrArr = [];

  for (let i = 0; i + frame <= n; i += hop) {
    let sumSq = 0;
    let zc = 0;
    for (let j = 0; j < frame; j++) {
      const v = channelData[i + j];
      sumSq += v * v;
      if (j > 0) {
        const prev = channelData[i + j - 1];
        if ((v >= 0) !== (prev >= 0)) zc++;
      }
    }
    rmsArr.push(Math.sqrt(sumSq / frame));
    zcrArr.push(zc / frame);
  }

  const maxR = Math.max.apply(null, rmsArr) || 1e-8;
  const norm = rmsArr.map(function (r) { return r / maxR; });

  let lo = 0;
  let hi = norm.length - 1;
  const gate = 0.06;
  while (lo < hi && norm[lo] < gate) lo++;
  while (hi > lo && norm[hi] < gate) hi--;
  const sliceFrom = lo * hop;
  const sliceTo = Math.min(n, (hi + 1) * hop + frame);
  if (sliceTo - sliceFrom < sampleRate * 0.45) {
    return { error: 'We could not hear much speech. Move closer to the mic, reduce wind noise, and try again.' };
  }

  const trimmed = channelData.subarray(sliceFrom, sliceTo);
  rmsArr.length = 0;
  zcrArr.length = 0;
  for (let i = 0; i + frame <= trimmed.length; i += hop) {
    let sumSq = 0;
    let zc = 0;
    for (let j = 0; j < frame; j++) {
      const v = trimmed[i + j];
      sumSq += v * v;
      if (j > 0) {
        const prev = trimmed[i + j - 1];
        if ((v >= 0) !== (prev >= 0)) zc++;
      }
    }
    rmsArr.push(Math.sqrt(sumSq / frame));
    zcrArr.push(zc / frame);
  }

  const maxR2 = Math.max.apply(null, rmsArr) || 1e-8;
  const norm2 = rmsArr.map(function (r) { return r / maxR2; });
  const weakFrac = norm2.filter(function (r) { return r < 0.11; }).length / norm2.length;
  const meanZ = zcrArr.reduce(function (a, b) { return a + b; }, 0) / zcrArr.length;
  const meanN = norm2.reduce(function (a, b) { return a + b; }, 0) / norm2.length;
  let vsum = 0;
  norm2.forEach(function (r) {
    vsum += (r - meanN) * (r - meanN);
  });
  const rmsStd = Math.sqrt(vsum / norm2.length);

  const pauseScore = Math.min(100, weakFrac * 200);
  const noiseScore = Math.min(100, Math.max(0, (meanZ - 0.045) * 420));
  const wobbleScore = Math.min(100, rmsStd * 220);
  const raw = pauseScore * 0.48 + noiseScore * 0.32 + wobbleScore * 0.2;

  return { score: Math.max(0, Math.min(100, raw)), weakFrac: weakFrac, meanZ: meanZ, rmsStd: rmsStd };
}

function talkInterpret(score) {
  if (score < 38) {
    return {
      level: 'ok',
      html: '<strong>Sounds relatively smooth.</strong> Your line came through without lots of long gaps or rough noise. Pair that with HR or perceived effort. If both feel easy, you are probably in a sustainable place.'
    };
  }
  if (score < 62) {
    return {
      level: 'mid',
      html: '<strong>Some unevenness.</strong> We noticed pauses or shaky loudness. If your heart rate is also creeping past your Zone 2 band, ease back slightly until the sentence feels easy again.'
    };
  }
  return {
    level: 'high',
    html: '<strong>Sounds strained.</strong> The clip has strong pause or breath noise patterns. That often lines up with being above an easy conversational effort. Slow down until you can say the line in one steady go.'
  };
}

function talkStopStream() {
  if (talkRecordStream) {
    talkRecordStream.getTracks().forEach(function (t) { t.stop(); });
    talkRecordStream = null;
  }
}

async function talkStartRecording() {
  const btn = document.getElementById('btn-talk-record');
  const resEl = document.getElementById('talk-result');
  if (resEl) {
    resEl.className = 'talk-result';
    resEl.textContent = '';
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    talkShowResult('Recording is not supported in this browser.', 'high');
    return;
  }
  try {
    talkRecordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    talkShowResult('Microphone access was blocked or unavailable. You can still use the reference clips above.', 'mid');
    return;
  }

  talkRecordChunks = [];
  const mime = talkPickMimeType();
  try {
    talkMediaRecorder = mime
      ? new MediaRecorder(talkRecordStream, { mimeType: mime })
      : new MediaRecorder(talkRecordStream);
  } catch (e) {
    talkStopStream();
    talkShowResult('Could not start the recorder in this browser.', 'high');
    return;
  }

  talkMediaRecorder.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) talkRecordChunks.push(e.data);
  };

  talkMediaRecorder.onstop = function () {
    talkClearAutoStop();
    talkSetRecordingUi(false);
    if (btn) btn.disabled = true;
    const blob = new Blob(talkRecordChunks, { type: talkMediaRecorder.mimeType || mime || 'audio/webm' });
    talkRecordChunks = [];
    talkStopStream();
    talkMediaRecorder = null;

    if (!blob.size || blob.size < 900) {
      if (btn) btn.disabled = false;
      talkShowResult('Recording was too short. Hold Stop only after you finish the full sentence.', 'mid');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = function () {
      const buf = reader.result;
      if (!buf || !(buf instanceof ArrayBuffer)) {
        if (btn) btn.disabled = false;
        talkShowResult('Could not read the recording. Please try again.', 'mid');
        return;
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.decodeAudioData(
        buf.slice(0),
        function (audioBuffer) {
          ctx.close();
          if (btn) btn.disabled = false;
          const ch = audioBuffer.getChannelData(0);
          const out = talkAnalyzePcm(ch, audioBuffer.sampleRate);
          if (out.error) {
            talkShowResult(out.error, 'mid');
            return;
          }
          const interp = talkInterpret(out.score);
          talkShowResult(interp.html, interp.level);
        },
        function () {
          try { ctx.close(); } catch (e2) {}
          if (btn) btn.disabled = false;
          talkShowResult('We could not decode that recording. Try again with a shorter clip, or use another browser.', 'mid');
        }
      );
    };
    reader.onerror = function () {
      if (btn) btn.disabled = false;
      talkShowResult('Could not read the recording. Please try again.', 'mid');
    };
    reader.readAsArrayBuffer(blob);
  };

  talkMediaRecorder.start();
  talkSetRecordingUi(true);
  if (btn) btn.disabled = false;

  talkClearAutoStop();
  talkAutoStopTimer = setTimeout(function () {
    if (talkMediaRecorder && talkMediaRecorder.state === 'recording') talkMediaRecorder.stop();
  }, 12000);
}

function talkToggleRecord() {
  if (!talkRecording) {
    talkStartRecording();
    return;
  }
  talkClearAutoStop();
  if (talkMediaRecorder && talkMediaRecorder.state === 'recording') talkMediaRecorder.stop();
}

window.addEventListener('DOMContentLoaded', function () {
  if (typeof trackEvent === 'function') {
    trackEvent('talk_test_page_view');
  }
  const btn = document.getElementById('btn-talk-record');
  if (btn) btn.addEventListener('click', talkToggleRecord);
});
