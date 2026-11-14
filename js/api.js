/**
 * Muse Elastic Planner - 통합 데이터 어댑터
 * 지원 소스:
 * 1) local    : 브라우저 localStorage (기본/오프라인)
 * 2) gcal     : Google Calendar API + Google Tasks API 직접 호출 + 로컬 커스텀 오버레이
 * 3) gas      : Google Apps Script Web App (구글 캘린더 + 시트 통합 백엔드, Muse POST 지원)
 * 4) supabase : Supabase REST API (schedules, staged_tasks, youtube_items, daily_memos)
 */

(function (global) {
  const SETTINGS_KEY = "muse_planner_api_settings_v1";
  const DAY_STORAGE_PREFIX = "muse_planner_day_v1_";
  const OVERLAY_STORAGE_PREFIX = "muse_planner_overlay_v1_";
  const PREFS_KEY = "muse_planner_ui_prefs_v1";

  const DEFAULT_SETTINGS = {
    mode: "local", // 'local' | 'gcal' | 'gas' | 'supabase'
    gcalCalendarId: "primary",
    gcalAccessToken: "",
    gcalIncludeTasks: "true",
    gcalWriteBack: "false",
    gasUrl: "",
    gasToken: "",
    sbUrl: "",
    sbAnonKey: ""
  };

  const DEFAULT_PREFS = {
    theme: "dark",
    snapMin: 15,
    pxPerMin: 1.4,
    cascadeMode: true,
    earlyCollapsed: true,
    widgets: {
      summary: true,
      youtube: true,
      memo: true
    },
    presets: [
      { id: "pre_focus", icon: "🔥", title: "딥워크", durationMin: 90, category: "focus" },
      { id: "pre_meeting", icon: "💬", title: "미팅", durationMin: 30, category: "meeting" },
      { id: "pre_yt", icon: "📺", title: "유튜브 학습", durationMin: 30, category: "youtube" },
      { id: "pre_break", icon: "☕", title: "휴식/정리", durationMin: 15, category: "break" },
      { id: "pre_personal", icon: "🏃", title: "운동/루틴", durationMin: 60, category: "personal" }
    ]
  };

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function formatDateStr(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(next) {
    const merged = { ...DEFAULT_SETTINGS, ...next };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  }

  function getPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return structuredCloneSafe(DEFAULT_PREFS);
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PREFS,
        ...parsed,
        widgets: { ...DEFAULT_PREFS.widgets, ...(parsed.widgets || {}) },
        presets: Array.isArray(parsed.presets) && parsed.presets.length ? parsed.presets : DEFAULT_PREFS.presets
      };
    } catch {
      return structuredCloneSafe(DEFAULT_PREFS);
    }
  }

  function savePrefs(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 최초 실행 시 오늘 날짜 기준으로 현재 시각에 맞춰 샘플 데이터 생성
   */
  function createDemoDayData(dateStr) {
    const now = new Date();
    const nowTotalMin = now.getHours() * 60 + now.getMinutes();
    // 현재 시각을 15분 단위로 내려서 지금 진행 중인 일정 블록 하나 생성
    const anchorStart = Math.max(540, Math.min(1260, Math.floor(nowTotalMin / 15) * 15 - 15));
    const anchorEnd = anchorStart + 60;

    return {
      date: dateStr,
      events: [
        {
          id: uid("evt"),
          title: "모닝 브리핑 & 하루 일정 점검",
          startMin: 540, // 09:00
          endMin: 570,   // 09:30
          category: "personal",
          done: anchorStart > 570,
          pinned: true,
          note: "구글 캘린더 확정 일정 우선 확인",
          source: "local",
          url: ""
        },
        {
          id: uid("evt"),
          title: "핵심 기획 & Muse 앱 인터랙션 작업",
          startMin: anchorStart,
          endMin: anchorEnd,
          category: "focus",
          done: false,
          pinned: false,
          note: "드래그 이동, 가장자리 리사이즈, 연쇄 밀기 테스트",
          source: "muse",
          url: ""
        },
        {
          id: uid("evt"),
          title: "점심 식사 & 산책",
          startMin: Math.max(720, anchorEnd + 15),
          endMin: Math.max(780, anchorEnd + 75),
          category: "break",
          done: false,
          pinned: true,
          note: "고정 시간 블록 (연쇄 밀기 시 건너뜀)",
          source: "local",
          url: ""
        },
        {
          id: uid("evt"),
          title: "주간 프로젝트 싱크 미팅",
          startMin: Math.max(840, anchorEnd + 90),
          endMin: Math.max(885, anchorEnd + 135),
          category: "meeting",
          done: false,
          pinned: true,
          note: "주요 아젠다 정리",
          source: "gcal",
          url: ""
        },
        {
          id: uid("evt"),
          title: "저녁 운동 & 스트레칭",
          startMin: 1140, // 19:00
          endMin: 1200,   // 20:00
          category: "personal",
          done: false,
          pinned: false,
          note: "",
          source: "local",
          url: ""
        }
      ],
      staged: [
        {
          id: uid("stg"),
          title: "영수증 정리 & 가계부 API 체크",
          durationMin: 30,
          category: "personal",
          done: false,
          status: "todo",
          note: ""
        },
        {
          id: uid("stg"),
          title: "UI 레퍼런스 스크랩 및 메모",
          durationMin: 45,
          category: "focus",
          done: false,
          status: "todo",
          note: ""
        },
        {
          id: uid("stg"),
          title: "거래처 이메일 답장 (시간 비면 배치)",
          durationMin: 30,
          category: "meeting",
          done: false,
          status: "deferred",
          note: "타임라인에서 잠시 보류한 일정"
        }
      ],
      youtubeList: [
        {
          id: uid("yt"),
          title: "AI 에이전트 자동화 워크플로우 실전",
          url: "https://www.youtube.com",
          durationMin: 30,
          done: false,
          addedBy: "Muse"
        },
        {
          id: uid("yt"),
          title: "1인 개발자 생산성 캘린더 설계 팁",
          url: "https://www.youtube.com",
          durationMin: 15,
          done: false,
          addedBy: "직접 추가"
        }
      ],
      memo: "💡 팁:\n- 일정 위/아래 가장자리를 끌어 시간을 늘리고 줄여보세요.\n- 좌측 보류함이나 우측 유튜브 카드를 타임라인으로 드래그해 보세요.\n- 상단 '연쇄 밀기'가 켜져 있으면 앞 일정 변경 시 뒤 일정이 자동으로 밀립니다."
    };
  }

  function loadLocalDay(dateStr) {
    const key = DAY_STORAGE_PREFIX + dateStr;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return normalizeDayData(dateStr, JSON.parse(raw));
      } catch {
        // fallback below
      }
    }
    if (dateStr === formatDateStr(new Date())) {
      const demo = createDemoDayData(dateStr);
      localStorage.setItem(key, JSON.stringify(demo));
      return demo;
    }
    return normalizeDayData(dateStr, { date: dateStr });
  }

  function saveLocalDay(dateStr, dayData) {
    localStorage.setItem(DAY_STORAGE_PREFIX + dateStr, JSON.stringify(dayData));
  }

  function resetDemoForToday(dateStr) {
    const demo = createDemoDayData(dateStr);
    saveLocalDay(dateStr, demo);
    return demo;
  }

  function normalizeDayData(dateStr, data = {}) {
    return {
      date: dateStr,
      events: Array.isArray(data.events) ? data.events.map(normalizeEvent) : [],
      staged: Array.isArray(data.staged) ? data.staged.map(normalizeStaged) : [],
      youtubeList: Array.isArray(data.youtubeList) ? data.youtubeList.map(normalizeYoutube) : [],
      memo: typeof data.memo === "string" ? data.memo : ""
    };
  }

  function normalizeEvent(ev) {
    const startMin = clampInt(ev.startMin, 0, 1425, 540);
    const endMin = clampInt(ev.endMin, startMin + 15, 1440, Math.min(1440, startMin + 60));
    return {
      id: ev.id || uid("evt"),
      title: ev.title || "(제목 없음)",
      startMin,
      endMin,
      category: ev.category || "focus",
      done: Boolean(ev.done),
      pinned: Boolean(ev.pinned),
      note: ev.note || "",
      source: ev.source || "local",
      gcalId: ev.gcalId || "",
      url: ev.url || ""
    };
  }

  function normalizeStaged(item) {
    return {
      id: item.id || uid("stg"),
      title: item.title || "(제목 없음)",
      durationMin: clampInt(item.durationMin, 15, 360, 30),
      category: item.category || "focus",
      done: Boolean(item.done),
      status: item.status === "deferred" ? "deferred" : "todo",
      note: item.note || ""
    };
  }

  function normalizeYoutube(item) {
    return {
      id: item.id || uid("yt"),
      title: item.title || "(제목 없음)",
      url: item.url || "",
      durationMin: clampInt(item.durationMin, 10, 240, 30),
      done: Boolean(item.done),
      addedBy: item.addedBy || "직접 추가"
    };
  }

  function clampInt(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /**
   * 날짜 문자열 기준 로컬 타임존 00:00 ~ 다음날 00:00 ISO 문자열 반환
   */
  function getDayIsoBounds(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    return {
      dayStartMs: start.getTime(),
      timeMin: start.toISOString(),
      timeMax: end.toISOString()
    };
  }

  function isoToMinutesOfDay(isoStr, dayStartMs) {
    const ms = new Date(isoStr).getTime();
    return Math.round((ms - dayStartMs) / 60000);
  }

  function minutesToLocalIso(dateStr, totalMin) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d, Math.floor(totalMin / 60), totalMin % 60, 0, 0);
    const tzOffset = -dt.getTimezoneOffset();
    const sign = tzOffset >= 0 ? "+" : "-";
    const pad = (n) => String(Math.abs(n)).padStart(2, "0");
    const hh = pad(Math.floor(Math.abs(tzOffset) / 60));
    const mm = pad(Math.abs(tzOffset) % 60);
    return `${dateStr}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00${sign}${hh}:${mm}`;
  }

  function guessCategoryFromText(text = "") {
    const t = text.toLowerCase();
    if (/미팅|회의|sync|call|meeting|면담/.test(t)) return "meeting";
    if (/유튜브|youtube|영상|강의/.test(t)) return "youtube";
    if (/점심|저녁|식사|휴식|이동|커피|산책/.test(t)) return "break";
    if (/운동|병원|개인|루틴|독서|청소/.test(t)) return "personal";
    return "focus";
  }

  function loadOverlay(dateStr) {
    try {
      const raw = localStorage.getItem(OVERLAY_STORAGE_PREFIX + dateStr);
      return raw ? JSON.parse(raw) : { eventStates: {}, customEvents: [], staged: [], youtubeList: [], memo: "" };
    } catch {
      return { eventStates: {}, customEvents: [], staged: [], youtubeList: [], memo: "" };
    }
  }

  function saveOverlay(dateStr, dayData) {
    const eventStates = {};
    const customEvents = [];
    for (const ev of dayData.events) {
      if (ev.source === "gcal" || ev.gcalId) {
        eventStates[ev.gcalId || ev.id] = {
          done: ev.done,
          pinned: ev.pinned,
          category: ev.category,
          startMin: ev.startMin,
          endMin: ev.endMin,
          note: ev.note
        };
      } else {
        customEvents.push(ev);
      }
    }
    localStorage.setItem(
      OVERLAY_STORAGE_PREFIX + dateStr,
      JSON.stringify({
        eventStates,
        customEvents,
        staged: dayData.staged,
        youtubeList: dayData.youtubeList,
        memo: dayData.memo
      })
    );
  }

  /**
   * Google Calendar API + Google Tasks API 직접 호출
   */
  async function fetchFromGcal(dateStr, settings) {
    if (!settings.gcalAccessToken) {
      throw new Error("Google OAuth Access Token이 비어 있습니다. 설정에서 토큰을 입력해 주세요.");
    }
    const calId = encodeURIComponent(settings.gcalCalendarId || "primary");
    const { dayStartMs, timeMin, timeMax } = getDayIsoBounds(dateStr);
    const headers = {
      Authorization: `Bearer ${settings.gcalAccessToken}`
    };

    const calUrl =
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events` +
      `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime`;

    const calRes = await fetch(calUrl, { headers });
    if (!calRes.ok) {
      const errText = await calRes.text();
      throw new Error(`Google Calendar API 오류 (${calRes.status}): ${errText.slice(0, 120)}`);
    }
    const calJson = await calRes.json();
    const overlay = loadOverlay(dateStr);

    const gcalEvents = [];
    const allDayAsStaged = [];

    for (const item of calJson.items || []) {
      if (item.start && item.start.dateTime && item.end && item.end.dateTime) {
        const rawStart = clampInt(isoToMinutesOfDay(item.start.dateTime, dayStartMs), 0, 1425, 540);
        const rawEnd = clampInt(isoToMinutesOfDay(item.end.dateTime, dayStartMs), rawStart + 15, 1440, rawStart + 60);
        const st = overlay.eventStates[item.id] || {};
        gcalEvents.push(
          normalizeEvent({
            id: "gcal_" + item.id,
            gcalId: item.id,
            title: item.summary || "(제목 없음)",
            startMin: typeof st.startMin === "number" ? st.startMin : rawStart,
            endMin: typeof st.endMin === "number" ? st.endMin : rawEnd,
            category: st.category || guessCategoryFromText(item.summary),
            done: Boolean(st.done),
            pinned: typeof st.pinned === "boolean" ? st.pinned : true,
            note: st.note ?? (item.description || ""),
            url: item.htmlLink || "",
            source: "gcal"
          })
        );
      } else if (item.start && item.start.date) {
        allDayAsStaged.push(
          normalizeStaged({
            id: "gcal_all_" + item.id,
            title: `[종일] ${item.summary || "(제목 없음)"}`,
            durationMin: 30,
            category: "personal",
            status: "todo"
          })
        );
      }
    }

    let googleTasks = [];
    if (settings.gcalIncludeTasks === "true") {
      try {
        const taskRes = await fetch(
          "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&maxResults=50",
          { headers }
        );
        if (taskRes.ok) {
          const taskJson = await taskRes.json();
          googleTasks = (taskJson.items || [])
            .filter((t) => t.title)
            .map((t) =>
              normalizeStaged({
                id: "gtask_" + t.id,
                title: t.title,
                durationMin: 30,
                category: guessCategoryFromText(t.title),
                done: t.status === "completed",
                status: "todo",
                note: t.notes || ""
              })
            );
        }
      } catch {
        // Google Tasks scope가 없는 토큰일 경우 조용히 생략
      }
    }

    // 로컬에 추가한 staged와 Google Tasks 병합 (중복 id 제거)
    const stagedMap = new Map();
    for (const item of [...allDayAsStaged, ...googleTasks, ...(overlay.staged || [])]) {
      stagedMap.set(item.id, item);
    }

    return normalizeDayData(dateStr, {
      date: dateStr,
      events: [...gcalEvents, ...(overlay.customEvents || [])],
      staged: Array.from(stagedMap.values()),
      youtubeList: overlay.youtubeList || [],
      memo: overlay.memo || ""
    });
  }

  async function patchGcalEvent(dateStr, ev, settings) {
    if (!ev.gcalId || !settings.gcalAccessToken || settings.gcalWriteBack !== "true") return;
    const calId = encodeURIComponent(settings.gcalCalendarId || "primary");
    const body = {
      summary: ev.title,
      description: ev.note || "",
      start: { dateTime: minutesToLocalIso(dateStr, ev.startMin) },
      end: { dateTime: minutesToLocalIso(dateStr, ev.endMin) }
    };
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(ev.gcalId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${settings.gcalAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Google Apps Script (GAS) 연동
   * CORS preflight 회피를 위해 POST는 text/plain;charset=utf-8 사용
   */
  async function fetchFromGas(dateStr, settings) {
    if (!settings.gasUrl) {
      throw new Error("GAS Web App URL이 비어 있습니다. 설정에서 URL을 입력해 주세요.");
    }
    const sep = settings.gasUrl.includes("?") ? "&" : "?";
    const tokenParam = settings.gasToken ? `&token=${encodeURIComponent(settings.gasToken)}` : "";
    const url = `${settings.gasUrl}${sep}date=${encodeURIComponent(dateStr)}${tokenParam}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`GAS GET 오류 (${res.status})`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return normalizeDayData(dateStr, json);
  }

  async function saveToGas(dateStr, dayData, settings) {
    if (!settings.gasUrl) return;
    const payload = {
      action: "syncDay",
      token: settings.gasToken || "",
      date: dateStr,
      events: dayData.events,
      staged: dayData.staged,
      youtubeList: dayData.youtubeList,
      memo: dayData.memo
    };
    const res = await fetch(settings.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`GAS POST 오류 (${res.status})`);
    }
  }

  /**
   * Supabase REST API 연동
   */
  async function fetchFromSupabase(dateStr, settings) {
    if (!settings.sbUrl || !settings.sbAnonKey) {
      throw new Error("Supabase URL과 Anon Key를 모두 입력해 주세요.");
    }
    const base = settings.sbUrl.replace(/\/$/, "");
    const headers = {
      apikey: settings.sbAnonKey,
      Authorization: `Bearer ${settings.sbAnonKey}`
    };

    const [evRes, stRes, ytRes, memoRes] = await Promise.all([
      fetch(`${base}/rest/v1/schedules?date=eq.${dateStr}&order=start_min.asc`, { headers }),
      fetch(`${base}/rest/v1/staged_tasks?date=eq.${dateStr}`, { headers }),
      fetch(`${base}/rest/v1/youtube_items?date=eq.${dateStr}`, { headers }),
      fetch(`${base}/rest/v1/daily_memos?date=eq.${dateStr}`, { headers })
    ]);

    if (!evRes.ok) throw new Error(`Supabase 조회 오류 (${evRes.status})`);

    const [evRows, stRows, ytRows, memoRows] = await Promise.all([
      evRes.json(),
      stRes.ok ? stRes.json() : [],
      ytRes.ok ? ytRes.json() : [],
      memoRes.ok ? memoRes.json() : []
    ]);

    return normalizeDayData(dateStr, {
      date: dateStr,
      events: evRows.map((r) => ({
        id: r.id,
        title: r.title,
        startMin: r.start_min,
        endMin: r.end_min,
        category: r.category,
        done: r.done,
        pinned: r.pinned,
        note: r.note,
        url: r.url,
        source: r.source || "supabase"
      })),
      staged: stRows.map((r) => ({
        id: r.id,
        title: r.title,
        durationMin: r.duration_min,
        category: r.category,
        done: r.done,
        status: r.status,
        note: r.note
      })),
      youtubeList: ytRows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        durationMin: r.duration_min,
        done: r.done,
        addedBy: r.added_by
      })),
      memo: memoRows[0]?.memo || ""
    });
  }

  async function saveToSupabase(dateStr, dayData, settings) {
    if (!settings.sbUrl || !settings.sbAnonKey) return;
    const base = settings.sbUrl.replace(/\/$/, "");
    const headers = {
      apikey: settings.sbAnonKey,
      Authorization: `Bearer ${settings.sbAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    };

    const syncTable = async (table, rows) => {
      if (rows.length > 0) {
        const upRes = await fetch(`${base}/rest/v1/${table}`, {
          method: "POST",
          headers,
          body: JSON.stringify(rows)
        });
        if (!upRes.ok) throw new Error(`Supabase ${table} 저장 오류 (${upRes.status})`);
        const idList = rows.map((r) => `"${String(r.id).replace(/"/g, "")}"`).join(",");
        await fetch(`${base}/rest/v1/${table}?date=eq.${dateStr}&id=not.in.(${encodeURIComponent(idList)})`, {
          method: "DELETE",
          headers
        });
      } else {
        await fetch(`${base}/rest/v1/${table}?date=eq.${dateStr}`, {
          method: "DELETE",
          headers
        });
      }
    };

    await Promise.all([
      syncTable(
        "schedules",
        dayData.events.map((e) => ({
          id: e.id,
          date: dateStr,
          title: e.title,
          start_min: e.startMin,
          end_min: e.endMin,
          category: e.category,
          done: e.done,
          pinned: e.pinned,
          note: e.note,
          url: e.url,
          source: e.source || "supabase"
        }))
      ),
      syncTable(
        "staged_tasks",
        dayData.staged.map((s) => ({
          id: s.id,
          date: dateStr,
          title: s.title,
          duration_min: s.durationMin,
          category: s.category,
          done: s.done,
          status: s.status,
          note: s.note
        }))
      ),
      syncTable(
        "youtube_items",
        dayData.youtubeList.map((y) => ({
          id: y.id,
          date: dateStr,
          title: y.title,
          url: y.url,
          duration_min: y.durationMin,
          done: y.done,
          added_by: y.addedBy
        }))
      ),
      fetch(`${base}/rest/v1/daily_memos`, {
        method: "POST",
        headers,
        body: JSON.stringify([{ date: dateStr, memo: dayData.memo }])
      })
    ]);
  }

  /**
   * 통합 API 인터페이스
   */
  const PlannerAPI = {
    uid,
    formatDateStr,
    getSettings,
    saveSettings,
    getPrefs,
    savePrefs,
    resetDemoForToday,

    async fetchDayData(dateStr) {
      const settings = getSettings();
      if (settings.mode === "gcal") {
        return await fetchFromGcal(dateStr, settings);
      }
      if (settings.mode === "gas") {
        return await fetchFromGas(dateStr, settings);
      }
      if (settings.mode === "supabase") {
        return await fetchFromSupabase(dateStr, settings);
      }
      return loadLocalDay(dateStr);
    },

    async saveDayData(dateStr, dayData, changedGcalEvent = null) {
      const settings = getSettings();
      // 로컬 백업은 항상 유지
      saveLocalDay(dateStr, dayData);

      if (settings.mode === "gcal") {
        saveOverlay(dateStr, dayData);
        if (changedGcalEvent) {
          await patchGcalEvent(dateStr, changedGcalEvent, settings);
        }
        return;
      }
      if (settings.mode === "gas") {
        await saveToGas(dateStr, dayData, settings);
        return;
      }
      if (settings.mode === "supabase") {
        await saveToSupabase(dateStr, dayData, settings);
      }
    }
  };

  global.PlannerAPI = PlannerAPI;
})(typeof window !== "undefined" ? window : globalThis);
