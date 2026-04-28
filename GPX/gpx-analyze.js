/**
 * GPX parsing: track metrics, elevation, extensions (HR, etc.), image URL hints.
 * Uses browser DOMParser; load as ES module from parse.html.
 */

/** @param {string} textSample — first bytes of file as text */
export function isLikelyGpxText(textSample) {
  return /<\s*gpx[\s>]/i.test(textSample);
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function readNumericByLocalName(scopeEl, localNames) {
  const allowed = new Set(localNames.map((x) => x.toLowerCase()));
  const all = scopeEl.getElementsByTagName("*");
  for (const el of all) {
    const name = (el.localName || "").toLowerCase();
    if (!allowed.has(name)) continue;
    const num = Number.parseFloat(el.textContent || "");
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function isLikelyImageRef(value) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (v.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(v);
}

function toAbsoluteUrlIfPossible(value, baseUrl) {
  try {
    return new URL(value, baseUrl || (typeof location !== "undefined" ? location.href : undefined)).toString();
  } catch (_) {
    return value;
  }
}

/**
 * @param {Document} doc
 * @param {string} [baseUrl] — resolve relative image links
 * @returns {{ src: string, label: string }[]}
 */
export function extractGpxImageRefs(doc, baseUrl) {
  const found = new Set();
  const all = doc.getElementsByTagName("*");
  for (const el of all) {
    for (const attr of Array.from(el.attributes || [])) {
      const val = (attr.value || "").trim();
      if (isLikelyImageRef(val)) {
        found.add(toAbsoluteUrlIfPossible(val, baseUrl));
      }
    }
    const textVal = (el.textContent || "").trim();
    if (isLikelyImageRef(textVal) && textVal.length < 4000) {
      found.add(toAbsoluteUrlIfPossible(textVal, baseUrl));
    }
  }
  return Array.from(found)
    .slice(0, 12)
    .map((src) => ({ src, label: src.slice(0, 120) }));
}

/**
 * @param {string} xmlString
 * @param {{ baseUrl?: string }} [options]
 * @returns {{ ok: true, result: object, gpxImages: {src:string,label:string}[], debug: object } | { ok: false, error: string }}
 */
export function analyzeGpxString(xmlString, options = {}) {
  const baseUrl = options.baseUrl;
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return { ok: false, error: "GPX parse error: invalid XML structure." };
  }

  const points = Array.from(doc.querySelectorAll("trkpt"));
  const routes = doc.querySelectorAll("rtept").length;
  const activityName =
    doc.querySelector("metadata > name, trk > name")?.textContent?.trim() || "Untitled activity";
  const activityType = doc.querySelector("trk > type")?.textContent?.trim() || "unknown";
  const gpxImages = extractGpxImageRefs(doc, baseUrl);

  let distanceMeters = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  const heartRates = [];
  const calories = [];
  const cadences = [];
  const powers = [];
  const temperatures = [];
  const times = [];
  let prev = null;

  for (const p of points) {
    const lat = Number.parseFloat(p.getAttribute("lat") || "");
    const lon = Number.parseFloat(p.getAttribute("lon") || "");
    const ele = Number.parseFloat(p.querySelector("ele")?.textContent || "");
    const timeText = p.querySelector("time")?.textContent || "";
    const timeMs = Date.parse(timeText);

    if (Number.isFinite(timeMs)) times.push(timeMs);

    const hr = readNumericByLocalName(p, ["hr", "heartrate", "heart_rate"]);
    if (Number.isFinite(hr)) heartRates.push(hr);

    const kcal = readNumericByLocalName(p, ["calories", "calorie", "kcal"]);
    if (Number.isFinite(kcal)) calories.push(kcal);

    const cad = readNumericByLocalName(p, ["cad", "cadence"]);
    if (Number.isFinite(cad)) cadences.push(cad);

    const power = readNumericByLocalName(p, ["power", "watts"]);
    if (Number.isFinite(power)) powers.push(power);

    const temp = readNumericByLocalName(p, ["atemp", "temp", "temperature"]);
    if (Number.isFinite(temp)) temperatures.push(temp);

    if (prev && Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(prev.lat) && Number.isFinite(prev.lon)) {
      distanceMeters += haversineMeters(prev.lat, prev.lon, lat, lon);
    }

    if (prev && Number.isFinite(ele) && Number.isFinite(prev.ele)) {
      const delta = ele - prev.ele;
      if (delta > 0) elevationGain += delta;
      if (delta < 0) elevationLoss += Math.abs(delta);
    }

    prev = { lat, lon, ele };
  }

  const startMs = times.length ? Math.min(...times) : NaN;
  const endMs = times.length ? Math.max(...times) : NaN;
  const totalSeconds =
    Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 1000 : NaN;

  const avgHr = heartRates.length
    ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
    : null;
  const maxHr = heartRates.length ? Math.max(...heartRates) : null;
  const avgCad = cadences.length
    ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
    : null;
  const avgPower = powers.length
    ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
    : null;
  const avgTemp = temperatures.length
    ? (temperatures.reduce((a, b) => a + b, 0) / temperatures.length).toFixed(1)
    : null;
  const totalCalories = calories.length ? Math.round(Math.max(...calories)) : null;
  const pacePerKm =
    Number.isFinite(distanceMeters) && distanceMeters > 0 ? totalSeconds / (distanceMeters / 1000) : NaN;

  const result = {
    activityName,
    activityType,
    gpxImages,
    trackPointCount: points.length,
    routePointCount: routes,
    startMs,
    endMs,
    totalSeconds,
    distanceMeters,
    elevationGain,
    elevationLoss,
    avgHr,
    maxHr,
    avgCad,
    avgPower,
    avgTemp,
    totalCalories,
    pacePerKm
  };

  const debug = {
    status: "ok",
    format: "gpx",
    activityName,
    activityType,
    startTime: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    endTime: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
    totalDurationSeconds: Number.isFinite(totalSeconds) ? Math.round(totalSeconds) : null,
    distanceMeters: Math.round(distanceMeters),
    averageSpeedKph:
      Number.isFinite(totalSeconds) && totalSeconds > 0
        ? Number(((distanceMeters / 1000) / (totalSeconds / 3600)).toFixed(2))
        : null,
    averagePaceSecondsPerKm: Number.isFinite(pacePerKm) ? Math.round(pacePerKm) : null,
    averageHeartRate: avgHr,
    maxHeartRate: maxHr,
    calories: totalCalories,
    elevationGainMeters: Math.round(elevationGain),
    elevationLossMeters: Math.round(elevationLoss),
    averageCadence: avgCad,
    averagePowerWatts: avgPower,
    averageTemperatureC: avgTemp !== null ? Number(avgTemp) : null,
    trackPointCount: points.length,
    routePointCount: routes
  };

  return { ok: true, result, gpxImages, debug };
}
