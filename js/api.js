/**
 * Muse Elastic Planner - 일정 API & 로컬 스토리지 어댑터
 *
 * - agent : Supabase Edge Function (`agent-api`) /v1/schedules REST 연동
 *           API 주소와 Bearer 토큰은 소스 코드에 하드코딩하지 않고
 *           브라우저 localStorage 또는 gitignore 된 js/config.local.js 에서 읽어옵니다.
 * - local : 서버 연결 전 미리보기/오프라인용 브라우저 localStorage 저장
 */

(function (global) {
  const SETTINGS_KEY = "muse_planner_api_settings_v2";
  const DAY_STORAGE_PREFIX = "muse_planner_schedules_day_v2_";
  const AGENT_CACHE_PREFIX = "muse_planner_agent_cache_v2_";
  const WIDGETS_STORAGE_PREFIX = "muse_planner_widgets_v2_";
  const PREFS_KEY = "muse_planner_ui_prefs_v2";
  const ROUTINE_TEMPLATES_KEY = "muse_planner_routine_templates_v2";
  const ROUTINE_APPLIED_PREFIX = "muse_planner_routine_applied_v2_";

  const KST_TIMEZONE = "Asia/Seoul";
  const SUPABASE_DEFAULT_URL = "https://vetwwxmujaiwwwpjurpr.supabase.co";
  const SUPABASE_DEFAULT_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldHd3eG11amFpd3d3cGp1cnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTQxNDEsImV4cCI6MjEwODY3MDE0MX0.XYxgyeN-vWZ5MDtJGG4hJaIdNH29L1eFQNnCivoXr6M";
  const SCHEDULE_COLUMNS =
    "id, date, start_at, end_at, title, type, done, done_at, source, memo, template_id, created_at, updated_at";

  const DEFAULT_SETTINGS = {
    mode: "supabase", // 'supabase' | 'agent' | 'local'
    localExplicit: false,
    agentApiUrl: "",
    agentApiToken: ""
  };

  const DEFAULT_PREFS = {
    theme: "dark",
    snapMin: 15,
    pxPerMin: 1.45,
    cascadeMode: true,
    earlyCollapsed: true,
    earlyStartHour: 0,
    earlyEndHour: 7,
    defaultDurationMin: 30,
    dimCompleted: true,
    browserNotify: false,
    showPlacedList: true,
    placedTasksOnly: false,
    untimedCollapsed: false,
    placedCollapsed: false,
    reminderCollapsed: false,
    widgets: {
      summary: true,
      youtube: true,
      memo: true
    },
    presets: [
      { id: "pre_schedule", icon: "📅", title: "집중 일정", durationMin: 60, type: "schedule" },
      { id: "pre_task", icon: "✅", title: "할 일", durationMin: 30, type: "task" },
      { id: "pre_reminder", icon: "🔔", title: "체크 알림", durationMin: 0, type: "reminder" },
      { id: "pre_routine", icon: "🏃", title: "운동/루틴", durationMin: 60, type: "schedule" },
      { id: "pre_break", icon: "☕", title: "휴식/정리", durationMin: 15, type: "schedule" }
    ]
  };

  const TEST_SEED_2026_11_14 = [
    { start: "11:30", end: "12:00", title: "점심 준비 + KT VVIP 사용", type: "task", source: "app", memo: "" },
    { start: "12:00", end: "13:00", title: "점심", type: "schedule", source: "app", memo: "" },
    { start: "13:00", end: "14:00", title: "홈트 토요일 루틴", type: "schedule", source: "app", memo: "" },
    { start: "14:00", end: "14:30", title: "샤워하고 쉬기", type: "schedule", source: "app", memo: "" },
    { start: "14:30", end: "15:30", title: "방 정리 (속초 짐 풀기 포함)", type: "task", source: "app", memo: "" },
    { start: "15:30", end: "17:30", title: "자유 시간", type: "schedule", source: "app", memo: "" },
    { start: "19:38", end: null, title: "갤럭시 스토어 출석체크", type: "reminder", source: "app", memo: "" },
    { start: "21:38", end: null, title: "ZZZ 리딤 코드 확인", type: "reminder", source: "app", memo: "" },
    { start: "23:00", end: null, title: "취침 준비", type: "schedule", source: "app", memo: "" }
  ];

  function uid(prefix = "local") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clampInt(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /* -------------------- 한국 시간(KST, Asia/Seoul) 유틸 -------------------- */

  function getKstDateTimeParts(dateObj = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: KST_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const map = {};
    for (const part of formatter.formatToParts(dateObj)) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }
    const hourNum = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const minuteNum = Number(map.minute);
    return {
      date: `${map.year}-${map.month}-${map.day}`,
      hour: hourNum,
      minute: minuteNum,
      totalMin: hourNum * 60 + minuteNum
    };
  }

  function todayKst() {
    return getKstDateTimeParts(new Date()).date;
  }

  function nowKstMinutes() {
    return getKstDateTimeParts(new Date()).totalMin;
  }

  function shiftDateStr(dateStr, deltaDays) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
    return utc.toISOString().slice(0, 10);
  }

  function kstMinutesToIso(dateStr, totalMin) {
    if (totalMin === null || totalMin === undefined) return null;
    const clamped = clampInt(totalMin, 0, 1440, 540);
    if (clamped === 1440) {
      const nextDate = shiftDateStr(dateStr, 1);
      return `${nextDate}T00:00:00+09:00`;
    }
    const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
    const mm = String(clamped % 60).padStart(2, "0");
    return `${dateStr}T${hh}:${mm}:00+09:00`;
  }

  function hhmmToMinutes(str) {
    if (!str) return null;
    const [hh, mm] = String(str).split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return clampInt(hh * 60 + mm, 0, 1440, 540);
  }

  function minutesToHhmm(totalMin) {
    const m = clampInt(totalMin, 0, 1440, 540);
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  /* -------------------- 설정 & 환경변수 분리 로드 -------------------- */

  function getSettings() {
    return {
      ...DEFAULT_SETTINGS,
      mode: "supabase"
    };
  }

  function saveSettings(next) {
    const mode = ["supabase", "agent", "local"].includes(next.mode) ? next.mode : "supabase";
    const merged = {
      ...DEFAULT_SETTINGS,
      ...next,
      mode,
      localExplicit: mode === "local" ? Boolean(next.localExplicit) : false,
      agentApiUrl: String(next.agentApiUrl || "").trim().replace(/\/+$/, ""),
      agentApiToken: String(next.agentApiToken || "").trim()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  function encodeBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeBase64Url(b64u) {
    const norm = String(b64u || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function applyHashConnection() {
    const hash = global.location?.hash || "";
    if (!hash || hash.length < 2) return { applied: false };

    let api = "";
    let token = "";
    try {
      const params = new URLSearchParams(hash.slice(1));
      const connectParam = params.get("connect");
      if (connectParam) {
        const parsed = JSON.parse(decodeBase64Url(connectParam));
        if (parsed && typeof parsed === "object") {
          api = String(parsed.api || parsed.url || parsed.u || "").trim();
          token = String(parsed.token || parsed.t || "").trim();
        }
      } else if (params.has("api") || params.has("token")) {
        api = String(params.get("api") || "").trim();
        token = String(params.get("token") || "").trim();
      }
    } catch {
      return { applied: false };
    }

    if (!/^https?:\/\/.+/i.test(api) || !token) {
      return { applied: false };
    }

    saveSettings({
      mode: "agent",
      agentApiUrl: api,
      agentApiToken: token
    });

    try {
      const cleanUrl = `${global.location.pathname || "/"}${global.location.search || ""}`;
      global.history?.replaceState?.(null, "", cleanUrl);
    } catch {
      // ignore history errors
    }

    return { applied: true, api };
  }

  function buildConnectUrl(customUrl, customToken) {
    const s = getSettings();
    const api = String(customUrl !== undefined ? customUrl : s.agentApiUrl || "").trim().replace(/\/+$/, "");
    const token = String(customToken !== undefined ? customToken : s.agentApiToken || "").trim();
    if (!/^https?:\/\/.+/i.test(api) || !token) {
      return null;
    }
    const base = `${global.location.origin}${global.location.pathname}`;
    const encoded = encodeBase64Url(JSON.stringify({ api, token }));
    return `${base}#connect=${encoded}`;
  }

  let cloudPrefsSyncTimer = null;

  function normalizePrefs(parsed) {
    if (!parsed || typeof parsed !== "object") return structuredCloneSafe(DEFAULT_PREFS);

    const snapNum = Number(parsed.snapMin);
    const zoomNum = Number(parsed.pxPerMin);
    const durNum = Number(parsed.defaultDurationMin);
    const earlyStartHour = clampInt(parsed.earlyStartHour, 0, 11, DEFAULT_PREFS.earlyStartHour);
    let earlyEndHour = clampInt(parsed.earlyEndHour, 1, 12, DEFAULT_PREFS.earlyEndHour);
    if (earlyEndHour <= earlyStartHour) {
      earlyEndHour = Math.min(12, earlyStartHour + 1);
    }
    const updatedAt = Number(parsed._updatedAt);
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      snapMin: [5, 10, 15, 30].includes(snapNum) ? snapNum : DEFAULT_PREFS.snapMin,
      pxPerMin: Number.isFinite(zoomNum) ? Math.max(1.0, Math.min(2.4, zoomNum)) : DEFAULT_PREFS.pxPerMin,
      cascadeMode: typeof parsed.cascadeMode === "boolean" ? parsed.cascadeMode : DEFAULT_PREFS.cascadeMode,
      earlyCollapsed: typeof parsed.earlyCollapsed === "boolean" ? parsed.earlyCollapsed : DEFAULT_PREFS.earlyCollapsed,
      earlyStartHour,
      earlyEndHour,
      defaultDurationMin: [15, 30, 45, 60, 90].includes(durNum) ? durNum : DEFAULT_PREFS.defaultDurationMin,
      dimCompleted: typeof parsed.dimCompleted === "boolean" ? parsed.dimCompleted : DEFAULT_PREFS.dimCompleted,
      browserNotify: typeof parsed.browserNotify === "boolean" ? parsed.browserNotify : DEFAULT_PREFS.browserNotify,
      showPlacedList: typeof parsed.showPlacedList === "boolean" ? parsed.showPlacedList : DEFAULT_PREFS.showPlacedList,
      placedTasksOnly: typeof parsed.placedTasksOnly === "boolean" ? parsed.placedTasksOnly : DEFAULT_PREFS.placedTasksOnly,
      untimedCollapsed: typeof parsed.untimedCollapsed === "boolean" ? parsed.untimedCollapsed : DEFAULT_PREFS.untimedCollapsed,
      placedCollapsed: typeof parsed.placedCollapsed === "boolean" ? parsed.placedCollapsed : DEFAULT_PREFS.placedCollapsed,
      reminderCollapsed: typeof parsed.reminderCollapsed === "boolean" ? parsed.reminderCollapsed : DEFAULT_PREFS.reminderCollapsed,
      widgets: { ...DEFAULT_PREFS.widgets, ...(parsed.widgets || {}) },
      presets: Array.isArray(parsed.presets) && parsed.presets.length ? parsed.presets : structuredCloneSafe(DEFAULT_PREFS.presets),
      _updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
    };
  }

  function getPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return structuredCloneSafe(DEFAULT_PREFS);
      return normalizePrefs(JSON.parse(raw));
    } catch {
      return structuredCloneSafe(DEFAULT_PREFS);
    }
  }

  async function pushPrefsToCloudNow(prefs) {
    try {
      const sb = await getSupabaseClient().catch(() => null);
      if (!sb) return;
      const { data: sessData } = await sb.auth.getSession();
      if (!sessData?.session) return;
      await sb.auth.updateUser({
        data: {
          planner_prefs: normalizePrefs(prefs)
        }
      });
    } catch {
      // ignore cloud sync error
    }
  }

  function scheduleCloudPrefsPush(prefs) {
    if (cloudPrefsSyncTimer) clearTimeout(cloudPrefsSyncTimer);
    cloudPrefsSyncTimer = setTimeout(() => {
      cloudPrefsSyncTimer = null;
      pushPrefsToCloudNow(prefs);
    }, 500);
  }

  function savePrefs(prefs, options = {}) {
    const normalized = normalizePrefs(prefs);
    if (!options.preserveUpdatedAt) {
      normalized._updatedAt = Date.now();
    }
    if (prefs && typeof prefs === "object") {
      prefs._updatedAt = normalized._updatedAt;
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
    if (!options.skipCloudSync) {
      scheduleCloudPrefsPush(normalized);
    }
  }

  async function syncPrefsFromCloud() {
    try {
      const sb = await getSupabaseClient().catch(() => null);
      if (!sb) return null;
      const { data: sessData } = await sb.auth.getSession();
      if (!sessData?.session) return null;

      const { data: userData } = await sb.auth.getUser().catch(() => ({ data: null }));
      const cloudRaw = userData?.user?.user_metadata?.planner_prefs || sessData.session.user?.user_metadata?.planner_prefs;
      const local = getPrefs();
      const cloudUpdatedAt = Number(cloudRaw?._updatedAt) || 0;
      const localUpdatedAt = Number(local?._updatedAt) || 0;

      if (cloudRaw && typeof cloudRaw === "object" && cloudUpdatedAt > localUpdatedAt) {
        const synced = normalizePrefs(cloudRaw);
        savePrefs(synced, { skipCloudSync: true, preserveUpdatedAt: true });
        return synced;
      }
      if (localUpdatedAt > cloudUpdatedAt) {
        await pushPrefsToCloudNow(local);
      }
      return null;
    } catch {
      return null;
    }
  }

  function getDefaultPresets() {
    return structuredCloneSafe(DEFAULT_PREFS.presets);
  }

  function resetPrefsToDefault() {
    const fresh = structuredCloneSafe(DEFAULT_PREFS);
    savePrefs(fresh);
    return fresh;
  }

  /* -------------------- 스키마 정규화 (DB <-> 프론트 모델) -------------------- */

  function normalizeScheduleRecord(raw, fallbackDate) {
    const dateStr = raw.date || fallbackDate || todayKst();
    const type = ["schedule", "task", "reminder"].includes(raw.type) ? raw.type : "schedule";
    const source = raw.source === "muse" ? "muse" : "app";

    let startMin = null;
    let endMin = null;
    let hasStartAt = false;
    let hasEndAt = false;

    if (raw.start_at) {
      const sp = getKstDateTimeParts(new Date(raw.start_at));
      if (Number.isFinite(sp.totalMin)) {
        startMin = sp.date < dateStr ? 0 : sp.totalMin;
        hasStartAt = true;
      }
    } else if (typeof raw.startMin === "number") {
      startMin = clampInt(raw.startMin, 0, 1425, 540);
      hasStartAt = true;
    }

    if (raw.end_at && hasStartAt) {
      const ep = getKstDateTimeParts(new Date(raw.end_at));
      if (Number.isFinite(ep.totalMin)) {
        let candidateEnd = ep.date > dateStr && ep.totalMin === 0 ? 1440 : ep.totalMin;
        if (ep.date > dateStr && ep.totalMin > 0) candidateEnd = 1440;
        endMin = Math.max(startMin + 15, candidateEnd);
        hasEndAt = true;
      }
    } else if (typeof raw.endMin === "number" && hasStartAt) {
      endMin = Math.max(startMin + 15, clampInt(raw.endMin, 15, 1440, startMin + 30));
      hasEndAt = true;
    }

    // 종료 시각이 없는 알림/시작점 일정도 타임라인 블록 높이를 갖도록 visualEndMin 계산
    const visualEndMin = hasStartAt
      ? hasEndAt
        ? Math.min(1440, Math.max(startMin + 15, endMin))
        : Math.min(1440, startMin + (type === "reminder" ? 28 : 30))
      : null;

    return {
      id: raw.id || uid("loc"),
      date: dateStr,
      title: raw.title || "(제목 없음)",
      type,
      source,
      done: Boolean(raw.done),
      done_at: raw.done_at || null,
      memo: raw.memo ?? "",
      template_id: raw.template_id ?? null,
      start_at: raw.start_at || (hasStartAt ? kstMinutesToIso(dateStr, startMin) : null),
      end_at: raw.end_at || (hasEndAt ? kstMinutesToIso(dateStr, endMin) : null),
      hasStartAt,
      hasEndAt,
      startMin,
      endMin,
      visualEndMin,
      created_at: raw.created_at || null,
      updated_at: raw.updated_at || null
    };
  }

  function sortSchedules(items) {
    return [...items].sort((a, b) => {
      if (a.hasStartAt && !b.hasStartAt) return -1;
      if (!a.hasStartAt && b.hasStartAt) return 1;
      if (a.hasStartAt && b.hasStartAt && a.startMin !== b.startMin) {
        return a.startMin - b.startMin;
      }
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }

  /* -------------------- 로컬 데모 / 오프라인 저장소 -------------------- */

  function buildSeedSchedules(dateStr) {
    return TEST_SEED_2026_11_14.map((item, idx) => {
      const startMin = hhmmToMinutes(item.start);
      const endMin = item.end ? hhmmToMinutes(item.end) : null;
      return normalizeScheduleRecord(
        {
          id: uid(`seed${idx}`),
          date: dateStr,
          start_at: kstMinutesToIso(dateStr, startMin),
          end_at: endMin !== null ? kstMinutesToIso(dateStr, endMin) : null,
          title: item.title,
          type: item.type,
          done: false,
          done_at: null,
          source: item.source,
          memo: item.memo
        },
        dateStr
      );
    });
  }

  function loadLocalSchedules(dateStr) {
    const key = DAY_STORAGE_PREFIX + dateStr;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return sortSchedules(parsed.map((item) => normalizeScheduleRecord(item, dateStr)));
        }
      }
    } catch {
      // fall through
    }

    if (dateStr === "2026-11-14" || dateStr === todayKst()) {
      const seeded = sortSchedules(buildSeedSchedules(dateStr));
      saveLocalSchedules(dateStr, seeded);
      return seeded;
    }

    return [];
  }

  function saveLocalSchedules(dateStr, items) {
    localStorage.setItem(DAY_STORAGE_PREFIX + dateStr, JSON.stringify(sortSchedules(items)));
  }

  function resetLocalSeed(dateStr) {
    const seeded = sortSchedules(buildSeedSchedules(dateStr));
    saveLocalSchedules(dateStr, seeded);
    return seeded;
  }

  /* -------------------- 우측 보조 위젯 (로컬 저장) -------------------- */

  function loadWidgetsState(dateStr) {
    const key = WIDGETS_STORAGE_PREFIX + dateStr;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          youtubeList: Array.isArray(parsed.youtubeList) ? parsed.youtubeList : [],
          memo: typeof parsed.memo === "string" ? parsed.memo : ""
        };
      }
    } catch {
      // fallback
    }
    return {
      youtubeList:
        dateStr === todayKst()
          ? [
              {
                id: uid("yt"),
                title: "홈트 스트레칭 루틴 참고 영상",
                url: "https://www.youtube.com",
                durationMin: 20,
                done: false,
                addedBy: "직접 추가"
              }
            ]
          : [],
      memo: ""
    };
  }

  function saveWidgetsState(dateStr, state) {
    localStorage.setItem(
      WIDGETS_STORAGE_PREFIX + dateStr,
      JSON.stringify({
        youtubeList: state.youtubeList || [],
        memo: state.memo || ""
      })
    );
  }

  /* -------------------- Agent API REST 호출 (/v1/schedules) -------------------- */

  function assertAgentConfig(settings) {
    if (!settings.agentApiUrl) {
      throw new Error("API 주소가 비어 있습니다. 우측 상단 설정에서 Agent API URL을 입력해 주세요.");
    }
    if (!settings.agentApiToken) {
      throw new Error("인증 토큰이 비어 있습니다. 우측 상단 설정에서 Bearer 토큰을 입력해 주세요.");
    }
  }

  async function requestAgentApi(settings, pathWithQuery, options = {}) {
    assertAgentConfig(settings);
    const url = `${settings.agentApiUrl}${pathWithQuery}`;
    const headers = {
      Authorization: `Bearer ${settings.agentApiToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    };

    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      cache: "no-store",
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (res.status === 401) {
      throw new Error("인증 실패 (401): API Bearer 토큰을 다시 확인해 주세요.");
    }

    if (res.status === 204) {
      return null;
    }

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg = json?.error?.message || `API 오류 (${res.status})`;
      throw new Error(msg);
    }

    return json;
  }

  function getCachedSchedules(dateStr) {
    if (!dateStr) return null;
    try {
      const raw = localStorage.getItem(AGENT_CACHE_PREFIX + dateStr);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return sortSchedules(parsed.map((item) => normalizeScheduleRecord(item, dateStr)));
    } catch {
      return null;
    }
  }

  function setCachedSchedules(dateStr, items) {
    if (!dateStr || !Array.isArray(items)) return;
    try {
      localStorage.setItem(AGENT_CACHE_PREFIX + dateStr, JSON.stringify(sortSchedules(items)));
    } catch {
      // ignore quota errors
    }
  }

  function clearCachedSchedules(dateStr) {
    if (!dateStr) return;
    try {
      localStorage.removeItem(AGENT_CACHE_PREFIX + dateStr);
    } catch {
      // ignore storage errors
    }
  }

  async function fetchRealtimeConfig() {
    const settings = getSettings();
    if (settings.mode !== "agent" || !settings.agentApiUrl || !settings.agentApiToken) {
      return { enabled: false };
    }
    return requestAgentApi(settings, "/v1/realtime-config");
  }

  /* -------------------- Supabase Auth & DB 어댑터 -------------------- */

  let supabaseClientPromise = null;

  async function getSupabaseClient() {
    if (!supabaseClientPromise) {
      supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(
        ({ createClient }) =>
          createClient(SUPABASE_DEFAULT_URL, SUPABASE_DEFAULT_ANON_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false
            }
          })
      );
    }
    return supabaseClientPromise;
  }

  async function getSupabaseSession() {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.auth.getSession();
    if (error) throw new Error(error.message);
    return data?.session ?? null;
  }

  async function signInSupabase(email, password) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || "")
    });
    if (error) throw new Error(error.message || "로그인에 실패했습니다.");
    const cur = getSettings();
    saveSettings({ ...cur, mode: "supabase", localExplicit: false });
    return data?.session ?? null;
  }

  async function signOutSupabase() {
    const sb = await getSupabaseClient();
    const { error } = await sb.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async function requireSupabaseSession() {
    const session = await getSupabaseSession();
    if (!session) {
      throw new Error("로그인이 필요합니다. 상단 '로그인 필요' 버튼을 눌러 가계부 계정으로 로그인하세요.");
    }
    return session;
  }

  function updateCachedAfterPatch(normalized, dateHint) {
    const cacheDates = new Set([dateHint, normalized.date].filter(Boolean));
    for (const d of cacheDates) {
      const cached = getCachedSchedules(d);
      if (!cached) continue;
      if (d === normalized.date) {
        const exists = cached.some((item) => item.id === normalized.id);
        const next = exists
          ? cached.map((item) => (item.id === normalized.id ? normalized : item))
          : [...cached, normalized];
        setCachedSchedules(d, next);
      } else {
        setCachedSchedules(d, cached.filter((item) => item.id !== normalized.id));
      }
    }
  }

  async function fetchSchedules(dateStr, options = {}) {
    const { applyRoutines = true } = options;
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      if (applyRoutines) {
        try {
          await applyRoutinesForDate(dateStr);
        } catch {
          // 루틴 적용 실패 시에도 기존 일정 조회는 유지
        }
      }
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("schedules")
        .select(SCHEDULE_COLUMNS)
        .eq("date", dateStr)
        .order("start_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const normalized = sortSchedules(
        (Array.isArray(data) ? data : []).map((r) => normalizeScheduleRecord(r, dateStr))
      );
      setCachedSchedules(dateStr, normalized);
      return normalized;
    }
    if (settings.mode === "agent") {
      const rows = await requestAgentApi(settings, `/v1/schedules?date=${encodeURIComponent(dateStr)}`);
      const normalized = sortSchedules(
        (Array.isArray(rows) ? rows : []).map((r) => normalizeScheduleRecord(r, dateStr))
      );
      setCachedSchedules(dateStr, normalized);
      return normalized;
    }
    if (applyRoutines) {
      applyLocalRoutinesForDate(dateStr);
    }
    return loadLocalSchedules(dateStr);
  }

  async function fetchSchedulesRange(fromStr, toStr) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("schedules")
        .select(SCHEDULE_COLUMNS)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: true })
        .order("start_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return sortSchedules((Array.isArray(data) ? data : []).map((r) => normalizeScheduleRecord(r, r.date)));
    }
    if (settings.mode === "agent") {
      const rows = await requestAgentApi(
        settings,
        `/v1/schedules?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`
      );
      return sortSchedules((Array.isArray(rows) ? rows : []).map((r) => normalizeScheduleRecord(r, r.date)));
    }
    const items = [];
    let cursor = fromStr;
    let guard = 0;
    while (cursor <= toStr && guard < 31) {
      items.push(...loadLocalSchedules(cursor));
      cursor = shiftDateStr(cursor, 1);
      guard += 1;
    }
    return items;
  }

  async function createSchedule(payload) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const insertRow = {
        date: payload.date || todayKst(),
        start_at: payload.start_at ?? null,
        end_at: payload.end_at ?? null,
        title: String(payload.title || "").trim(),
        type: payload.type || "schedule",
        done: Boolean(payload.done),
        done_at: payload.done ? new Date().toISOString() : null,
        source: payload.source || "app",
        memo: payload.memo ?? null
      };
      const { data, error } = await sb
        .from("schedules")
        .insert(insertRow)
        .select(SCHEDULE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const normalized = normalizeScheduleRecord(data, insertRow.date);
      const cached = getCachedSchedules(normalized.date);
      if (cached) {
        setCachedSchedules(normalized.date, [...cached.filter((x) => x.id !== normalized.id), normalized]);
      }
      return normalized;
    }
    if (settings.mode === "agent") {
      const created = await requestAgentApi(settings, "/v1/schedules", {
        method: "POST",
        body: payload
      });
      const normalized = normalizeScheduleRecord(created, payload.date);
      const cached = getCachedSchedules(normalized.date);
      if (cached) {
        setCachedSchedules(normalized.date, [...cached.filter((x) => x.id !== normalized.id), normalized]);
      }
      return normalized;
    }

    const dateStr = payload.date || todayKst();
    const list = loadLocalSchedules(dateStr);
    const created = normalizeScheduleRecord(
      {
        id: uid("loc"),
        ...payload,
        done: Boolean(payload.done),
        done_at: payload.done ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      dateStr
    );
    list.push(created);
    saveLocalSchedules(dateStr, list);
    return created;
  }

  async function patchSchedule(id, patch, dateHint) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const updates = { ...patch };
      if ("done" in updates) {
        updates.done_at = updates.done ? new Date().toISOString() : null;
      }
      const { data, error } = await sb
        .from("schedules")
        .update(updates)
        .eq("id", id)
        .select(SCHEDULE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const normalized = normalizeScheduleRecord(data, dateHint);
      updateCachedAfterPatch(normalized, dateHint);
      return normalized;
    }
    if (settings.mode === "agent") {
      const updated = await requestAgentApi(settings, `/v1/schedules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch
      });
      const normalized = normalizeScheduleRecord(updated, dateHint);
      updateCachedAfterPatch(normalized, dateHint);
      return normalized;
    }

    const dateStr = dateHint || todayKst();
    const list = loadLocalSchedules(dateStr);
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new Error("일정을 찾을 수 없습니다.");
    }
    const prev = list[idx];
    const nextRaw = {
      id: prev.id,
      date: patch.date ?? prev.date,
      title: patch.title ?? prev.title,
      type: patch.type ?? prev.type,
      source: patch.source ?? prev.source,
      memo: "memo" in patch ? patch.memo : prev.memo,
      start_at: "start_at" in patch ? patch.start_at : prev.start_at,
      end_at: "end_at" in patch ? patch.end_at : prev.end_at,
      done: "done" in patch ? patch.done : prev.done,
      done_at:
        "done" in patch
          ? patch.done
            ? prev.done_at || new Date().toISOString()
            : null
          : prev.done_at,
      created_at: prev.created_at,
      updated_at: new Date().toISOString()
    };
    const normalized = normalizeScheduleRecord(nextRaw, nextRaw.date);
    list[idx] = normalized;
    saveLocalSchedules(dateStr, list);
    return normalized;
  }

  async function deleteSchedule(id, dateHint) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { error } = await sb.from("schedules").delete().eq("id", id);
      if (error) throw new Error(error.message);
      if (dateHint) {
        const cached = getCachedSchedules(dateHint);
        if (cached) {
          setCachedSchedules(dateHint, cached.filter((item) => item.id !== id));
        }
      }
      return;
    }
    if (settings.mode === "agent") {
      await requestAgentApi(settings, `/v1/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (dateHint) {
        const cached = getCachedSchedules(dateHint);
        if (cached) {
          setCachedSchedules(dateHint, cached.filter((item) => item.id !== id));
        }
      }
      return;
    }

    const dateStr = dateHint || todayKst();
    const list = loadLocalSchedules(dateStr).filter((item) => item.id !== id);
    saveLocalSchedules(dateStr, list);
  }

  /* -------------------- 반복 루틴 템플릿 CRUD & 날짜별 적용 -------------------- */

  const ROUTINE_COLUMNS =
    "id, title, type, start_time, duration_min, weekdays, memo, enabled, created_at, updated_at";

  function getKstWeekday(dateStr) {
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  }

  function normalizeWeekdays(raw) {
    if (!Array.isArray(raw)) return [0, 1, 2, 3, 4, 5, 6];
    const clean = [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
      (a, b) => a - b
    );
    return clean.length ? clean : [0, 1, 2, 3, 4, 5, 6];
  }

  function normalizeRoutineTemplate(raw) {
    const startTimeRaw = typeof raw?.start_time === "string" ? raw.start_time.trim() : "";
    const startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTimeRaw) ? startTimeRaw : null;
    return {
      id: raw?.id || uid("rt"),
      title: String(raw?.title || "").trim() || "(루틴)",
      type: ["schedule", "task", "reminder"].includes(raw?.type) ? raw.type : "schedule",
      start_time: startTime,
      duration_min: clampInt(raw?.duration_min, 0, 1440, 30),
      weekdays: normalizeWeekdays(raw?.weekdays),
      memo: raw?.memo ?? "",
      enabled: raw?.enabled !== false,
      created_at: raw?.created_at || null,
      updated_at: raw?.updated_at || null
    };
  }

  function loadLocalRoutines() {
    try {
      const raw = localStorage.getItem(ROUTINE_TEMPLATES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeRoutineTemplate) : [];
    } catch {
      return [];
    }
  }

  function saveLocalRoutines(list) {
    localStorage.setItem(ROUTINE_TEMPLATES_KEY, JSON.stringify(list));
  }

  function applyLocalRoutinesForDate(dateStr) {
    const templates = loadLocalRoutines().filter((t) => t.enabled);
    if (!templates.length) return 0;

    let appliedIds = [];
    try {
      const raw = localStorage.getItem(ROUTINE_APPLIED_PREFIX + dateStr);
      appliedIds = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(appliedIds)) appliedIds = [];
    } catch {
      appliedIds = [];
    }

    const appliedSet = new Set(appliedIds);
    const dow = getKstWeekday(dateStr);
    const dayList = loadLocalSchedules(dateStr);
    let inserted = 0;

    for (const tpl of templates) {
      if (!tpl.weekdays.includes(dow)) continue;
      if (appliedSet.has(tpl.id)) continue;

      appliedSet.add(tpl.id);
      const startMin = tpl.start_time ? hhmmToMinutes(tpl.start_time) : null;
      const startAt = startMin !== null ? kstMinutesToIso(dateStr, startMin) : null;
      const endAt =
        startMin !== null && tpl.duration_min > 0
          ? kstMinutesToIso(dateStr, startMin + tpl.duration_min)
          : null;

      dayList.push(
        normalizeScheduleRecord(
          {
            id: uid("loc"),
            date: dateStr,
            start_at: startAt,
            end_at: endAt,
            title: tpl.title,
            type: tpl.type,
            done: false,
            done_at: null,
            source: "app",
            memo: tpl.memo || "",
            template_id: tpl.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          dateStr
        )
      );
      inserted += 1;
    }

    localStorage.setItem(ROUTINE_APPLIED_PREFIX + dateStr, JSON.stringify([...appliedSet]));
    if (inserted > 0) {
      saveLocalSchedules(dateStr, dayList);
    }
    return inserted;
  }

  async function fetchRoutineTemplates() {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("routine_templates")
        .select(ROUTINE_COLUMNS)
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []).map(normalizeRoutineTemplate);
    }
    return loadLocalRoutines();
  }

  async function createRoutineTemplate(payload) {
    const clean = {
      title: String(payload?.title || "").trim(),
      type: ["schedule", "task", "reminder"].includes(payload?.type) ? payload.type : "schedule",
      start_time:
        typeof payload?.start_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(payload.start_time.trim())
          ? payload.start_time.trim()
          : null,
      duration_min: clampInt(payload?.duration_min, 0, 1440, 30),
      weekdays: normalizeWeekdays(payload?.weekdays),
      memo: payload?.memo ? String(payload.memo) : null,
      enabled: payload?.enabled !== false
    };

    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("routine_templates")
        .insert(clean)
        .select(ROUTINE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return normalizeRoutineTemplate(data);
    }

    const list = loadLocalRoutines();
    const created = normalizeRoutineTemplate({
      id: uid("rt"),
      ...clean,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    list.push(created);
    saveLocalRoutines(list);
    return created;
  }

  async function patchRoutineTemplate(id, patch) {
    const updateBody = {};
    if ("title" in patch) updateBody.title = String(patch.title || "").trim();
    if ("type" in patch) updateBody.type = ["schedule", "task", "reminder"].includes(patch.type) ? patch.type : "schedule";
    if ("start_time" in patch) {
      updateBody.start_time =
        typeof patch.start_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(patch.start_time.trim())
          ? patch.start_time.trim()
          : null;
    }
    if ("duration_min" in patch) updateBody.duration_min = clampInt(patch.duration_min, 0, 1440, 30);
    if ("weekdays" in patch) updateBody.weekdays = normalizeWeekdays(patch.weekdays);
    if ("memo" in patch) updateBody.memo = patch.memo ? String(patch.memo) : null;
    if ("enabled" in patch) updateBody.enabled = Boolean(patch.enabled);

    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("routine_templates")
        .update(updateBody)
        .eq("id", id)
        .select(ROUTINE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return normalizeRoutineTemplate(data);
    }

    const list = loadLocalRoutines();
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("루틴 템플릿을 찾을 수 없습니다.");
    const updated = normalizeRoutineTemplate({
      ...list[idx],
      ...updateBody,
      updated_at: new Date().toISOString()
    });
    list[idx] = updated;
    saveLocalRoutines(list);
    return updated;
  }

  async function deleteRoutineTemplate(id) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { error } = await sb.from("routine_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return;
    }

    const list = loadLocalRoutines().filter((t) => t.id !== id);
    saveLocalRoutines(list);
  }

  async function applyRoutinesForDate(dateStr) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb.rpc("apply_routines_for_date", {
        target_date: dateStr
      });
      if (error) throw new Error(error.message);
      return Number(data) || 0;
    }
    return applyLocalRoutinesForDate(dateStr);
  }

  async function seedTestSchedulesForDate(dateStr = "2026-11-14") {
    const existing = await fetchSchedules(dateStr);
    const existingSignatures = new Set(
      existing.map((ev) => `${ev.title}|${ev.hasStartAt ? minutesToHhmm(ev.startMin) : "none"}`)
    );
    let insertedCount = 0;

    for (const item of TEST_SEED_2026_11_14) {
      const sig = `${item.title}|${item.start}`;
      if (existingSignatures.has(sig)) continue;
      const startMin = hhmmToMinutes(item.start);
      const endMin = item.end ? hhmmToMinutes(item.end) : null;
      await createSchedule({
        date: dateStr,
        start_at: kstMinutesToIso(dateStr, startMin),
        end_at: endMin !== null ? kstMinutesToIso(dateStr, endMin) : null,
        title: item.title,
        type: item.type,
        source: item.source,
        memo: item.memo
      });
      insertedCount += 1;
    }

    return { insertedCount, items: await fetchSchedules(dateStr) };
  }

  global.PlannerAPI = {
    KST_TIMEZONE,
    TEST_SEED_2026_11_14,
    uid,
    todayKst,
    nowKstMinutes,
    shiftDateStr,
    kstMinutesToIso,
    hhmmToMinutes,
    minutesToHhmm,
    getSettings,
    saveSettings,
    applyHashConnection,
    buildConnectUrl,
    getSupabaseClient,
    getSupabaseSession,
    signInSupabase,
    signOutSupabase,
    getPrefs,
    savePrefs,
    syncPrefsFromCloud,
    getDefaultPresets,
    resetPrefsToDefault,
    resetLocalSeed,
    loadWidgetsState,
    saveWidgetsState,
    normalizeScheduleRecord,
    sortSchedules,
    getCachedSchedules,
    setCachedSchedules,
    clearCachedSchedules,
    fetchRealtimeConfig,
    fetchSchedules,
    fetchSchedulesRange,
    createSchedule,
    patchSchedule,
    deleteSchedule,
    fetchRoutineTemplates,
    createRoutineTemplate,
    patchRoutineTemplate,
    deleteRoutineTemplate,
    applyRoutinesForDate,
    seedTestSchedulesForDate
  };
})(typeof window !== "undefined" ? window : globalThis);
