/**
 * Device-session telemetry.
 *
 * Everything in this module describes the DEVICE and the SESSION, never the
 * business. Values a business decision would rest on (GMV, order counts, sign-in
 * totals) are derived by Postgres, not collected here.
 *
 * Two rules shape the code below:
 *   1. A value the browser cannot report is `null`, never `0`. `0` would read as
 *      a real measurement of zero — "battery 0%", "0 GB of memory" — while
 *      `null` says "this browser did not tell us", which is the truth on iOS.
 *   2. Nothing here may throw. Telemetry is the least important thing the app
 *      does, so every probe is optional and every read is guarded.
 *
 * The key names are the `device_sessions` column names verbatim; the write path
 * sends the payload through unmodified. `captured_by` is deliberately NOT here:
 * it says which path wrote the row, so the writer sets it, not the payload.
 */

import { getStoredStoreLocation } from './location.ts';

export interface DeviceSessionPayload {
  session_id: string;
  install_id: string;
  app_version: string | null;
  is_returning_device: boolean;

  started_at: string;
  last_active_at: string;
  session_duration_sec: number;
  current_page_url: string | null;
  referrer_url: string | null;

  device_category: string | null;
  operating_system: string | null;
  os_version: string | null;
  browser_name: string | null;
  browser_version: string | null;
  user_agent_string: string | null;
  device_memory_gb: number | null;
  hardware_concurrency: number | null;
  device_pixel_ratio: number | null;
  screen_width_css: number | null;
  screen_height_css: number | null;
  screen_width_physical: number | null;
  screen_height_physical: number | null;
  device_orientation: string | null;

  browser_language: string | null;
  current_timezone: string | null;
  timezone_offset_minutes: number | null;

  is_online: boolean | null;
  network_effective_type: string | null;
  downlink_speed_mbps: number | null;
  round_trip_time_ms: number | null;
  is_data_saver_mode: boolean | null;
  is_cookies_enabled: boolean | null;

  battery_level_percentage: number | null;
  is_device_charging: boolean | null;

  app_performance_load_time_ms: number | null;
  dom_interactive_time_ms: number | null;
  ssl_handshake_duration_ms: number | null;

  session_timeout_count: number;
  sync_error_count: number;

  // deep signals — cheap scalar reads, null when the browser cannot report them
  ua_ch_platform: string | null;
  gpu_renderer: string | null;
  storage_quota_bytes: number | null;
  storage_usage_bytes: number | null;
  display_mode: string | null;
  color_scheme: string | null;
  prefers_reduced_motion: boolean | null;
  prefers_reduced_data: boolean | null;
  max_touch_points: number | null;
  viewport_width_css: number | null;
  viewport_height_css: number | null;
  color_depth: number | null;
  active_time_sec: number;
  page_view_count: number;
  cpu_pressure: string | null;

  // the store's ALREADY-captured position, reused — never re-prompted
  geo_lat: number | null;
  geo_lng: number | null;
  geo_accuracy_m: number | null;
  geo_altitude_m: number | null;
  geo_speed_mps: number | null;
  geo_heading_deg: number | null;
  geo_source: string | null;

  // forward-compat bucket, so a new signal need not wait for a column
  extra: Record<string, unknown>;
}

export interface UserAgentInfo {
  device_category: 'Mobile' | 'Tablet' | 'Desktop';
  operating_system: string | null;
  os_version: string | null;
  browser_name: string | null;
  browser_version: string | null;
}

/**
 * The Network Information API, Device Memory and Battery Status are not in
 * `lib.dom`, and are Chromium-only besides. Declaring them optional is the
 * honest shape: absent on iOS Safari, which is why the payload allows null.
 */
declare global {
  interface Navigator {
    deviceMemory?: number;
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
    getBattery?: () => Promise<{ level?: number; charging?: boolean }>;
  }
}

const INSTALL_ID_KEY = 'dukan-install-id';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_CHARS = /[._]/g;

// ---------------------------------------------------------------------------
// Session and install identity
// ---------------------------------------------------------------------------

/** A fresh id per app load. Two calls within one load describe one session. */
const SESSION_ID = randomUuid();

function randomUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* fall through to the non-cryptographic path */
  }
  // Only reached where WebCrypto is unavailable. Uniqueness still matters more
  // than unpredictability here: this id identifies a browser, not a person.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStoredInstallId(): string | null {
  try {
    const value = window.localStorage.getItem(INSTALL_ID_KEY);
    return value && UUID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether this browser had already been here before THIS load.
 *
 * Captured once at module load, not per call: the app calls the collector once
 * per load, but a reload must still be able to tell a new device from a
 * returning one, and a second call inside the same load must not flip the answer.
 */
const INSTALL_ID_EXISTED_AT_BOOT = readStoredInstallId() !== null;

/** Stable across visits; created on first use and then persisted. */
export function getInstallId(): string {
  const stored = readStoredInstallId();
  if (stored) return stored;

  const created = randomUuid();
  try {
    window.localStorage.setItem(INSTALL_ID_KEY, created);
  } catch {
    // Private mode or storage disabled: the id lives for this load only.
  }
  return created;
}

// ---------------------------------------------------------------------------
// Session health counters
// ---------------------------------------------------------------------------

let failedRequestCount = 0;
let syncErrorCount = 0;
let fetchInstrumented = false;

/** Count a request that failed or timed out. Feeds `session_timeout_count`. */
export function noteFailedRequest(): void {
  failedRequestCount += 1;
}

/** Count a cloud sync that failed. Feeds `sync_error_count`. */
export function noteSyncError(): void {
  syncErrorCount += 1;
}

export function getFailedRequestCount(): number {
  return failedRequestCount;
}

export function getSyncErrorCount(): number {
  return syncErrorCount;
}

/**
 * Wrap `fetch` so an unreachable backend is recorded rather than only logged.
 * Idempotent, so a hot reload cannot nest wrappers.
 */
export function instrumentRequestFailures(): void {
  if (fetchInstrumented || typeof globalThis.fetch !== 'function') return;
  fetchInstrumented = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  const wrappedFetch: typeof fetch = async (...args) => {
    try {
      return await originalFetch(...args);
    } catch (error) {
      noteFailedRequest();
      throw error;
    }
  };
  globalThis.fetch = wrappedFetch;
}

// ---------------------------------------------------------------------------
// Deep signals and the once-a-day cadence
// ---------------------------------------------------------------------------
// Everything here is cheap or runs at most once per 24h. The point of the
// cadence gate is to keep the app load FAST: the heavy probes (storage estimate,
// CPU pressure) are kicked off in the background, at most once a day, and the
// payload reads whatever the last run left behind rather than waiting on it.

const SESSION_START_MS = Date.now();
const DAILY_PROBE_KEY = 'dukan-last-daily-probe';
const DAILY_SIGNALS_KEY = 'dukan-last-daily-signals';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a heavy probe may run now. Pure, so it is tested against fixed clocks
 * rather than the wall clock, and a missing/!invalid last run is always "yes".
 */
export function shouldRunDailyProbe(lastIso: string | null, nowIso: string): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return true;
  return now - last >= DAY_MS;
}

interface DailySignals {
  storage_quota_bytes: number | null;
  storage_usage_bytes: number | null;
  cpu_pressure: string | null;
  gpu_renderer: string | null;
}

const NO_DAILY_SIGNALS: DailySignals = {
  storage_quota_bytes: null,
  storage_usage_bytes: null,
  cpu_pressure: null,
  gpu_renderer: null,
};

/** The last heavy-probe result, or nulls. Never blocks; never throws. */
function readDailySignals(): DailySignals {
  try {
    const raw = window.localStorage.getItem(DAILY_SIGNALS_KEY);
    if (!raw) return NO_DAILY_SIGNALS;
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      storage_quota_bytes: asNumber(value?.storage_quota_bytes),
      storage_usage_bytes: asNumber(value?.storage_usage_bytes),
      cpu_pressure: asText(value?.cpu_pressure),
      gpu_renderer: asText(value?.gpu_renderer),
    };
  } catch {
    return NO_DAILY_SIGNALS;
  }
}

async function storageMetrics(): Promise<Pick<DailySignals, 'storage_quota_bytes' | 'storage_usage_bytes'>> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return { storage_quota_bytes: asNumber(estimate?.quota), storage_usage_bytes: asNumber(estimate?.usage) };
  } catch {
    return { storage_quota_bytes: null, storage_usage_bytes: null };
  }
}

/** The Compute Pressure state, sampled for a bounded moment. Chromium desktop
 *  only; every other browser returns null without hanging the (background) run. */
async function cpuPressureOnce(ms = 1500): Promise<string | null> {
  const PressureObserverCtor = (globalThis as any).PressureObserver;
  if (typeof PressureObserverCtor !== 'function') return null;
  try {
    const state = await new Promise<string | null>((resolve) => {
      let observer: any;
      const timer = setTimeout(() => {
        // Leave no observer running when the sample window closes empty.
        try { observer?.disconnect(); } catch { /* ignore */ }
        resolve(null);
      }, ms);
      try {
        observer = new PressureObserverCtor((records: any[]) => {
          const record = records?.[records.length - 1];
          if (record) {
            clearTimeout(timer);
            try { observer.disconnect(); } catch { /* ignore */ }
            resolve(record.state ?? null);
          }
        });
        observer.observe('cpu', { sampleInterval: 1000 }).catch(() => { clearTimeout(timer); resolve(null); });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
    return asText(state);
  } catch {
    return null;
  }
}

let dailyProbeStarted = false;

/** Kick the heavy probes off in the background, at most once per 24h and once
 *  per load. Never awaited by the caller, so it cannot delay the app. */
function maybeRunDailyProbe(): void {
  if (dailyProbeStarted) return;
  dailyProbeStarted = true;
  try {
    if (!shouldRunDailyProbe(window.localStorage.getItem(DAILY_PROBE_KEY), new Date().toISOString())) return;
  } catch {
    return;
  }
  void (async () => {
    const storage = await storageMetrics();
    const cpu_pressure = await cpuPressureOnce();
    // The GPU read builds a WebGL context, so it rides the DAILY probe rather
    // than every load: the boot path must not pay for it.
    const signals: DailySignals = { ...storage, cpu_pressure, gpu_renderer: gpuRenderer() };
    try {
      window.localStorage.setItem(DAILY_SIGNALS_KEY, JSON.stringify(signals));
      window.localStorage.setItem(DAILY_PROBE_KEY, new Date().toISOString());
    } catch { /* storage disabled: the probe simply runs again next load */ }
  })();
}

/** The WebGL renderer: a coarse device-tier signal (the GPU tells Apple from a
 *  low-end Android). Cheap and synchronous, so it is read every load. */
function gpuRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
    return asText(renderer);
  } catch {
    return null;
  }
}

function matches(media: string): boolean | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(media).matches : null;
  } catch {
    return null;
  }
}

function displayMetrics(): {
  display_mode: string | null;
  color_scheme: string | null;
  prefers_reduced_motion: boolean | null;
  prefers_reduced_data: boolean | null;
  max_touch_points: number | null;
  viewport_width_css: number | null;
  viewport_height_css: number | null;
  color_depth: number | null;
} {
  try {
    const standalone = matches('(display-mode: standalone)') === true ||
      (navigator as any).standalone === true;
    const dark = matches('(prefers-color-scheme: dark)');
    return {
      display_mode: standalone === null ? null : standalone ? 'standalone' : 'browser',
      color_scheme: dark === null ? null : dark ? 'dark' : 'light',
      prefers_reduced_motion: matches('(prefers-reduced-motion: reduce)'),
      prefers_reduced_data: matches('(prefers-reduced-data: reduce)'),
      max_touch_points: asNumber(navigator.maxTouchPoints),
      viewport_width_css: asNumber(window.innerWidth),
      viewport_height_css: asNumber(window.innerHeight),
      color_depth: asNumber(window.screen?.colorDepth),
    };
  } catch {
    return {
      display_mode: null, color_scheme: null, prefers_reduced_motion: null,
      prefers_reduced_data: null, max_touch_points: null,
      viewport_width_css: null, viewport_height_css: null, color_depth: null,
    };
  }
}

function geoFromStore(): {
  geo_lat: number | null; geo_lng: number | null; geo_accuracy_m: number | null;
  geo_altitude_m: number | null; geo_speed_mps: number | null;
  geo_heading_deg: number | null; geo_source: string | null;
} {
  // REUSE the position captured once at onboarding / the catalog gate. Reading
  // `navigator.geolocation` here would re-prompt the owner on every load.
  const location = getStoredStoreLocation();
  if (!location) {
    return {
      geo_lat: null, geo_lng: null, geo_accuracy_m: null,
      geo_altitude_m: null, geo_speed_mps: null, geo_heading_deg: null, geo_source: null,
    };
  }
  return {
    geo_lat: asNumber(location.lat),
    geo_lng: asNumber(location.lng),
    geo_accuracy_m: asNumber(location.accuracy_m),
    geo_altitude_m: null,
    geo_speed_mps: null,
    geo_heading_deg: null,
    geo_source: 'store_location',
  };
}

function uaChPlatform(): string | null {
  try {
    return asText((navigator as any).userAgentData?.platform);
  } catch {
    return null;
  }
}

let pageViewCount = 1;
let pageViewTracked = false;

/** Count foreground returns for this session. One passive listener, added lazily. */
function trackPageViews(): void {
  if (pageViewTracked || typeof document === 'undefined') return;
  pageViewTracked = true;
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pageViewCount += 1;
    });
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// User agent
// ---------------------------------------------------------------------------

function versionFrom(pattern: RegExp, source: string): string | null {
  const match = source.match(pattern);
  if (!match) return null;
  const version = match[1].replace(VERSION_CHARS, '.');
  return version || null;
}

/**
 * Classify a user-agent string.
 *
 * Order matters throughout: an iPad reports `Mobile` and a Chrome user agent on
 * iOS says `Safari`, so the more specific test has to come first or every tablet
 * is a phone and every iOS browser is Safari.
 */
export function parseUserAgent(userAgent: string): UserAgentInfo {
  const ua = userAgent || '';

  let device_category: UserAgentInfo['device_category'] = 'Desktop';
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T\d/i.test(ua)) {
    device_category = 'Tablet';
  } else if (/Mobile|iPhone|iPod|Windows Phone|Android/i.test(ua)) {
    // An Android tablet omits `Mobile` from its user agent and is caught above.
    device_category = 'Mobile';
  }

  let operating_system: string | null = null;
  let os_version: string | null = null;
  if (/iPad|iPhone|iPod/.test(ua)) {
    operating_system = 'iOS';
    os_version = versionFrom(/(?:CPU (?:iPhone )?OS |CPU OS )(\d+[._]\d+(?:[._]\d+)?)/, ua);
  } else if (/Android/.test(ua)) {
    operating_system = 'Android';
    os_version = versionFrom(/Android (\d+(?:\.\d+)*)/, ua);
  } else if (/Windows NT/.test(ua)) {
    operating_system = 'Windows';
    os_version = versionFrom(/Windows NT ([\d.]+)/, ua);
  } else if (/Mac OS X/.test(ua)) {
    operating_system = 'macOS';
    os_version = versionFrom(/Mac OS X ([\d_.]+)/, ua);
  } else if (/CrOS/.test(ua)) {
    operating_system = 'ChromeOS';
  } else if (/Linux/.test(ua)) {
    operating_system = 'Linux';
  }

  let browser_name: string | null = null;
  let browser_version: string | null = null;
  const browsers: Array<[string, RegExp]> = [
    ['Edge', /Edg[A-Z]?\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:CriOS|Chrome)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, pattern] of browsers) {
    const version = versionFrom(pattern, ua);
    if (version) {
      browser_name = name;
      browser_version = version;
      break;
    }
  }

  return { device_category, operating_system, os_version, browser_name, browser_version };
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `getTimezoneOffset()` is minutes WEST of UTC; we record minutes EAST. */
function timezoneOffsetMinutes(): number | null {
  try {
    const offset = new Date().getTimezoneOffset();
    return Number.isFinite(offset) ? -offset : null;
  } catch {
    return null;
  }
}

function currentTimezone(): string | null {
  try {
    return asText(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

function navigationTimings(): {
  app_performance_load_time_ms: number | null;
  dom_interactive_time_ms: number | null;
  ssl_handshake_duration_ms: number | null;
} {
  const blank = {
    app_performance_load_time_ms: null,
    dom_interactive_time_ms: null,
    ssl_handshake_duration_ms: null,
  };
  try {
    const entries = performance.getEntriesByType('navigation');
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (!nav || typeof nav.startTime !== 'number') return blank;

    const elapsed = (mark: number) =>
      Number.isFinite(mark) && mark > 0 ? Math.round(mark - nav.startTime) : null;

    return {
      app_performance_load_time_ms: elapsed(nav.loadEventEnd),
      dom_interactive_time_ms: elapsed(nav.domInteractive),
      // secureConnectionStart is 0 on a plain-HTTP or reused connection, where
      // the subtraction would report a fake handshake duration.
      ssl_handshake_duration_ms:
        Number.isFinite(nav.secureConnectionStart) && nav.secureConnectionStart > 0
          ? Math.round(nav.connectEnd - nav.secureConnectionStart)
          : null,
    };
  } catch {
    return blank;
  }
}

function screenMetrics(): {
  device_pixel_ratio: number | null;
  screen_width_css: number | null;
  screen_height_css: number | null;
  screen_width_physical: number | null;
  screen_height_physical: number | null;
  device_orientation: string | null;
} {
  try {
    const dpr = finiteOrNull(window.devicePixelRatio) ?? 1;
    const width = finiteOrNull(window.screen?.width);
    const height = finiteOrNull(window.screen?.height);
    const toPhysical = (value: number | null) =>
      value === null ? null : Math.round(value * dpr);

    const orientationType = window.screen?.orientation?.type;
    const orientation =
      typeof orientationType === 'string' && orientationType.length > 0
        ? orientationType.startsWith('landscape')
          ? 'landscape'
          : 'portrait'
        : window.innerWidth >= window.innerHeight
          ? 'landscape'
          : 'portrait';

    return {
      device_pixel_ratio: dpr,
      screen_width_css: width,
      screen_height_css: height,
      screen_width_physical: toPhysical(width),
      screen_height_physical: toPhysical(height),
      device_orientation: orientation,
    };
  } catch {
    return {
      device_pixel_ratio: null,
      screen_width_css: null,
      screen_height_css: null,
      screen_width_physical: null,
      screen_height_physical: null,
      device_orientation: null,
    };
  }
}

function networkMetrics(): {
  is_online: boolean | null;
  network_effective_type: string | null;
  downlink_speed_mbps: number | null;
  round_trip_time_ms: number | null;
  is_data_saver_mode: boolean | null;
} {
  try {
    const connection = navigator.connection;
    return {
      is_online: asBoolean(navigator.onLine),
      network_effective_type: asText(connection?.effectiveType),
      downlink_speed_mbps: asNumber(connection?.downlink),
      round_trip_time_ms: asNumber(connection?.rtt),
      is_data_saver_mode: asBoolean(connection?.saveData),
    };
  } catch {
    return {
      is_online: null,
      network_effective_type: null,
      downlink_speed_mbps: null,
      round_trip_time_ms: null,
      is_data_saver_mode: null,
    };
  }
}

/**
 * Battery is only exposed through a promise, and only by Chromium.
 *
 * `level` is 0..1; it is stored as a whole percentage. A battery at exactly 1.0
 * is 100% and is NOT a missing value, so the check is on the type, not on truth.
 */
async function batteryMetrics(): Promise<{
  battery_level_percentage: number | null;
  is_device_charging: boolean | null;
}> {
  const blank = { battery_level_percentage: null, is_device_charging: null };
  try {
    const getBattery = navigator.getBattery;
    if (typeof getBattery !== 'function') return blank;

    const battery = await getBattery.call(navigator);
    const level = asNumber(battery?.level);
    return {
      battery_level_percentage: level === null ? null : Math.round(level * 100),
      is_device_charging: asBoolean(battery?.charging),
    };
  } catch {
    return blank;
  }
}

/**
 * Build this load's session row.
 *
 * Async only because the battery API is promise-based; everything else is read
 * synchronously. Call it once per app load for a signed-in owner, and never for
 * a guest — a guest has no account to attribute the row to.
 */
export async function collectDeviceSession(): Promise<DeviceSessionPayload> {
  maybeRunDailyProbe();
  trackPageViews();
  const daily = readDailySignals();
  const startedAt = new Date().toISOString();
  const identity = parseUserAgent(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
  );
  const battery = await batteryMetrics();
  const timings = navigationTimings();

  return {
    session_id: SESSION_ID,
    install_id: getInstallId(),
    app_version: asText(import.meta.env?.VITE_APP_VERSION) ?? 'dev',
    is_returning_device: INSTALL_ID_EXISTED_AT_BOOT,

    started_at: startedAt,
    last_active_at: startedAt,
    session_duration_sec: 0,
    current_page_url: asText(window.location?.href),
    referrer_url: asText(document.referrer),

    device_category: identity.device_category,
    operating_system: identity.operating_system,
    os_version: identity.os_version,
    browser_name: identity.browser_name,
    browser_version: identity.browser_version,
    user_agent_string: asText(navigator.userAgent),
    device_memory_gb: asNumber(navigator.deviceMemory),
    hardware_concurrency: asNumber(navigator.hardwareConcurrency),
    ...screenMetrics(),

    browser_language: asText(navigator.language),
    current_timezone: currentTimezone(),
    timezone_offset_minutes: timezoneOffsetMinutes(),

    ...networkMetrics(),
    is_cookies_enabled: asBoolean(navigator.cookieEnabled),

    ...battery,

    ...timings,

    session_timeout_count: failedRequestCount,
    sync_error_count: syncErrorCount,

    ...displayMetrics(),
    ua_ch_platform: uaChPlatform(),
    gpu_renderer: daily.gpu_renderer,
    storage_quota_bytes: daily.storage_quota_bytes,
    storage_usage_bytes: daily.storage_usage_bytes,
    cpu_pressure: daily.cpu_pressure,
    active_time_sec: Math.round((Date.now() - SESSION_START_MS) / 1000),
    page_view_count: pageViewCount,

    ...geoFromStore(),

    extra: {},
  };
}
