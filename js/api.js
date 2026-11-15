/**
 * Muse Elastic Planner - 일정 API & 로컬 스토리지 어댑터
 *
 * - supabase : Supabase Auth + PostgREST (`schedules`, `routine_templates`) 실시간 연동
 * - local    : 오프라인/테스트용 브라우저 localStorage 저장
 */

(function (global) {
  const SETTINGS_KEY = "muse_planner_api_settings_v2";
  const DAY_STORAGE_PREFIX = "muse_planner_schedules_day_v2_";
  const BACKLOG_STORAGE_KEY = "muse_planner_backlog_v1";
  const SCHEDULE_CACHE_PREFIX = "muse_planner_cache_day_v3_";
  const BACKLOG_CACHE_KEY = "muse_planner_cache_backlog_v2";
  const LEGACY_CACHE_PREFIX = "muse_planner_agent_cache_v2_";
  const LEGACY_BACKLOG_CACHE_KEY = "muse_planner_agent_backlog_cache_v1";
  const WIDGETS_STORAGE_PREFIX = "muse_planner_widgets_v2_";
  const PREFS_KEY = "muse_planner_ui_prefs_v2";
  const ROUTINE_TEMPLATES_KEY = "muse_planner_routine_templates_v2";
  const ROUTINE_APPLIED_PREFIX = "muse_planner_routine_applied_v2_";
  const DDAYS_STORAGE_KEY = "muse_planner_ddays_v1";
  const DDAYS_CACHE_KEY = "muse_planner_cache_ddays_v1";

  const KST_TIMEZONE = "Asia/Seoul";
  const SUPABASE_DEFAULT_URL = "https://vetwwxmujaiwwwpjurpr.supabase.co";
  const SUPABASE_DEFAULT_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldHd3eG11amFpd3d3cGp1cnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTQxNDEsImV4cCI6MjEwODY3MDE0MX0.XYxgyeN-vWZ5MDtJGG4hJaIdNH29L1eFQNnCivoXr6M";
  const SCHEDULE_COLUMNS =
    "id, date, start_at, end_at, title, type, done, done_at, source, memo, template_id, created_at, updated_at";
  const DDAY_COLUMNS = "id, title, target_date, icon, memo, created_at, updated_at";

  const DEFAULT_SETTINGS = {
    mode: "supabase", // 'supabase' | 'local'
    localExplicit: false
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
    trackScheduleDone: true,
    browserNotify: false,
    showPlacedList: true,
    placedTasksOnly: false,
    untimedCollapsed: false,
    placedCollapsed: false,
    showBacklogList: true,
    backlogCollapsed: false,
    reminderCollapsed: false,
    widgetOrder: ["summary", "pomodoro", "mit", "dday", "habits", "youtube", "memo"],
    widgets: {
      summary: true,
      pomodoro: true,
      mit: true,
      dday: true,
      habits: true,
      youtube: true,
      memo: true
    },
    ddays: [],
    habits: [
      { id: "hb-water", icon: "🥛", title: "물 마시기", target: 8 },
      { id: "hb-vitamin", icon: "💊", title: "영양제 챙기기", target: 1 },
      { id: "hb-stretch", icon: "🧘", title: "스트레칭", target: 1 }
    ],
    presets: [
      { id: "pre_schedule", icon: "📅", title: "집중 일정", durationMin: 60, type: "schedule" },
      { id: "pre_task", icon: "✅", title: "할 일", durationMin: 30, type: "task" },
      { id: "pre_reminder", icon: "🔔", title: "체크 알림", durationMin: 0, type: "reminder" },
      { id: "pre_routine", icon: "🏃", title: "운동/루틴", durationMin: 60, type: "schedule" },
      { id: "pre_break", icon: "☕", title: "휴식/정리", durationMin: 15, type: "schedule" }
    ]
  };

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

  const KST_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  function getKstDateTimeParts(dateObj = new Date()) {
    const map = {};
    for (const part of KST_DATETIME_FORMATTER.formatToParts(dateObj)) {
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
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.mode === "local" && parsed.localExplicit === true) {
          return { mode: "local", localExplicit: true };
        }
      }
    } catch {
      // ignore storage errors
    }
    return {
      ...DEFAULT_SETTINGS,
      mode: "supabase"
    };
  }

  function saveSettings(next) {
    const mode = next?.mode === "local" ? "local" : "supabase";
    const merged = {
      mode,
      localExplicit: mode === "local" ? Boolean(next?.localExplicit) : false
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  let cloudPrefsSyncTimer = null;
  let lastCloudPushedPrefsSig = "";

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
      trackScheduleDone: typeof parsed.trackScheduleDone === "boolean" ? parsed.trackScheduleDone : DEFAULT_PREFS.trackScheduleDone,
      browserNotify: typeof parsed.browserNotify === "boolean" ? parsed.browserNotify : DEFAULT_PREFS.browserNotify,
      showPlacedList: typeof parsed.showPlacedList === "boolean" ? parsed.showPlacedList : DEFAULT_PREFS.showPlacedList,
      placedTasksOnly: typeof parsed.placedTasksOnly === "boolean" ? parsed.placedTasksOnly : DEFAULT_PREFS.placedTasksOnly,
      untimedCollapsed: typeof parsed.untimedCollapsed === "boolean" ? parsed.untimedCollapsed : DEFAULT_PREFS.untimedCollapsed,
      placedCollapsed: typeof parsed.placedCollapsed === "boolean" ? parsed.placedCollapsed : DEFAULT_PREFS.placedCollapsed,
      showBacklogList: typeof parsed.showBacklogList === "boolean" ? parsed.showBacklogList : DEFAULT_PREFS.showBacklogList,
      backlogCollapsed: typeof parsed.backlogCollapsed === "boolean" ? parsed.backlogCollapsed : DEFAULT_PREFS.backlogCollapsed,
      reminderCollapsed: typeof parsed.reminderCollapsed === "boolean" ? parsed.reminderCollapsed : DEFAULT_PREFS.reminderCollapsed,
      widgetOrder: [...new Set([
        ...(Array.isArray(parsed.widgetOrder) ? parsed.widgetOrder.filter((key) => DEFAULT_PREFS.widgetOrder.includes(key)) : []),
        ...DEFAULT_PREFS.widgetOrder
      ])],
      widgets: { ...DEFAULT_PREFS.widgets, ...(parsed.widgets || {}) },
      ddays: Array.isArray(parsed.ddays)
        ? parsed.ddays
            .filter((d) => d && d.title && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || "")))
            .map((d) => ({
              id: String(d.id || uid("dday")),
              icon: String(d.icon || "📌").slice(0, 4),
              title: String(d.title).trim(),
              date: String(d.date)
            }))
        : [],
      habits: Array.isArray(parsed.habits)
        ? parsed.habits
            .filter((h) => h && h.title)
            .map((h) => ({
              id: String(h.id || uid("hb")),
              icon: String(h.icon || "💧").slice(0, 4),
              title: String(h.title).trim(),
              target: clampInt(h.target, 1, 99, 1)
            }))
        : structuredCloneSafe(DEFAULT_PREFS.habits),
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
    if (cloudPrefsSyncTimer) {
      clearTimeout(cloudPrefsSyncTimer);
      cloudPrefsSyncTimer = null;
    }
    try {
      const normalized = normalizePrefs(prefs);
      const sig = JSON.stringify({ ...normalized, _updatedAt: 0 });
      if (sig === lastCloudPushedPrefsSig) return;
      const sb = await getSupabaseClient().catch(() => null);
      if (!sb) return;
      const { data: sessData } = await sb.auth.getSession();
      if (!sessData?.session) return;
      const { error } = await sb.auth.updateUser({
        data: {
          planner_prefs: normalized
        }
      });
      if (!error) {
        lastCloudPushedPrefsSig = sig;
      }
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

      if (cloudRaw && typeof cloudRaw === "object") {
        lastCloudPushedPrefsSig = JSON.stringify({ ...normalizePrefs(cloudRaw), _updatedAt: 0 });
      }
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
    const isBacklog = raw?.date === null || (raw?.date === undefined && fallbackDate === null);
    const dateStr = isBacklog ? null : raw?.date || fallbackDate || todayKst();
    const type = ["schedule", "task", "reminder"].includes(raw.type) ? raw.type : "schedule";
    const source = raw.source === "muse" ? "muse" : "app";

    let startMin = null;
    let endMin = null;
    let hasStartAt = false;
    let hasEndAt = false;

    if (!isBacklog && raw.start_at) {
      const sp = getKstDateTimeParts(new Date(raw.start_at));
      if (Number.isFinite(sp.totalMin)) {
        startMin = dateStr && sp.date < dateStr ? 0 : sp.totalMin;
        hasStartAt = true;
      }
    } else if (!isBacklog && typeof raw.startMin === "number") {
      startMin = clampInt(raw.startMin, 0, 1425, 540);
      hasStartAt = true;
    }

    if (!isBacklog && raw.end_at && hasStartAt) {
      const ep = getKstDateTimeParts(new Date(raw.end_at));
      if (Number.isFinite(ep.totalMin)) {
        let candidateEnd = dateStr && ep.date > dateStr && ep.totalMin === 0 ? 1440 : ep.totalMin;
        if (dateStr && ep.date > dateStr && ep.totalMin > 0) candidateEnd = 1440;
        endMin = Math.max(startMin + 15, candidateEnd);
        hasEndAt = true;
      }
    } else if (!isBacklog && typeof raw.endMin === "number" && hasStartAt) {
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
      start_at: isBacklog ? null : raw.start_at || (hasStartAt ? kstMinutesToIso(dateStr, startMin) : null),
      end_at: isBacklog ? null : raw.end_at || (hasEndAt ? kstMinutesToIso(dateStr, endMin) : null),
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
    return [];
  }

  function saveLocalSchedules(dateStr, items) {
    localStorage.setItem(DAY_STORAGE_PREFIX + dateStr, JSON.stringify(sortSchedules(items)));
  }

  function loadLocalBacklog() {
    try {
      const raw = localStorage.getItem(BACKLOG_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? sortSchedules(parsed.map((item) => normalizeScheduleRecord({ ...item, date: null }, null)))
        : [];
    } catch {
      return [];
    }
  }

  function saveLocalBacklog(items) {
    localStorage.setItem(BACKLOG_STORAGE_KEY, JSON.stringify(sortSchedules(items)));
  }

  /* -------------------- 우측 보조 위젯 (로컬 저장) -------------------- */

  function normalizeMitList(rawList) {
    const arr = Array.isArray(rawList) ? rawList : [];
    return [0, 1, 2].map((idx) => {
      const item = arr[idx];
      return {
        slot: idx + 1,
        text: item && typeof item.text === "string" ? item.text : "",
        done: Boolean(item && item.done),
        scheduleId: item && item.scheduleId ? String(item.scheduleId) : null
      };
    });
  }

  function normalizeHabitCounts(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        out[String(k)] = Math.min(999, Math.round(n));
      }
    }
    return out;
  }

  function normalizePomodoroStats(raw) {
    const sessions = Number(raw?.sessions);
    const totalMinutes = Number(raw?.totalMinutes);
    return {
      sessions: Number.isFinite(sessions) && sessions > 0 ? Math.round(sessions) : 0,
      totalMinutes: Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.round(totalMinutes) : 0
    };
  }

  function loadWidgetsState(dateStr) {
    const key = WIDGETS_STORAGE_PREFIX + dateStr;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          youtubeList: Array.isArray(parsed.youtubeList) ? parsed.youtubeList : [],
          memo: typeof parsed.memo === "string" ? parsed.memo : "",
          mitList: normalizeMitList(parsed.mitList),
          habitCounts: normalizeHabitCounts(parsed.habitCounts),
          pomodoroStats: normalizePomodoroStats(parsed.pomodoroStats)
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
      memo: "",
      mitList: normalizeMitList([]),
      habitCounts: {},
      pomodoroStats: { sessions: 0, totalMinutes: 0 }
    };
  }

  function saveWidgetsState(dateStr, state) {
    localStorage.setItem(
      WIDGETS_STORAGE_PREFIX + dateStr,
      JSON.stringify({
        youtubeList: state?.youtubeList || [],
        memo: state?.memo || "",
        mitList: normalizeMitList(state?.mitList),
        habitCounts: normalizeHabitCounts(state?.habitCounts),
        pomodoroStats: normalizePomodoroStats(state?.pomodoroStats)
      })
    );
  }

  /* -------------------- 통합 SWR 로컬 캐시 관리 -------------------- */

  function cleanupLegacyCaches() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === LEGACY_BACKLOG_CACHE_KEY || k.startsWith(LEGACY_CACHE_PREFIX)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore storage errors
    }
  }

  cleanupLegacyCaches();

  function getCachedSchedules(dateStr) {
    if (!dateStr) return null;
    try {
      const raw = localStorage.getItem(SCHEDULE_CACHE_PREFIX + dateStr);
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
      localStorage.setItem(SCHEDULE_CACHE_PREFIX + dateStr, JSON.stringify(sortSchedules(items)));
    } catch {
      // ignore quota errors
    }
  }

  function clearCachedSchedules(dateStr) {
    if (!dateStr) return;
    invalidateScheduleCache(dateStr);
  }

  function getCachedBacklog() {
    try {
      const raw = localStorage.getItem(BACKLOG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return sortSchedules(parsed.map((item) => normalizeScheduleRecord({ ...item, date: null }, null)));
    } catch {
      return null;
    }
  }

  function setCachedBacklog(items) {
    if (!Array.isArray(items)) return;
    try {
      localStorage.setItem(BACKLOG_CACHE_KEY, JSON.stringify(sortSchedules(items)));
    } catch {
      // ignore quota errors
    }
  }

  function invalidateScheduleCache(target = "all") {
    try {
      if (target === "all") {
        localStorage.removeItem(BACKLOG_CACHE_KEY);
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k && k.startsWith(SCHEDULE_CACHE_PREFIX)) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
        return;
      }
      if (target === null || target === "backlog") {
        localStorage.removeItem(BACKLOG_CACHE_KEY);
        return;
      }
      if (typeof target === "string" && target) {
        localStorage.removeItem(SCHEDULE_CACHE_PREFIX + target);
      }
    } catch {
      // ignore storage errors
    }
  }

  function syncCacheForRecord(normalized, prevDate = undefined) {
    if (!normalized) return;
    if (prevDate === undefined) {
      // 이전 날짜를 모르면 다른 날짜 캐시에 동일 id가 남아 있지 않도록 정리
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(SCHEDULE_CACHE_PREFIX)) continue;
          const d = k.slice(SCHEDULE_CACHE_PREFIX.length);
          if (d !== normalized.date) {
            const list = getCachedSchedules(d);
            if (list && list.some((item) => item.id === normalized.id)) {
              setCachedSchedules(d, list.filter((item) => item.id !== normalized.id));
            }
          }
        }
      } catch {
        // ignore
      }
    } else if (typeof prevDate === "string" && prevDate && prevDate !== normalized.date) {
      const oldCached = getCachedSchedules(prevDate);
      if (oldCached) {
        setCachedSchedules(prevDate, oldCached.filter((item) => item.id !== normalized.id));
      }
    }

    if (normalized.date === null) {
      const cachedBacklog = getCachedBacklog();
      if (cachedBacklog) {
        setCachedBacklog([...cachedBacklog.filter((item) => item.id !== normalized.id), normalized]);
      }
    } else {
      const cachedDay = getCachedSchedules(normalized.date);
      if (cachedDay) {
        setCachedSchedules(normalized.date, [...cachedDay.filter((item) => item.id !== normalized.id), normalized]);
      }
      if (prevDate === null || prevDate === undefined) {
        const cachedBacklog = getCachedBacklog();
        if (cachedBacklog && cachedBacklog.some((item) => item.id === normalized.id)) {
          setCachedBacklog(cachedBacklog.filter((item) => item.id !== normalized.id));
        }
      }
    }
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
      const rows = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb
          .from("schedules")
          .select(SCHEDULE_COLUMNS)
          .gte("date", fromStr)
          .lte("date", toStr)
          .order("date", { ascending: true })
          .order("start_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return sortSchedules(rows.map((r) => normalizeScheduleRecord(r, r.date)));
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

  async function fetchBacklog() {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("schedules")
        .select(SCHEDULE_COLUMNS)
        .is("date", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const normalized = sortSchedules(
        (Array.isArray(data) ? data : []).map((r) => normalizeScheduleRecord(r, null))
      );
      setCachedBacklog(normalized);
      return normalized;
    }
    return loadLocalBacklog();
  }

  function removeFromCacheAfterDelete(id, dateHint = undefined) {
    if (!id) return;
    if (dateHint === null) {
      const cached = getCachedBacklog();
      if (cached) setCachedBacklog(cached.filter((item) => item.id !== id));
      return;
    }
    if (typeof dateHint === "string" && dateHint) {
      const cached = getCachedSchedules(dateHint);
      if (cached) setCachedSchedules(dateHint, cached.filter((item) => item.id !== id));
      return;
    }
    const cachedBacklog = getCachedBacklog();
    if (cachedBacklog) {
      setCachedBacklog(cachedBacklog.filter((item) => item.id !== id));
    }
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(SCHEDULE_CACHE_PREFIX)) continue;
        const d = k.slice(SCHEDULE_CACHE_PREFIX.length);
        const list = getCachedSchedules(d);
        if (list && list.some((item) => item.id === id)) {
          setCachedSchedules(d, list.filter((item) => item.id !== id));
        }
      }
    } catch {
      // ignore
    }
  }

  async function createSchedule(payload) {
    const isBacklog = payload?.date === null;
    const targetDate = isBacklog ? null : payload?.date || todayKst();
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const insertRow = {
        date: targetDate,
        start_at: isBacklog ? null : payload.start_at ?? null,
        end_at: isBacklog ? null : payload.end_at ?? null,
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
      const normalized = normalizeScheduleRecord(data, targetDate);
      syncCacheForRecord(normalized, targetDate);
      return normalized;
    }

    const created = normalizeScheduleRecord(
      {
        id: uid("loc"),
        ...payload,
        date: targetDate,
        start_at: isBacklog ? null : payload.start_at ?? null,
        end_at: isBacklog ? null : payload.end_at ?? null,
        done: Boolean(payload.done),
        done_at: payload.done ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      targetDate
    );
    if (isBacklog) {
      const list = loadLocalBacklog();
      list.push(created);
      saveLocalBacklog(list);
    } else {
      const list = loadLocalSchedules(targetDate);
      list.push(created);
      saveLocalSchedules(targetDate, list);
    }
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
      const normalized = normalizeScheduleRecord(data, "date" in updates ? updates.date : dateHint);
      syncCacheForRecord(normalized, dateHint);
      return normalized;
    }

    const sourceIsBacklog = dateHint === null;
    const sourceDateStr = sourceIsBacklog ? null : dateHint || todayKst();
    const sourceList = sourceIsBacklog ? loadLocalBacklog() : loadLocalSchedules(sourceDateStr);
    const idx = sourceList.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new Error("일정을 찾을 수 없습니다.");
    }
    const prev = sourceList[idx];
    const nextDate = "date" in patch ? patch.date : prev.date;
    const nextIsBacklog = nextDate === null;
    const nextRaw = {
      id: prev.id,
      date: nextDate,
      title: patch.title ?? prev.title,
      type: patch.type ?? prev.type,
      source: patch.source ?? prev.source,
      memo: "memo" in patch ? patch.memo : prev.memo,
      start_at: nextIsBacklog ? null : "start_at" in patch ? patch.start_at : prev.start_at,
      end_at: nextIsBacklog ? null : "end_at" in patch ? patch.end_at : prev.end_at,
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
    if (nextDate === sourceDateStr) {
      sourceList[idx] = normalized;
      if (sourceIsBacklog) saveLocalBacklog(sourceList);
      else saveLocalSchedules(sourceDateStr, sourceList);
    } else {
      const remaining = sourceList.filter((item) => item.id !== id);
      if (sourceIsBacklog) saveLocalBacklog(remaining);
      else saveLocalSchedules(sourceDateStr, remaining);

      const destList = nextIsBacklog ? loadLocalBacklog() : loadLocalSchedules(nextDate);
      destList.push(normalized);
      if (nextIsBacklog) saveLocalBacklog(destList);
      else saveLocalSchedules(nextDate, destList);
    }
    return normalized;
  }

  async function deleteSchedule(id, dateHint) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { error } = await sb.from("schedules").delete().eq("id", id);
      if (error) throw new Error(error.message);
      removeFromCacheAfterDelete(id, dateHint);
      return;
    }

    if (dateHint === null) {
      const list = loadLocalBacklog().filter((item) => item.id !== id);
      saveLocalBacklog(list);
      return;
    }
    const dateStr = dateHint || todayKst();
    const list = loadLocalSchedules(dateStr).filter((item) => item.id !== id);
    saveLocalSchedules(dateStr, list);
  }

  async function fetchCarryOverCandidates(fromDateStr, targetItems = []) {
    const prevItems = await fetchSchedules(fromDateStr, { applyRoutines: false });
    const existingKeys = new Set(
      (targetItems || []).map((item) => `${item.type}:${String(item.title || "").trim()}`)
    );
    return prevItems.filter((item) => {
      if (item.done || item.hasStartAt || item.template_id) return false;
      const key = `${item.type}:${String(item.title || "").trim()}`;
      return !existingKeys.has(key);
    });
  }

  async function carryOverUntimedFromDate(fromDateStr, toDateStr, targetItems = []) {
    const candidates = await fetchCarryOverCandidates(fromDateStr, targetItems);
    const moved = [];
    for (const item of candidates) {
      const updated = await patchSchedule(
        item.id,
        { date: toDateStr, start_at: null, end_at: null },
        fromDateStr
      );
      moved.push(updated);
    }
    return { count: moved.length, items: moved };
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

  function applyLocalRoutinesForDate(dateStr, options = {}) {
    const { includePast = false } = options;
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
    const todayStr = todayKst();
    const nowMin = nowKstMinutes();
    const dayList = loadLocalSchedules(dateStr);
    let updatedCount = 0;

    for (const tpl of templates) {
      if (!tpl.weekdays.includes(dow)) continue;

      const startMin = tpl.start_time ? hhmmToMinutes(tpl.start_time) : null;
      const matchingExisting = dayList.find((item) => {
        if (String(item.title || "").trim() !== String(tpl.title || "").trim()) return false;
        if (startMin === null) return !item.hasStartAt;
        return item.hasStartAt && item.startMin === startMin;
      });

      if (matchingExisting) {
        if (matchingExisting.template_id !== tpl.id) {
          matchingExisting.template_id = tpl.id;
          updatedCount += 1;
        }
        appliedSet.add(tpl.id);
        continue;
      }

      if (appliedSet.has(tpl.id)) continue;

      if (!includePast && dateStr === todayStr && startMin !== null && startMin < nowMin) {
        continue;
      }

      appliedSet.add(tpl.id);
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
      updatedCount += 1;
    }

    localStorage.setItem(ROUTINE_APPLIED_PREFIX + dateStr, JSON.stringify([...appliedSet]));
    if (updatedCount > 0) {
      saveLocalSchedules(dateStr, dayList);
    }
    return updatedCount;
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

  async function applyRoutinesForDate(dateStr, options = {}) {
    const { includePast = false } = options;
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb.rpc("apply_routines_for_date", {
        target_date: dateStr,
        include_past: Boolean(includePast)
      });
      if (error) throw new Error(error.message);
      return Number(data) || 0;
    }
    return applyLocalRoutinesForDate(dateStr, options);
  }

  /* -------------------- D-Day (planner_ddays + 로컬 폴백) -------------------- */

  function normalizeDdayRecord(row) {
    const targetDate = String(row?.target_date || row?.date || "").trim();
    return {
      id: String(row?.id || uid("dday")),
      title: String(row?.title || "").trim(),
      target_date: targetDate,
      date: targetDate,
      icon: String(row?.icon || "📌").trim().slice(0, 8) || "📌",
      memo: row?.memo ? String(row.memo) : "",
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null
    };
  }

  function loadLocalDdays() {
    try {
      const raw = localStorage.getItem(DDAYS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeDdayRecord).filter((d) => d.title && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  function saveLocalDdays(list) {
    localStorage.setItem(DDAYS_STORAGE_KEY, JSON.stringify((list || []).map(normalizeDdayRecord)));
  }

  function getCachedDdays() {
    try {
      const raw = localStorage.getItem(DDAYS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeDdayRecord) : null;
    } catch {
      return null;
    }
  }

  function setCachedDdays(list) {
    try {
      localStorage.setItem(DDAYS_CACHE_KEY, JSON.stringify((list || []).map(normalizeDdayRecord)));
    } catch {
      // ignore storage quota
    }
  }

  async function fetchDdays() {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("planner_ddays")
        .select(DDAY_COLUMNS)
        .order("target_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      let list = (Array.isArray(data) ? data : []).map(normalizeDdayRecord);

      // 기존 prefs.ddays에 남아 있던 항목이 있고 DB가 비어 있으면 1회 자동 이관
      if (list.length === 0) {
        const curPrefs = getPrefs();
        if (Array.isArray(curPrefs.ddays) && curPrefs.ddays.length > 0) {
          const rows = curPrefs.ddays
            .filter((d) => d && d.title && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || "")))
            .map((d) => ({
              title: String(d.title).trim(),
              target_date: String(d.date),
              icon: String(d.icon || "📌").trim().slice(0, 8) || "📌"
            }));
          if (rows.length > 0) {
            const { data: inserted } = await sb
              .from("planner_ddays")
              .insert(rows)
              .select(DDAY_COLUMNS);
            if (Array.isArray(inserted) && inserted.length > 0) {
              list = inserted.map(normalizeDdayRecord);
            }
          }
          curPrefs.ddays = [];
          savePrefs(curPrefs);
        }
      }

      setCachedDdays(list);
      return list;
    }
    return loadLocalDdays();
  }

  async function createDday(payload) {
    const clean = {
      title: String(payload?.title || "").trim(),
      target_date: String(payload?.target_date || payload?.date || "").trim(),
      icon: String(payload?.icon || "📌").trim().slice(0, 8) || "📌",
      memo: payload?.memo ? String(payload.memo).trim() : null
    };
    if (!clean.title) throw new Error("D-Day 제목을 입력해 주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.target_date)) throw new Error("유효한 날짜(YYYY-MM-DD)가 아닙니다.");

    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("planner_ddays")
        .insert(clean)
        .select(DDAY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const created = normalizeDdayRecord(data);
      const cached = getCachedDdays() || [];
      setCachedDdays([...cached.filter((d) => d.id !== created.id), created]);
      return created;
    }

    const list = loadLocalDdays();
    const created = normalizeDdayRecord({
      id: uid("dday"),
      ...clean,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    list.push(created);
    saveLocalDdays(list);
    return created;
  }

  async function patchDday(id, patch) {
    const updateBody = {};
    if ("title" in (patch || {})) updateBody.title = String(patch.title || "").trim();
    if ("target_date" in (patch || {}) || "date" in (patch || {})) {
      updateBody.target_date = String(patch.target_date || patch.date || "").trim();
    }
    if ("icon" in (patch || {})) updateBody.icon = String(patch.icon || "📌").trim().slice(0, 8) || "📌";
    if ("memo" in (patch || {})) updateBody.memo = patch.memo ? String(patch.memo).trim() : null;

    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("planner_ddays")
        .update(updateBody)
        .eq("id", id)
        .select(DDAY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const updated = normalizeDdayRecord(data);
      const cached = getCachedDdays() || [];
      setCachedDdays(cached.map((d) => (d.id === id ? updated : d)));
      return updated;
    }

    const list = loadLocalDdays();
    const idx = list.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("D-Day를 찾을 수 없습니다.");
    const updated = normalizeDdayRecord({
      ...list[idx],
      ...updateBody,
      updated_at: new Date().toISOString()
    });
    list[idx] = updated;
    saveLocalDdays(list);
    return updated;
  }

  async function deleteDday(id) {
    const settings = getSettings();
    if (settings.mode === "supabase") {
      await requireSupabaseSession();
      const sb = await getSupabaseClient();
      const { error } = await sb.from("planner_ddays").delete().eq("id", id);
      if (error) throw new Error(error.message);
      const cached = getCachedDdays();
      if (cached) setCachedDdays(cached.filter((d) => d.id !== id));
      return;
    }
    saveLocalDdays(loadLocalDdays().filter((d) => d.id !== id));
  }

  global.PlannerAPI = {
    KST_TIMEZONE,
    SCHEDULE_COLUMNS,
    uid,
    todayKst,
    nowKstMinutes,
    shiftDateStr,
    kstMinutesToIso,
    hhmmToMinutes,
    minutesToHhmm,
    getSettings,
    saveSettings,
    getSupabaseClient,
    getSupabaseSession,
    signInSupabase,
    signOutSupabase,
    getPrefs,
    savePrefs,
    syncPrefsFromCloud,
    getDefaultPresets,
    resetPrefsToDefault,
    loadWidgetsState,
    saveWidgetsState,
    normalizeScheduleRecord,
    sortSchedules,
    getCachedSchedules,
    setCachedSchedules,
    clearCachedSchedules,
    getCachedBacklog,
    setCachedBacklog,
    invalidateScheduleCache,
    syncCacheForRecord,
    removeFromCacheAfterDelete,
    fetchSchedules,
    fetchSchedulesRange,
    fetchBacklog,
    createSchedule,
    patchSchedule,
    deleteSchedule,
    fetchCarryOverCandidates,
    carryOverUntimedFromDate,
    fetchRoutineTemplates,
    createRoutineTemplate,
    patchRoutineTemplate,
    deleteRoutineTemplate,
    applyRoutinesForDate,
    getCachedDdays,
    fetchDdays,
    createDday,
    patchDday,
    deleteDday
  };
})(typeof window !== "undefined" ? window : globalThis);
