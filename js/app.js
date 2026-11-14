(function () {
  const COLLAPSED_EARLY_HEIGHT = 30;
  const TYPE_META = {
    schedule: { label: "일정", badge: "일정", color: "#3b82f6" },
    task: { label: "할 일", badge: "할 일", color: "#10b981" },
    reminder: { label: "알림", badge: "🔔 알림", color: "#f59e0b" }
  };

  let currentDate = PlannerAPI.todayKst();
  let prefs = PlannerAPI.getPrefs();
  let schedules = [];
  let widgetsState = { youtubeList: [], memo: "" };
  let selectedEventId = null;
  let touchDraftSlot = null;
  let activeTypeFilter = "all";
  const notifiedEventKeys = new Set();
  let activeHtmlDragPayload = null;
  let activePointerDrag = false;
  let toastTimer = null;
  let islandNotifyTimer = null;
  let islandCollapseTimer = null;
  const ISLAND_AUTO_COLLAPSE_MS = 5000;
  let lastNowRenderMin = -1;
  let isBackgroundSyncing = false;
  let lastSyncCheckAt = 0;
  let lastUserMutationAt = 0;
  let loadRequestToken = 0;
  let undoStack = [];
  let realtimeClient = null;
  let realtimeChannel = null;
  let realtimeConnected = false;
  let realtimeConfigKey = "";
  let realtimeConnecting = false;
  let realtimeDebounceTimer = null;
  let deferredBroadcastSyncTimer = null;
  let lastIntervalPollAt = 0;
  let supabaseSession = null;

  const el = {
    appShell: document.getElementById("appShell"),
    desktopDateSlot: document.getElementById("desktopDateSlot"),
    mobileDateSlot: document.getElementById("mobileDateSlot"),
    dateNav: document.getElementById("dateNav"),
    datePicker: document.getElementById("datePicker"),
    datePickerBtn: document.getElementById("datePickerBtn"),
    dateDisplayText: document.getElementById("dateDisplayText"),
    dateWeekdayBadge: document.getElementById("dateWeekdayBadge"),
    calendarPopover: document.getElementById("calendarPopover"),
    calPrevMonthBtn: document.getElementById("calPrevMonthBtn"),
    calNextMonthBtn: document.getElementById("calNextMonthBtn"),
    calTodayBtn: document.getElementById("calTodayBtn"),
    calMonthLabel: document.getElementById("calMonthLabel"),
    calDaysGrid: document.getElementById("calDaysGrid"),
    prevDayBtn: document.getElementById("prevDayBtn"),
    nextDayBtn: document.getElementById("nextDayBtn"),
    todayBtn: document.getElementById("todayBtn"),
    nowBanner: document.getElementById("nowBanner"),
    nowBannerLabel: document.getElementById("nowBannerLabel"),
    islandRingFg: document.getElementById("islandRingFg"),
    islandLiveToast: document.getElementById("islandLiveToast"),
    islandLiveIcon: document.getElementById("islandLiveIcon"),
    islandLiveText: document.getElementById("islandLiveText"),
    islandLiveActionBtn: document.getElementById("islandLiveActionBtn"),
    islandExpanded: document.getElementById("islandExpanded"),
    islandTypeBadge: document.getElementById("islandTypeBadge"),
    nowEventTitle: document.getElementById("nowEventTitle"),
    nowEventTime: document.getElementById("nowEventTime"),
    islandElapsedText: document.getElementById("islandElapsedText"),
    nowProgressBar: document.getElementById("nowProgressBar"),
    nowRemaining: document.getElementById("nowRemaining"),
    islandMemoPreview: document.getElementById("islandMemoPreview"),
    nowMinusBtn: document.getElementById("nowMinusBtn"),
    nowExtendBtn: document.getElementById("nowExtendBtn"),
    nowPlus30Btn: document.getElementById("nowPlus30Btn"),
    nowStartNowBtn: document.getElementById("nowStartNowBtn"),
    nowJumpBtn: document.getElementById("nowJumpBtn"),
    nowDoneBtn: document.getElementById("nowDoneBtn"),
    islandNextInfo: document.getElementById("islandNextInfo"),
    islandReminderInfo: document.getElementById("islandReminderInfo"),
    undoBtn: document.getElementById("undoBtn"),
    syncNowBtn: document.getElementById("syncNowBtn"),
    openApiModalBtn: document.getElementById("openApiModalBtn"),
    openSettingsBtn: document.getElementById("openSettingsBtn"),
    apiSourceDot: document.getElementById("apiSourceDot"),
    apiSourceLabel: document.getElementById("apiSourceLabel"),

    stagingDock: document.getElementById("stagingDock"),
    stagedCountBadge: document.getElementById("stagedCountBadge"),
    mobileTabBar: document.getElementById("mobileTabBar"),
    mobileDockBadge: document.getElementById("mobileDockBadge"),
    mobileAddFab: document.getElementById("mobileAddFab"),
    modalUntimedPicker: document.getElementById("modalUntimedPicker"),
    modalUntimedChips: document.getElementById("modalUntimedChips"),
    addStagedForm: document.getElementById("addStagedForm"),
    newStagedTitle: document.getElementById("newStagedTitle"),
    newStagedType: document.getElementById("newStagedType"),
    untimedCount: document.getElementById("untimedCount"),
    untimedList: document.getElementById("untimedList"),
    placedSection: document.getElementById("placedSection"),
    placedCollapseBtn: document.getElementById("placedCollapseBtn"),
    placedCount: document.getElementById("placedCount"),
    placedList: document.getElementById("placedList"),
    placedTasksOnlyBtn: document.getElementById("placedTasksOnlyBtn"),
    reminderSummaryCount: document.getElementById("reminderSummaryCount"),
    reminderHighlightList: document.getElementById("reminderHighlightList"),

    typeFilterBar: document.getElementById("typeFilterBar"),
    earlyToggleBtn: document.getElementById("earlyToggleBtn"),
    openRoutinesBtn: document.getElementById("openRoutinesBtn"),
    addEventBtn: document.getElementById("addEventBtn"),
    presetList: document.getElementById("presetList"),
    editPresetsBtn: document.getElementById("editPresetsBtn"),
    timelineScroll: document.getElementById("timelineScroll"),
    timelineGrid: document.getElementById("timelineGrid"),
    hourRowsLayer: document.getElementById("hourRowsLayer"),
    ghostPreview: document.getElementById("ghostPreview"),
    nowLine: document.getElementById("nowLine"),
    nowLineBadge: document.getElementById("nowLineBadge"),
    eventsLayer: document.getElementById("eventsLayer"),

    widgetConfigBtn: document.getElementById("widgetConfigBtn"),
    completionPercent: document.getElementById("completionPercent"),
    statTotalCount: document.getElementById("statTotalCount"),
    statDoneCount: document.getElementById("statDoneCount"),
    statRemainingCount: document.getElementById("statRemainingCount"),
    typeBreakdownBars: document.getElementById("typeBreakdownBars"),
    addYoutubeForm: document.getElementById("addYoutubeForm"),
    newYtTitle: document.getElementById("newYtTitle"),
    newYtUrl: document.getElementById("newYtUrl"),
    newYtDuration: document.getElementById("newYtDuration"),
    youtubeList: document.getElementById("youtubeList"),
    ytCountBadge: document.getElementById("ytCountBadge"),
    dailyMemo: document.getElementById("dailyMemo"),
    memoSavedHint: document.getElementById("memoSavedHint"),

    eventModal: document.getElementById("eventModal"),
    eventModalTitle: document.getElementById("eventModalTitle"),
    eventForm: document.getElementById("eventForm"),
    editEventId: document.getElementById("editEventId"),
    editTitle: document.getElementById("editTitle"),
    editDate: document.getElementById("editDate"),
    editType: document.getElementById("editType"),
    editTimedCheck: document.getElementById("editTimedCheck"),
    editTimeFields: document.getElementById("editTimeFields"),
    editStart: document.getElementById("editStart"),
    editHasEndCheck: document.getElementById("editHasEndCheck"),
    editEnd: document.getElementById("editEnd"),
    editDone: document.getElementById("editDone"),
    editMemo: document.getElementById("editMemo"),
    deleteEventModalBtn: document.getElementById("deleteEventModalBtn"),

    presetManageList: document.getElementById("presetManageList"),
    addPresetForm: document.getElementById("addPresetForm"),
    presetEditId: document.getElementById("presetEditId"),
    presetIcon: document.getElementById("presetIcon"),
    presetTitle: document.getElementById("presetTitle"),
    presetDuration: document.getElementById("presetDuration"),
    presetDurationSelect: document.getElementById("presetDurationSelect"),
    presetDurLabel: document.getElementById("presetDurLabel"),
    presetDurMinusBtn: document.getElementById("presetDurMinusBtn"),
    presetDurPlusBtn: document.getElementById("presetDurPlusBtn"),
    presetType: document.getElementById("presetType"),
    presetSubmitBtn: document.getElementById("presetSubmitBtn"),
    presetCancelEditBtn: document.getElementById("presetCancelEditBtn"),

    apiModal: document.getElementById("apiModal"),
    settingsModalBody: document.getElementById("settingsModalBody"),
    settingsTimelineSection: document.getElementById("settingsTimelineSection"),
    settingsDisplaySection: document.getElementById("settingsDisplaySection"),
    settingsRoutineSection: document.getElementById("settingsRoutineSection"),
    settingsPresetSection: document.getElementById("settingsPresetSection"),
    settingsAccountSection: document.getElementById("settingsAccountSection"),
    applyRoutinesNowBtn: document.getElementById("applyRoutinesNowBtn"),
    routineManageList: document.getElementById("routineManageList"),
    addRoutineForm: document.getElementById("addRoutineForm"),
    routineEditId: document.getElementById("routineEditId"),
    routineTitle: document.getElementById("routineTitle"),
    routineType: document.getElementById("routineType"),
    routineTime: document.getElementById("routineTime"),
    routineUntimedCheck: document.getElementById("routineUntimedCheck"),
    routineDuration: document.getElementById("routineDuration"),
    routineWeekdayBar: document.getElementById("routineWeekdayBar"),
    routineSubmitBtn: document.getElementById("routineSubmitBtn"),
    routineCancelEditBtn: document.getElementById("routineCancelEditBtn"),
    snapSelect: document.getElementById("snapSelect"),
    zoomRange: document.getElementById("zoomRange"),
    zoomValueLabel: document.getElementById("zoomValueLabel"),
    defaultDurationSelect: document.getElementById("defaultDurationSelect"),
    earlyStartHourSelect: document.getElementById("earlyStartHourSelect"),
    earlyEndHourSelect: document.getElementById("earlyEndHourSelect"),
    earlyCollapsedCheck: document.getElementById("earlyCollapsedCheck"),
    cascadeCheck: document.getElementById("cascadeCheck"),
    themeSelect: document.getElementById("themeSelect"),
    dimCompletedCheck: document.getElementById("dimCompletedCheck"),
    browserNotifyCheck: document.getElementById("browserNotifyCheck"),
    showPlacedListCheck: document.getElementById("showPlacedListCheck"),
    settingsWidgetChecks: document.getElementById("settingsWidgetChecks"),
    resetPresetsBtn: document.getElementById("resetPresetsBtn"),
    resetAllPrefsBtn: document.getElementById("resetAllPrefsBtn"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    authGate: document.getElementById("authGate"),
    authGateForm: document.getElementById("authGateForm"),
    authGateEmail: document.getElementById("authGateEmail"),
    authGatePassword: document.getElementById("authGatePassword"),
    authGateError: document.getElementById("authGateError"),
    authGateSubmitBtn: document.getElementById("authGateSubmitBtn"),
    apiSettingsForm: document.getElementById("apiSettingsForm"),
    supabaseFields: document.getElementById("supabaseFields"),
    sbSignedInBox: document.getElementById("sbSignedInBox"),
    sbUserEmail: document.getElementById("sbUserEmail"),
    sbLogoutBtn: document.getElementById("sbLogoutBtn"),
    sbLoginFormBox: document.getElementById("sbLoginFormBox"),
    sbLoginEmail: document.getElementById("sbLoginEmail"),
    sbLoginPassword: document.getElementById("sbLoginPassword"),
    sbLoginBtn: document.getElementById("sbLoginBtn"),

    toast: document.getElementById("toast")
  };

  /* -------------------- 유틸 -------------------- */

  function showToast(msg, icon = "✨", options = {}) {
    const { durationMs = 2800, action = null } = options;
    const hasIsland = Boolean(el.islandLiveToast && el.nowBanner);
    const isMobileViewport = window.matchMedia("(max-width: 1024px)").matches;
    const hasAction = Boolean(action && typeof action.onClick === "function");

    if (!isMobileViewport || !hasIsland) {
      el.toast.innerHTML = "";
      const msgSpan = document.createElement("span");
      msgSpan.className = "toast-msg";
      msgSpan.textContent = msg;
      el.toast.appendChild(msgSpan);

      if (hasAction) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toast-action-btn";
        btn.textContent = action.label || "되돌리기";
        btn.addEventListener("click", async () => {
          clearTimeout(toastTimer);
          el.toast.classList.add("hidden");
          await action.onClick();
        });
        el.toast.appendChild(btn);
      }

      el.toast.classList.remove("hidden");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.add("hidden"), durationMs);
    } else {
      clearTimeout(toastTimer);
      el.toast.classList.add("hidden");
    }

    if (hasIsland) {
      el.islandLiveIcon.textContent = icon;
      el.islandLiveText.textContent = msg;
      if (el.islandLiveActionBtn) {
        if (hasAction) {
          el.islandLiveActionBtn.textContent = action.label || "되돌리기";
          el.islandLiveActionBtn.classList.remove("hidden");
          el.islandLiveActionBtn.onclick = async (e) => {
            e.stopPropagation();
            clearTimeout(islandNotifyTimer);
            clearTimeout(toastTimer);
            el.nowBanner.classList.remove("is-notify");
            el.islandLiveToast.classList.add("hidden");
            el.toast.classList.add("hidden");
            await action.onClick();
          };
        } else {
          el.islandLiveActionBtn.classList.add("hidden");
          el.islandLiveActionBtn.onclick = null;
        }
      }
      el.islandLiveToast.classList.remove("hidden");
      el.nowBanner.classList.add("is-notify");
      clearTimeout(islandNotifyTimer);
      islandNotifyTimer = setTimeout(() => {
        el.nowBanner.classList.remove("is-notify");
        el.islandLiveToast.classList.add("hidden");
      }, hasAction ? durationMs : Math.min(durationMs, 3200));
    }
  }

  function updateUndoButton() {
    if (!el.undoBtn) return;
    el.undoBtn.disabled = undoStack.length === 0;
    el.undoBtn.title = undoStack.length
      ? `실행 취소 (Ctrl+Z): ${undoStack[undoStack.length - 1].label}`
      : "실행 취소 (Ctrl+Z)";
  }

  function pushUndoAction(label, undoFn) {
    const entry = { label, undo: undoFn };
    undoStack.push(entry);
    if (undoStack.length > 20) undoStack.shift();
    updateUndoButton();
    return entry;
  }

  async function undoLastAction() {
    const entry = undoStack.pop();
    updateUndoButton();
    if (!entry) {
      showToast("되돌릴 작업이 없습니다.", "↩️");
      return;
    }
    try {
      lastUserMutationAt = Date.now();
      await entry.undo();
      showToast(`실행 취소: ${entry.label}`, "↩️");
    } catch (err) {
      showToast(`실행 취소 실패: ${err.message}`, "⚠️");
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function snap(min) {
    const step = prefs.snapMin || 15;
    return Math.round(min / step) * step;
  }

  function minToTimeStr(totalMin) {
    return PlannerAPI.minutesToHhmm(totalMin);
  }

  function getNowKstMinutes() {
    return PlannerAPI.nowKstMinutes();
  }

  function isViewingToday() {
    return currentDate === PlannerAPI.todayKst();
  }

  function formatEventTimeLabel(ev) {
    if (!ev.hasStartAt) return "시간 미정";
    const startStr = minToTimeStr(ev.startMin);
    if (!ev.hasEndAt || ev.endMin === null) {
      return startStr;
    }
    const dur = ev.endMin - ev.startMin;
    return `${startStr} - ${minToTimeStr(ev.endMin)} (${dur}분)`;
  }

  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str = "") {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  /* -------------------- 좌표 <-> 시간 변환 -------------------- */

  function getEarlyStartMin() {
    const h = Number(prefs.earlyStartHour);
    const clampedHour = Number.isFinite(h) ? clamp(Math.round(h), 0, 11) : 0;
    return clampedHour * 60;
  }

  function getEarlyEndMin() {
    const startH = Math.round(getEarlyStartMin() / 60);
    const h = Number(prefs.earlyEndHour);
    const clampedHour = Number.isFinite(h) ? clamp(Math.round(h), startH + 1, 12) : Math.max(startH + 1, 7);
    return clampedHour * 60;
  }

  function getTimelineMinBound() {
    return 0;
  }

  function toDisplayMin(min) {
    const earlyEndMin = getEarlyEndMin();
    if (min >= earlyEndMin) return min - earlyEndMin;
    return 1440 - earlyEndMin + min;
  }

  function fromDisplayMin(d) {
    const earlyEndMin = getEarlyEndMin();
    const daySpan = 1440 - earlyEndMin;
    if (d < daySpan) return earlyEndMin + d;
    return d - daySpan;
  }

  function displayMinToY(d) {
    if (!prefs.earlyCollapsed) {
      return d * prefs.pxPerMin;
    }
    const earlyStartMin = getEarlyStartMin();
    const earlyEndMin = getEarlyEndMin();
    const dCollapseStart = 1440 - earlyEndMin + earlyStartMin;
    if (d <= dCollapseStart) {
      return d * prefs.pxPerMin;
    }
    const collapsedSpan = Math.max(1, 1440 - dCollapseStart);
    return (
      dCollapseStart * prefs.pxPerMin +
      ((d - dCollapseStart) / collapsedSpan) * COLLAPSED_EARLY_HEIGHT
    );
  }

  function getDefaultDurationMin() {
    const d = Number(prefs.defaultDurationMin);
    return [15, 30, 45, 60, 90].includes(d) ? d : 30;
  }

  function minToY(min) {
    return displayMinToY(toDisplayMin(min));
  }

  function endMinToY(endMin, startMin) {
    const earlyEndMin = getEarlyEndMin();
    if (startMin < earlyEndMin && endMin >= earlyEndMin) {
      return displayMinToY(1440);
    }
    return displayMinToY(toDisplayMin(endMin));
  }

  function yToMin(y) {
    const earlyStartMin = getEarlyStartMin();
    const earlyEndMin = getEarlyEndMin();
    if (!prefs.earlyCollapsed) {
      return fromDisplayMin(clamp(y / prefs.pxPerMin, 0, 1440));
    }
    const dCollapseStart = 1440 - earlyEndMin + earlyStartMin;
    const collapsedTop = dCollapseStart * prefs.pxPerMin;
    if (y < collapsedTop) {
      return fromDisplayMin(clamp(y / prefs.pxPerMin, 0, dCollapseStart));
    }
    return earlyStartMin;
  }

  function getTimelineTotalHeight() {
    if (!prefs.earlyCollapsed) return 1440 * prefs.pxPerMin;
    const collapsedSpan = getEarlyEndMin() - getEarlyStartMin();
    return (1440 - collapsedSpan) * prefs.pxPerMin + COLLAPSED_EARLY_HEIGHT;
  }

  /* -------------------- 상태 분류 & 컬럼 배치 -------------------- */

  function getEventTimeState(ev) {
    const todayStr = PlannerAPI.todayKst();
    const nowMin = getNowKstMinutes();

    if (!ev.hasStartAt) {
      return { isNow: false, isPast: currentDate < todayStr };
    }

    if (currentDate < todayStr) {
      return { isNow: false, isPast: true };
    }
    if (currentDate > todayStr) {
      return { isNow: false, isPast: false };
    }

    const activeEnd = ev.hasEndAt && ev.endMin !== null ? ev.endMin : ev.startMin + 30;
    const isNow = !ev.done && ev.startMin <= nowMin && nowMin < activeEnd;
    const isPast = !isNow && activeEnd <= nowMin;
    return { isNow, isPast };
  }

  function computeEventColumns(events) {
    const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.visualEndMin - b.visualEndMin);
    const layoutMap = new Map();
    let cluster = [];
    let clusterEnd = -1;

    function flushCluster(items) {
      if (!items.length) return;
      const colEnds = [];
      const itemCols = [];
      for (const ev of items) {
        let colIdx = colEnds.findIndex((endMin) => endMin <= ev.startMin);
        if (colIdx === -1) {
          colIdx = colEnds.length;
          colEnds.push(ev.visualEndMin);
        } else {
          colEnds[colIdx] = ev.visualEndMin;
        }
        itemCols.push({ id: ev.id, col: colIdx });
      }
      const totalCols = colEnds.length;
      for (const ic of itemCols) {
        layoutMap.set(ic.id, { col: ic.col, totalCols });
      }
    }

    for (const ev of sorted) {
      if (cluster.length && ev.startMin >= clusterEnd) {
        flushCluster(cluster);
        cluster = [];
        clusterEnd = -1;
      }
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.visualEndMin);
    }
    flushCluster(cluster);
    return layoutMap;
  }

  function findNextAvailableSlot(durationMin = getDefaultDurationMin()) {
    const earlyEndMin = getEarlyEndMin();
    const step = prefs.snapMin || 15;
    const timed = schedules
      .filter((e) => e.hasStartAt && e.type !== "reminder")
      .sort((a, b) => a.startMin - b.startMin);
    const startSearch = isViewingToday()
      ? Math.max(earlyEndMin, Math.ceil(getNowKstMinutes() / step) * step)
      : 540;

    let candidate = startSearch;
    const span = Math.max(15, durationMin || getDefaultDurationMin());
    for (const ev of timed) {
      if (candidate + span <= ev.startMin) {
        return candidate;
      }
      if (candidate < ev.visualEndMin) {
        candidate = Math.ceil(ev.visualEndMin / step) * step;
      }
    }
    return clamp(candidate, earlyEndMin, 1440 - span);
  }

  /* -------------------- 날짜 표시 & 커스텀 달력 팝오버 -------------------- */

  const CAL_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  let calendarViewMonth = null;

  function parseDateParts(dateStr) {
    const [y, m, d] = String(dateStr || PlannerAPI.todayKst())
      .split("-")
      .map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      monthIdx: dt.getUTCMonth(),
      day: dt.getUTCDate(),
      dow: dt.getUTCDay(),
    };
  }

  function formatYmd(year, monthIdx, day) {
    const dt = new Date(Date.UTC(year, monthIdx, day));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const holidayYearCache = new Map();
  let lunarFormatter = null;
  try {
    lunarFormatter = new Intl.DateTimeFormat("en-u-ca-chinese", {
      timeZone: "UTC",
      month: "numeric",
      day: "numeric",
    });
  } catch {
    lunarFormatter = null;
  }

  function getLunarMonthDay(utcDate) {
    if (!lunarFormatter) return null;
    try {
      const parts = lunarFormatter.formatToParts(utcDate);
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      if (!m || !d || /bis/i.test(m)) return null;
      return `${Number(m)}-${Number(d)}`;
    } catch {
      return null;
    }
  }

  function getKoreanHolidaysForYear(year) {
    if (holidayYearCache.has(year)) return holidayYearCache.get(year);

    const holidays = new Map();
    const solarFixed = [
      ["01-01", "신정", false],
      ["03-01", "삼일절", true],
      ["05-05", "어린이날", true],
      ["06-06", "현충일", false],
      ["08-15", "광복절", true],
      ["10-03", "개천절", true],
      ["10-09", "한글날", true],
      ["12-25", "성탄절", true],
    ];

    const subCandidates = [];
    for (const [md, name, hasSub] of solarFixed) {
      const ymd = `${year}-${md}`;
      holidays.set(ymd, name);
      if (hasSub) {
        const dow = parseDateParts(ymd).dow;
        if (dow === 0 || dow === 6) subCandidates.push(ymd);
      }
    }

    // 음력 공휴일(설날·부처님오신날·추석)은 연초/연말 전후 포함 스캔
    const scanStart = Date.UTC(year - 1, 11, 20);
    const scanEnd = Date.UTC(year + 1, 0, 10);
    const addLunarHoliday = (ymd, name) => {
      if (!ymd.startsWith(`${year}-`)) return;
      const prev = holidays.get(ymd);
      holidays.set(ymd, prev ? `${prev} · ${name}` : name);
    };

    const seollalDays = [];
    const chuseokDays = [];
    for (let ts = scanStart; ts <= scanEnd; ts += 86400000) {
      const dt = new Date(ts);
      const md = getLunarMonthDay(dt);
      if (md === "1-1") {
        const prevYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - 1);
        const curYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
        const nextYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1);
        addLunarHoliday(prevYmd, "설날 연휴");
        addLunarHoliday(curYmd, "설날");
        addLunarHoliday(nextYmd, "설날 연휴");
        seollalDays.push(prevYmd, curYmd, nextYmd);
      } else if (md === "4-8") {
        const curYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
        addLunarHoliday(curYmd, "부처님오신날");
        if (curYmd.startsWith(`${year}-`)) {
          const dow = new Date(ts).getUTCDay();
          if (dow === 0 || dow === 6) subCandidates.push(curYmd);
        }
      } else if (md === "8-15") {
        const prevYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - 1);
        const curYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
        const nextYmd = formatYmd(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1);
        addLunarHoliday(prevYmd, "추석 연휴");
        addLunarHoliday(curYmd, "추석");
        addLunarHoliday(nextYmd, "추석 연휴");
        chuseokDays.push(prevYmd, curYmd, nextYmd);
      }
    }

    // 설날·추석 연휴는 일요일과 겹칠 때 대체공휴일 적용
    [seollalDays, chuseokDays].forEach((group) => {
      const hasSunday = group.some((d) => d.startsWith(`${year}-`) && parseDateParts(d).dow === 0);
      if (hasSunday) {
        const last = group.filter((d) => d.startsWith(`${year}-`)).pop();
        if (last) subCandidates.push(last);
      }
    });

    // 대체공휴일 배정 (해당일 이후 첫 번째 비공휴일 평일)
    subCandidates.sort();
    for (const baseYmd of subCandidates) {
      const p = parseDateParts(baseYmd);
      for (let offset = 1; offset <= 10; offset++) {
        const candYmd = formatYmd(p.year, p.monthIdx, p.day + offset);
        if (!candYmd.startsWith(`${year}-`)) break;
        const cDow = parseDateParts(candYmd).dow;
        if (cDow !== 0 && cDow !== 6 && !holidays.has(candYmd)) {
          holidays.set(candYmd, "대체공휴일");
          break;
        }
      }
    }

    holidayYearCache.set(year, holidays);
    return holidays;
  }

  function getKoreanHolidayName(dateStr) {
    if (!dateStr) return "";
    const { year } = parseDateParts(dateStr);
    return getKoreanHolidaysForYear(year).get(dateStr) || "";
  }

  function updateDateDisplay(dateStr) {
    if (el.datePicker) el.datePicker.value = dateStr;
    const { year, month, day, dow } = parseDateParts(dateStr);
    const holidayName = getKoreanHolidayName(dateStr);
    if (el.dateDisplayText) {
      el.dateDisplayText.textContent = `${year}. ${String(month).padStart(2, "0")}. ${String(day).padStart(2, "0")}`;
    }
    if (el.dateWeekdayBadge) {
      el.dateWeekdayBadge.textContent = holidayName
        ? `(${CAL_WEEKDAY_LABELS[dow]} · ${holidayName})`
        : `(${CAL_WEEKDAY_LABELS[dow]})`;
    }
    if (el.datePickerBtn) {
      el.datePickerBtn.classList.toggle("is-holiday", Boolean(holidayName));
      el.datePickerBtn.classList.toggle("is-sat", dow === 6 && !holidayName);
      el.datePickerBtn.classList.toggle("is-sun", dow === 0 || Boolean(holidayName));
      el.datePickerBtn.title = holidayName
        ? `${dateStr} (${CAL_WEEKDAY_LABELS[dow]}) · ${holidayName}`
        : "달력에서 날짜 선택";
    }
    if (el.calendarPopover && !el.calendarPopover.classList.contains("hidden")) {
      renderCalendarPopover();
    }
  }

  function renderCalendarPopover() {
    if (!el.calDaysGrid || !el.calMonthLabel) return;
    if (!calendarViewMonth) {
      const p = parseDateParts(currentDate);
      calendarViewMonth = { year: p.year, monthIdx: p.monthIdx };
    }
    const { year, monthIdx } = calendarViewMonth;
    el.calMonthLabel.textContent = `${year}년 ${monthIdx + 1}월`;

    const firstDow = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay();
    const todayStr = PlannerAPI.todayKst();

    el.calDaysGrid.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(Date.UTC(year, monthIdx, 1 - firstDow + i));
      const cYear = cellDate.getUTCFullYear();
      const cMonthIdx = cellDate.getUTCMonth();
      const cDay = cellDate.getUTCDate();
      const cDow = cellDate.getUTCDay();
      const cellStr = formatYmd(cYear, cMonthIdx, cDay);
      const holidayName = getKoreanHolidayName(cellStr);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day-btn";
      if (holidayName) {
        btn.classList.add("is-holiday", "is-sun");
      } else if (cDow === 6) {
        btn.classList.add("is-sat");
      } else if (cDow === 0) {
        btn.classList.add("is-sun");
      }
      if (cMonthIdx !== monthIdx) btn.classList.add("is-other-month");
      if (cellStr === todayStr) btn.classList.add("is-today");
      if (cellStr === currentDate) btn.classList.add("is-selected");
      btn.textContent = String(cDay);
      btn.title = holidayName
        ? `${cellStr} (${CAL_WEEKDAY_LABELS[cDow]}) · ${holidayName}`
        : `${cellStr} (${CAL_WEEKDAY_LABELS[cDow]})`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCalendarPopover();
        loadDay(cellStr);
      });
      frag.appendChild(btn);
    }
    el.calDaysGrid.appendChild(frag);
  }

  function openCalendarPopover() {
    if (!el.calendarPopover) return;
    const p = parseDateParts(currentDate);
    calendarViewMonth = { year: p.year, monthIdx: p.monthIdx };
    renderCalendarPopover();
    el.calendarPopover.classList.remove("hidden");
    el.datePickerBtn?.setAttribute("aria-expanded", "true");
  }

  function closeCalendarPopover() {
    if (!el.calendarPopover || el.calendarPopover.classList.contains("hidden")) return;
    el.calendarPopover.classList.add("hidden");
    el.datePickerBtn?.setAttribute("aria-expanded", "false");
  }

  function shiftCalendarMonth(delta) {
    if (!calendarViewMonth) {
      const p = parseDateParts(currentDate);
      calendarViewMonth = { year: p.year, monthIdx: p.monthIdx };
    }
    const dt = new Date(Date.UTC(calendarViewMonth.year, calendarViewMonth.monthIdx + delta, 1));
    calendarViewMonth = { year: dt.getUTCFullYear(), monthIdx: dt.getUTCMonth() };
    renderCalendarPopover();
  }

  /* -------------------- API 호출 래퍼 -------------------- */

  async function loadDay(dateStr, scrollOptimal = true) {
    const reqToken = ++loadRequestToken;
    currentDate = dateStr;
    updateDateDisplay(dateStr);
    selectedEventId = null;
    updateApiBadge();

    widgetsState = PlannerAPI.loadWidgetsState(dateStr);

    const settings = PlannerAPI.getSettings();
    const cached =
      settings.mode === "agent" || settings.mode === "supabase"
        ? PlannerAPI.getCachedSchedules(dateStr)
        : null;
    if (cached) {
      schedules = cached;
      renderAll();
      if (scrollOptimal) {
        scrollToOptimalPosition();
      }
    }

    try {
      const fresh = await PlannerAPI.fetchSchedules(dateStr);
      if (reqToken !== loadRequestToken || dateStr !== currentDate) return;
      schedules = fresh;
      renderAll();
      if (!cached && scrollOptimal) {
        scrollToOptimalPosition();
      }
    } catch (err) {
      if (reqToken !== loadRequestToken || dateStr !== currentDate) return;
      if (cached) {
        showToast(`캐시된 일정 표시 중 (${err.message})`, "📡");
      } else {
        schedules = [];
        renderAll();
        showToast(err.message, "⚠️");
      }
    }
  }

  function getScheduleSignature(list) {
    return (list || [])
      .map((s) => `${s.id}|${s.updated_at || ""}|${s.done ? 1 : 0}|${s.start_at || ""}|${s.end_at || ""}|${s.title}|${s.type}|${s.memo || ""}`)
      .join("\n");
  }

  function isAutoSyncPaused(options = {}) {
    if (!options.ignoreInFlight && isBackgroundSyncing) return true;
    if (document.hidden || activeHtmlDragPayload || activePointerDrag) return true;
    if (Date.now() - lastUserMutationAt < 2500) return true;
    if (document.querySelector(".modal-backdrop:not(.hidden)")) return true;
    if (!supabaseSession) return true;
    return false;
  }

  async function syncIfChanged(showNotify = true, options = {}) {
    const now = Date.now();
    const force = Boolean(options.force);
    if (!force && now - lastSyncCheckAt < 2000) return;

    if (options.fromBroadcast) {
      const mutationElapsed = now - lastUserMutationAt;
      if (mutationElapsed < 2500) {
        clearTimeout(deferredBroadcastSyncTimer);
        deferredBroadcastSyncTimer = setTimeout(() => {
          syncIfChanged(showNotify, { force: true });
        }, 2600 - mutationElapsed);
        return;
      }
      if (isBackgroundSyncing) {
        clearTimeout(deferredBroadcastSyncTimer);
        deferredBroadcastSyncTimer = setTimeout(() => {
          syncIfChanged(showNotify, { force: true, fromBroadcast: true });
        }, 300);
        return;
      }
    }

    if (isAutoSyncPaused()) return;

    lastSyncCheckAt = now;
    isBackgroundSyncing = true;
    const targetDate = currentDate;

    try {
      const fresh = await PlannerAPI.fetchSchedules(targetDate, { applyRoutines: false });
      if (targetDate !== currentDate || isAutoSyncPaused({ ignoreInFlight: true })) return;

      if (getScheduleSignature(fresh) !== getScheduleSignature(schedules)) {
        schedules = fresh;
        renderAll();
        if (showNotify) {
          showToast("일정 변경사항이 실시간 반영되었습니다.", "⚡");
        }
      }
    } catch {
      // 백그라운드 동기화 실패 시 조용히 다음 주기에 재시도
    } finally {
      isBackgroundSyncing = false;
    }
  }

  async function disconnectRealtime() {
    clearTimeout(realtimeDebounceTimer);
    clearTimeout(deferredBroadcastSyncTimer);
    const ch = realtimeChannel;
    const client = realtimeClient;
    realtimeChannel = null;
    realtimeClient = null;
    realtimeConfigKey = "";
    if (realtimeConnected) {
      realtimeConnected = false;
      updateApiBadge();
    }
    if (client && ch) {
      try {
        await client.removeChannel(ch);
      } catch {
        // ignore cleanup error
      }
    }
  }

  async function setupRealtimeSync(forceReconnect = false) {
    if (!supabaseSession) {
      try {
        supabaseSession = await PlannerAPI.getSupabaseSession();
      } catch {
        supabaseSession = null;
      }
    }
    if (!supabaseSession) {
      await disconnectRealtime();
      return;
    }

    const nextKey = `supabase|${supabaseSession.user?.id || ""}`;
    if (!forceReconnect && (realtimeConnecting || (realtimeChannel && realtimeConfigKey === nextKey))) {
      return;
    }

    realtimeConnecting = true;
    try {
      const sb = await PlannerAPI.getSupabaseClient();
      await disconnectRealtime();

      realtimeConfigKey = nextKey;
      realtimeClient = sb;
      realtimeChannel = sb
        .channel("muse-schedules-db")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "schedules" },
          (payload) => {
            const nextRow = payload?.new || {};
            const oldRow = payload?.old || {};
            const changedDate = nextRow.date || null;
            const oldDate = oldRow.date || null;

            if (changedDate && changedDate !== currentDate) {
              PlannerAPI.clearCachedSchedules(changedDate);
            }
            if (oldDate && oldDate !== currentDate) {
              PlannerAPI.clearCachedSchedules(oldDate);
            }

            const affectsCurrent =
              (!changedDate && !oldDate) ||
              changedDate === currentDate ||
              oldDate === currentDate;
            if (!affectsCurrent) return;

            clearTimeout(realtimeDebounceTimer);
            realtimeDebounceTimer = setTimeout(() => {
              syncIfChanged(true, { force: true, fromBroadcast: true });
            }, 180);
          }
        )
        .subscribe((status) => {
          const isSub = status === "SUBSCRIBED";
          if (realtimeConnected !== isSub) {
            realtimeConnected = isSub;
            updateApiBadge();
          }
        });
    } catch {
      realtimeConnected = false;
      updateApiBadge();
    } finally {
      realtimeConnecting = false;
    }
  }

  function switchMobileTab(tab = "timeline") {
    if (!el.appShell) return;
    el.appShell.dataset.mobileTab = tab;
    if (el.mobileTabBar) {
      el.mobileTabBar.querySelectorAll(".mobile-tab-btn").forEach((b) => {
        b.classList.toggle("active", (b.dataset.mobileTab || "timeline") === tab);
      });
    }
    alignDynamicIsland();
  }

  function scrollTimelineToY(offsetY, smooth = true) {
    if (!el.timelineScroll || !el.timelineGrid) return;
    const clampedOffset = Math.max(0, offsetY);
    if (el.timelineScroll.scrollHeight > el.timelineScroll.clientHeight + 2) {
      el.timelineScroll.scrollTo({ top: clampedOffset, behavior: smooth ? "smooth" : "auto" });
      return;
    }
    const gridTop = el.timelineGrid.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, gridTop + clampedOffset),
      behavior: smooth ? "smooth" : "auto"
    });
  }

  function scrollToOptimalPosition(smooth = false) {
    const earlyEndMin = getEarlyEndMin();
    const timed = schedules.filter((e) => e.hasStartAt);
    let targetMin = 540;
    if (isViewingToday()) {
      const nowMin = getNowKstMinutes();
      const firstTimedMin = timed.length ? timed[0].startMin : nowMin;
      targetMin = Math.max(earlyEndMin, Math.min(nowMin, firstTimedMin) - 45);
    } else if (timed.length) {
      targetMin = Math.max(earlyEndMin, timed[0].startMin - 45);
    }
    scrollTimelineToY(minToY(targetMin) - 18, smooth);
  }

  function syncSwrCacheIfCurrent(dateStr, list) {
    const mode = PlannerAPI.getSettings().mode;
    if (mode === "agent" || mode === "supabase") {
      PlannerAPI.setCachedSchedules(dateStr, list);
    }
  }

  async function createScheduleAndRecord(payload, toastMsg) {
    lastUserMutationAt = Date.now();
    const created = await PlannerAPI.createSchedule(payload);
    if (created.date === currentDate) {
      schedules = PlannerAPI.sortSchedules([...schedules.filter((s) => s.id !== created.id), created]);
      syncSwrCacheIfCurrent(currentDate, schedules);
      renderAll();
    } else {
      await loadDay(created.date, false);
    }

    pushUndoAction(`'${created.title}' 등록`, async () => {
      await deleteScheduleById(created.id, { recordUndo: false, targetDate: created.date });
    });

    if (toastMsg) {
      showToast(toastMsg, "✅");
    }
    return created;
  }

  async function toggleScheduleDone(id, checked, options = {}) {
    const { recordUndo = true } = options;
    const idx = schedules.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const prev = { ...schedules[idx] };
    lastUserMutationAt = Date.now();
    schedules[idx] = {
      ...prev,
      done: checked,
      done_at: checked ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    syncSwrCacheIfCurrent(currentDate, schedules);
    renderAll();

    if (recordUndo) {
      pushUndoAction(`'${prev.title}' 완료 상태`, async () => {
        await toggleScheduleDone(id, prev.done, { recordUndo: false });
      });
    }

    try {
      const updated = await PlannerAPI.patchSchedule(id, { done: checked }, currentDate);
      const curIdx = schedules.findIndex((s) => s.id === id);
      if (curIdx !== -1 && updated) {
        schedules[curIdx] = updated;
        syncSwrCacheIfCurrent(currentDate, schedules);
        renderAll();
      }
      if (recordUndo) {
        showToast(checked ? `'${prev.title}' 완료!` : `'${prev.title}' 완료 해제`, checked ? "✅" : "↩️");
      }
    } catch (err) {
      const curIdx = schedules.findIndex((s) => s.id === id);
      if (curIdx !== -1) schedules[curIdx] = prev;
      syncSwrCacheIfCurrent(currentDate, schedules);
      renderAll();
      showToast(`완료 저장 실패: ${err.message}`, "⚠️");
    }
  }

  async function deleteScheduleById(id, options = {}) {
    const { recordUndo = true, targetDate = currentDate } = options;
    const removed = schedules.find((s) => s.id === id);
    const prevList = [...schedules];
    lastUserMutationAt = Date.now();
    schedules = schedules.filter((s) => s.id !== id);
    if (selectedEventId === id) selectedEventId = null;
    syncSwrCacheIfCurrent(currentDate, schedules);
    renderAll();

    try {
      await PlannerAPI.deleteSchedule(id, targetDate);
      if (recordUndo && removed) {
        const snapshot = { ...removed };
        const undoEntry = pushUndoAction(`'${snapshot.title}' 삭제`, async () => {
          const recreated = await PlannerAPI.createSchedule({
            date: snapshot.date,
            start_at: snapshot.start_at,
            end_at: snapshot.end_at,
            title: snapshot.title,
            type: snapshot.type,
            source: snapshot.source,
            memo: snapshot.memo || ""
          });
          const finalRec = snapshot.done
            ? await PlannerAPI.patchSchedule(recreated.id, { done: true }, snapshot.date)
            : recreated;
          if (finalRec.date === currentDate) {
            schedules = PlannerAPI.sortSchedules([...schedules, finalRec]);
            syncSwrCacheIfCurrent(currentDate, schedules);
            renderAll();
          } else {
            await loadDay(finalRec.date, false);
          }
        });
        showToast(`'${snapshot.title}' 삭제됨`, "🗑️", {
          durationMs: 5500,
          action: {
            label: "되돌리기",
            onClick: async () => {
              const idx = undoStack.indexOf(undoEntry);
              if (idx === -1) return;
              undoStack.splice(idx, 1);
              updateUndoButton();
              try {
                lastUserMutationAt = Date.now();
                await undoEntry.undo();
                showToast(`'${snapshot.title}' 복구됨`, "↩️");
              } catch (err) {
                showToast(`복구 실패: ${err.message}`, "⚠️");
              }
            }
          }
        });
      }
    } catch (err) {
      schedules = prevList;
      syncSwrCacheIfCurrent(currentDate, schedules);
      renderAll();
      showToast(`삭제 실패: ${err.message}`, "⚠️");
    }
  }

  async function commitScheduleTimeChange(ev, nextStartMin, nextEndMinOrNull, options = {}) {
    const { recordUndo = true, customStartIso, customEndIso } = options;
    const prevSchedulesSnapshot = schedules.map((s) => ({ ...s }));
    const affectedSnapshots = [{ id: ev.id, date: ev.date, start_at: ev.start_at, end_at: ev.end_at }];

    const hasCustomStart = customStartIso !== undefined;
    const nextStartIso = hasCustomStart
      ? customStartIso
      : PlannerAPI.kstMinutesToIso(ev.date, nextStartMin);
    const nextEndIso = hasCustomStart
      ? customEndIso ?? null
      : nextEndMinOrNull !== null
        ? PlannerAPI.kstMinutesToIso(ev.date, nextEndMinOrNull)
        : null;

    // 연쇄 밀기 대상 계산 (알림은 시점 마커이므로 연쇄 밀기 대상/트리거에서 제외)
    const cascadePatches = [];
    if (prefs.cascadeMode && ev.type !== "reminder" && nextStartMin !== null && !hasCustomStart) {
      const movedAnchorVisualEnd =
        nextEndMinOrNull !== null ? nextEndMinOrNull : Math.min(1440, nextStartMin + 30);
      let cursor = movedAnchorVisualEnd;
      const others = schedules
        .filter((s) => s.id !== ev.id && s.hasStartAt && !s.done && s.type !== "reminder")
        .sort((a, b) => a.startMin - b.startMin);

      for (const item of others) {
        if (item.visualEndMin > nextStartMin && item.startMin < cursor) {
          const itemSpan = item.hasEndAt ? item.endMin - item.startMin : null;
          const nextItemStart = clamp(cursor, 0, itemSpan ? 1440 - itemSpan : 1425);
          const nextItemEnd = itemSpan !== null ? nextItemStart + itemSpan : null;
          affectedSnapshots.push({
            id: item.id,
            date: item.date,
            start_at: item.start_at,
            end_at: item.end_at
          });
          cascadePatches.push({
            id: item.id,
            date: item.date,
            patch: {
              start_at: PlannerAPI.kstMinutesToIso(item.date, nextItemStart),
              end_at:
                nextItemEnd !== null ? PlannerAPI.kstMinutesToIso(item.date, nextItemEnd) : null
            }
          });
          cursor = Math.max(
            cursor,
            nextItemEnd !== null ? nextItemEnd : Math.min(1440, nextItemStart + 30)
          );
        }
      }
    }

    // 0ms Optimistic 즉시 반영
    const nowIso = new Date().toISOString();
    const patchMap = new Map([[ev.id, { start_at: nextStartIso, end_at: nextEndIso }]]);
    for (const cp of cascadePatches) {
      patchMap.set(cp.id, cp.patch);
    }

    lastUserMutationAt = Date.now();
    schedules = PlannerAPI.sortSchedules(
      schedules.map((item) => {
        const p = patchMap.get(item.id);
        if (!p) return item;
        return PlannerAPI.normalizeScheduleRecord(
          { ...item, start_at: p.start_at, end_at: p.end_at, updated_at: nowIso },
          item.date
        );
      })
    );
    syncSwrCacheIfCurrent(currentDate, schedules);
    renderAll();

    if (recordUndo) {
      pushUndoAction(`'${ev.title}' 시간 변경`, async () => {
        const undoMap = new Map(affectedSnapshots.map((snapItem) => [snapItem.id, snapItem]));
        schedules = PlannerAPI.sortSchedules(
          schedules.map((item) => {
            const snapItem = undoMap.get(item.id);
            if (!snapItem) return item;
            return PlannerAPI.normalizeScheduleRecord(
              { ...item, start_at: snapItem.start_at, end_at: snapItem.end_at, updated_at: new Date().toISOString() },
              item.date
            );
          })
        );
        syncSwrCacheIfCurrent(currentDate, schedules);
        renderAll();
        const restored = await Promise.all(
          affectedSnapshots.map((snapItem) =>
            PlannerAPI.patchSchedule(
              snapItem.id,
              { start_at: snapItem.start_at, end_at: snapItem.end_at },
              snapItem.date
            )
          )
        );
        const restoredMap = new Map(restored.filter(Boolean).map((r) => [r.id, r]));
        schedules = PlannerAPI.sortSchedules(schedules.map((item) => restoredMap.get(item.id) || item));
        syncSwrCacheIfCurrent(currentDate, schedules);
        renderAll();
      });
    }

    try {
      const patchResults = await Promise.all([
        PlannerAPI.patchSchedule(ev.id, { start_at: nextStartIso, end_at: nextEndIso }, currentDate),
        ...cascadePatches.map((cp) => PlannerAPI.patchSchedule(cp.id, cp.patch, currentDate))
      ]);
      const resultMap = new Map(patchResults.filter(Boolean).map((r) => [r.id, r]));
      schedules = PlannerAPI.sortSchedules(schedules.map((item) => resultMap.get(item.id) || item));
      syncSwrCacheIfCurrent(currentDate, schedules);
      renderAll();
    } catch (err) {
      schedules = prevSchedulesSnapshot;
      syncSwrCacheIfCurrent(currentDate, schedules);
      renderAll();
      showToast(`시간 수정 실패: ${err.message}`, "⚠️");
    }
  }

  /* -------------------- 렌더링 -------------------- */

  function renderAll() {
    applyPrefsToUI();
    renderPresets();
    renderLeftPanel();
    renderTimelineGrid();
    renderEvents();
    renderNowState();
    renderRightWidgets();
  }

  function applyPrefsToUI() {
    document.documentElement.setAttribute("data-theme", prefs.theme);
    document.body.classList.toggle("no-dim-completed", prefs.dimCompleted === false);

    if (el.snapSelect) el.snapSelect.value = String(prefs.snapMin);
    if (el.zoomRange) el.zoomRange.value = String(prefs.pxPerMin);
    if (el.zoomValueLabel) el.zoomValueLabel.textContent = `${Number(prefs.pxPerMin).toFixed(2)}x`;
    if (el.defaultDurationSelect) el.defaultDurationSelect.value = String(getDefaultDurationMin());
    const earlyStartHour = Math.round(getEarlyStartMin() / 60);
    const earlyEndHour = Math.round(getEarlyEndMin() / 60);
    if (el.earlyStartHourSelect) el.earlyStartHourSelect.value = String(earlyStartHour);
    if (el.earlyEndHourSelect) el.earlyEndHourSelect.value = String(earlyEndHour);
    if (el.earlyCollapsedCheck) el.earlyCollapsedCheck.checked = Boolean(prefs.earlyCollapsed);
    if (el.cascadeCheck) el.cascadeCheck.checked = Boolean(prefs.cascadeMode);
    if (el.themeSelect) el.themeSelect.value = prefs.theme;
    if (el.dimCompletedCheck) el.dimCompletedCheck.checked = prefs.dimCompleted !== false;
    if (el.browserNotifyCheck) el.browserNotifyCheck.checked = Boolean(prefs.browserNotify);
    if (el.showPlacedListCheck) el.showPlacedListCheck.checked = prefs.showPlacedList !== false;
    if (el.placedSection) {
      el.placedSection.classList.toggle("hidden", prefs.showPlacedList === false);
      el.placedSection.classList.toggle("is-collapsed", Boolean(prefs.placedCollapsed));
    }
    if (el.placedCollapseBtn) {
      el.placedCollapseBtn.setAttribute("aria-expanded", String(!prefs.placedCollapsed));
    }
    if (el.placedTasksOnlyBtn) el.placedTasksOnlyBtn.classList.toggle("is-active", Boolean(prefs.placedTasksOnly));

    if (el.earlyToggleBtn) {
      el.earlyToggleBtn.classList.toggle("active", prefs.earlyCollapsed);
      el.earlyToggleBtn.textContent = prefs.earlyCollapsed ? "🌙 새벽 접힘" : "☀️ 전체 24h";
      el.earlyToggleBtn.title = `새벽 ${String(earlyStartHour).padStart(2, "0")}:00~${String(earlyEndHour).padStart(2, "0")}:00 접기/펼치기`;
    }

    Object.entries(prefs.widgets || {}).forEach(([key, visible]) => {
      const card = document.getElementById(`widget-${key}`);
      if (card) card.classList.toggle("hidden", !visible);
      const cb = el.settingsWidgetChecks?.querySelector(`input[data-widget="${key}"]`);
      if (cb) cb.checked = Boolean(visible);
    });
  }

  function updateApiBadge() {
    if (supabaseSession) {
      el.apiSourceDot.className = realtimeConnected ? "source-dot agent realtime" : "source-dot agent";
      el.apiSourceLabel.textContent = realtimeConnected ? "실시간 연결" : "계정 연결됨";
    } else {
      el.apiSourceDot.className = "source-dot agent-warn";
      el.apiSourceLabel.textContent = "로그인 필요";
    }
  }

  function renderPresets() {
    el.presetList.innerHTML = "";
    for (const p of prefs.presets) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "preset-pill";
      pill.draggable = true;
      pill.title = "클릭해 빈 시간에 추가하거나 타임라인으로 드래그하세요";
      const durText = p.durationMin > 0 ? `${p.durationMin}m` : "시각만";
      pill.innerHTML = `<span>${escapeHtml(p.icon)}</span><span>${escapeHtml(p.title)}</span><span style="opacity:.62">${durText}</span>`;

      pill.addEventListener("click", async () => {
        const startMin = findNextAvailableSlot(p.durationMin || 30);
        const endMin = p.durationMin > 0 ? Math.min(1440, startMin + p.durationMin) : null;
        try {
          await createScheduleAndRecord(
            {
              date: currentDate,
              start_at: PlannerAPI.kstMinutesToIso(currentDate, startMin),
              end_at: endMin !== null ? PlannerAPI.kstMinutesToIso(currentDate, endMin) : null,
              title: `${p.icon} ${p.title}`,
              type: p.type || "schedule",
              source: "app",
              memo: ""
            },
            `${minToTimeStr(startMin)}에 '${p.title}' 일정을 등록했습니다.`
          );
        } catch (err) {
          showToast(`등록 실패: ${err.message}`, "⚠️");
        }
      });

      pill.addEventListener("dragstart", (e) => {
        activeHtmlDragPayload = {
          kind: "preset",
          title: `${p.icon} ${p.title}`,
          durationMin: p.durationMin || 0,
          type: p.type || "schedule"
        };
        e.dataTransfer.setData("text/plain", JSON.stringify(activeHtmlDragPayload));
      });
      pill.addEventListener("dragend", () => {
        activeHtmlDragPayload = null;
        el.ghostPreview.classList.add("hidden");
      });

      el.presetList.appendChild(pill);
    }
  }

  function animateListReorder(container, buildCardsFn) {
    const prevTops = new Map();
    container.querySelectorAll("[data-id]").forEach((node) => {
      prevTops.set(node.dataset.id, node.getBoundingClientRect().top);
    });

    buildCardsFn();

    const movedCards = [];
    container.querySelectorAll("[data-id]").forEach((node) => {
      const oldTop = prevTops.get(node.dataset.id);
      if (oldTop === undefined) return;
      const newTop = node.getBoundingClientRect().top;
      const deltaY = oldTop - newTop;
      if (Math.abs(deltaY) < 1.5) return;

      node.style.transition = "none";
      node.style.transform = `translateY(${deltaY}px)`;
      node.style.zIndex = deltaY < 0 ? "5" : "2";
      node.style.position = "relative";
      movedCards.push(node);
    });

    if (!movedCards.length) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        movedCards.forEach((node) => {
          node.style.transition = "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease";
          node.style.transform = "translateY(0)";
          const clearInline = () => {
            node.style.transition = "";
            node.style.transform = "";
            node.style.zIndex = "";
            node.style.position = "";
          };
          node.addEventListener("transitionend", clearInline, { once: true });
          setTimeout(clearInline, 420);
        });
      });
    });
  }

  function renderLeftPanel() {
    const sortDoneBottom = (arr) => [
      ...arr.filter((s) => !s.done),
      ...arr.filter((s) => s.done)
    ];

    const untimed = sortDoneBottom(schedules.filter((s) => !s.hasStartAt));
    const reminders = sortDoneBottom(schedules.filter((s) => s.type === "reminder"));

    el.stagedCountBadge.textContent = String(untimed.length);
    el.untimedCount.textContent = String(untimed.length);
    el.reminderSummaryCount.textContent = String(reminders.length);
    if (el.mobileDockBadge) {
      const pendingDockCount = untimed.filter((s) => !s.done).length;
      el.mobileDockBadge.textContent = String(pendingDockCount);
      el.mobileDockBadge.classList.toggle("hidden", pendingDockCount === 0);
    }

    const untimedKey = untimed.map((s) => `${s.id}:${s.done ? 1 : 0}:${s.type}:${s.title}`).join("|");
    if (el.untimedList.dataset.renderKey !== untimedKey) {
      el.untimedList.dataset.renderKey = untimedKey;
      animateListReorder(el.untimedList, () => {
        el.untimedList.innerHTML = "";
        if (!untimed.length) {
          el.untimedList.innerHTML = `<div class="empty-hint">시간 미정 일정이 없습니다.<br/>위에서 추가하거나 타임라인에서 빼오세요.</div>`;
          return;
        }
        for (const item of untimed) {
          const card = document.createElement("div");
          card.className = `dock-card ${item.done ? "is-done" : ""}`;
          card.dataset.id = item.id;
          card.dataset.type = item.type;
          card.draggable = true;

          card.innerHTML = `
            <div class="dock-card-top">
              <input type="checkbox" class="event-check" ${item.done ? "checked" : ""} title="완료 체크" />
              <div class="dock-card-title" title="클릭하여 편집">${escapeHtml(item.title)}</div>
            </div>
            <div class="dock-card-meta">
              <span>${TYPE_META[item.type]?.label || "일정"}</span>
              <div class="dock-card-actions">
                <button type="button" class="mini-btn place-btn" title="빈 시간에 배치">+ 배치</button>
                <button type="button" class="mini-btn del del-btn" title="삭제">✕</button>
              </div>
            </div>
          `;

          card.querySelector(".event-check").addEventListener("change", (e) => {
            toggleScheduleDone(item.id, e.target.checked);
          });

          card.querySelector(".dock-card-title").addEventListener("click", () => {
            openEventModal(item.id);
          });

          card.querySelector(".place-btn").addEventListener("click", async () => {
            const startMin = findNextAvailableSlot(30);
            const endMin = item.type === "reminder" ? null : Math.min(1440, startMin + 30);
            await commitScheduleTimeChange(item, startMin, endMin);
          });

          card.querySelector(".del-btn").addEventListener("click", () => {
            deleteScheduleById(item.id);
          });

          card.addEventListener("dragstart", (e) => {
            activeHtmlDragPayload = {
              kind: "untimed",
              id: item.id,
              title: item.title,
              durationMin: item.type === "reminder" ? 0 : 30,
              type: item.type
            };
            e.dataTransfer.setData("text/plain", JSON.stringify(activeHtmlDragPayload));
          });
          card.addEventListener("dragend", () => {
            activeHtmlDragPayload = null;
            el.ghostPreview.classList.add("hidden");
          });

          el.untimedList.appendChild(card);
        }
      });
    }

    if (el.placedList && el.placedCount) {
      const placedAll = schedules
        .filter((s) => s.hasStartAt)
        .sort((a, b) => a.startMin - b.startMin);
      const placedFiltered = prefs.placedTasksOnly
        ? placedAll.filter((s) => s.type === "task")
        : placedAll;
      el.placedCount.textContent = String(placedFiltered.length);

      if (prefs.showPlacedList !== false) {
        const placedKey =
          (prefs.placedTasksOnly ? "t:" : "a:") +
          placedFiltered
            .map((s) => `${s.id}:${s.done ? 1 : 0}:${s.startMin}:${s.endMin ?? "n"}:${s.type}:${s.title}`)
            .join("|");
        if (el.placedList.dataset.renderKey !== placedKey) {
          el.placedList.dataset.renderKey = placedKey;
          animateListReorder(el.placedList, () => {
            el.placedList.innerHTML = "";
            if (!placedFiltered.length) {
              el.placedList.innerHTML = `<div class="empty-hint">${
                prefs.placedTasksOnly
                  ? "타임라인에 배치된 할 일이 없습니다."
                  : "타임라인에 배치된 일정이 없습니다."
              }</div>`;
              return;
            }
            for (const item of placedFiltered) {
              const card = document.createElement("div");
              card.className = `dock-card is-placed ${item.done ? "is-done" : ""}`;
              card.dataset.id = item.id;
              card.dataset.type = item.type;

              const timeLabel =
                item.hasEndAt && item.endMin !== null
                  ? `${minToTimeStr(item.startMin)}~${minToTimeStr(item.endMin)}`
                  : minToTimeStr(item.startMin);

              card.innerHTML = `
                <div class="dock-card-top">
                  <input type="checkbox" class="event-check" ${item.done ? "checked" : ""} title="완료 체크" />
                  <div class="dock-card-title" title="클릭하여 편집">${escapeHtml(item.title)}</div>
                </div>
                <div class="dock-card-meta">
                  <span><span class="placed-time-badge">${escapeHtml(timeLabel)}</span> · ${TYPE_META[item.type]?.label || "일정"}</span>
                  <div class="dock-card-actions">
                    <button type="button" class="mini-btn jump-btn" title="타임라인에서 보기">📍</button>
                    <button type="button" class="mini-btn unplace-btn" title="미배치 목록으로 옮기기">↩️</button>
                  </div>
                </div>
              `;

              card.querySelector(".event-check").addEventListener("change", (e) => {
                toggleScheduleDone(item.id, e.target.checked);
              });

              card.querySelector(".dock-card-title").addEventListener("click", () => {
                openEventModal(item.id);
              });

              card.querySelector(".jump-btn").addEventListener("click", () => {
                if (el.appShell && window.matchMedia("(max-width: 1024px)").matches) {
                  el.appShell.setAttribute("data-mobile-tab", "timeline");
                }
                jumpToSchedule(item);
              });

              card.querySelector(".unplace-btn").addEventListener("click", async () => {
                await commitScheduleTimeChange(item, null, null);
                showToast("미배치 목록으로 옮겼습니다.", "📥");
              });

              el.placedList.appendChild(card);
            }
          });
        }
      }
    }

    const remindersKey = reminders
      .map((s) => `${s.id}:${s.done ? 1 : 0}:${s.hasStartAt ? s.startMin : "n"}:${s.title}`)
      .join("|");
    if (el.reminderHighlightList.dataset.renderKey !== remindersKey) {
      el.reminderHighlightList.dataset.renderKey = remindersKey;
      animateListReorder(el.reminderHighlightList, () => {
        el.reminderHighlightList.innerHTML = "";
        if (!reminders.length) {
          el.reminderHighlightList.innerHTML = `<div class="empty-hint">등록된 알림 일정이 없습니다.</div>`;
          return;
        }
        for (const rem of reminders) {
          const card = document.createElement("div");
          card.className = `reminder-pill-card ${rem.done ? "is-done" : ""}`;
          card.dataset.id = rem.id;
          card.innerHTML = `
            <input type="checkbox" class="event-check" ${rem.done ? "checked" : ""} title="완료 체크" />
            <span class="reminder-pill-time">${rem.hasStartAt ? minToTimeStr(rem.startMin) : "미정"}</span>
            <span class="reminder-pill-title" title="${escapeAttr(rem.title)}">${escapeHtml(rem.title)}</span>
          `;

          card.querySelector(".event-check").addEventListener("click", (e) => e.stopPropagation());
          card.querySelector(".event-check").addEventListener("change", (e) => {
            toggleScheduleDone(rem.id, e.target.checked);
          });

          card.querySelector(".reminder-pill-title").addEventListener("click", (e) => {
            e.stopPropagation();
            openEventModal(rem.id);
          });

          card.addEventListener("click", () => {
            if (rem.hasStartAt) {
              el.timelineScroll.scrollTo({
                top: Math.max(0, minToY(rem.startMin) - 80),
                behavior: "smooth"
              });
              selectedEventId = rem.id;
              renderEvents();
            } else {
              openEventModal(rem.id);
            }
          });

          el.reminderHighlightList.appendChild(card);
        }
      });
    }
  }

  function renderTimelineGrid() {
    const totalH = getTimelineTotalHeight();
    el.timelineGrid.style.height = `${totalH}px`;
    el.hourRowsLayer.innerHTML = "";

    const earlyStartMin = getEarlyStartMin();
    const earlyEndMin = getEarlyEndMin();
    const earlyStartHour = Math.round(earlyStartMin / 60);
    const earlyEndHour = Math.round(earlyEndMin / 60);
    const earlyStartLabel = `${String(earlyStartHour).padStart(2, "0")}:00`;
    const earlyEndLabel = `${String(earlyEndHour).padStart(2, "0")}:00`;
    const hourPx = 60 * prefs.pxPerMin;

    const appendHourRow = (h) => {
      const row = document.createElement("div");
      row.className = "hour-row";
      row.style.height = `${hourPx}px`;
      row.innerHTML = `<span class="hour-label">${String(h).padStart(2, "0")}:00</span>`;
      el.hourRowsLayer.appendChild(row);
    };

    for (let h = earlyEndHour; h < 24; h++) {
      appendHourRow(h);
    }

    if (prefs.earlyCollapsed) {
      for (let h = 0; h < earlyStartHour; h++) {
        appendHourRow(h);
      }

      const earlyCount = schedules.filter(
        (e) =>
          e.hasStartAt &&
          (e.type === "reminder"
            ? e.startMin >= earlyStartMin && e.startMin < earlyEndMin
            : e.visualEndMin > earlyStartMin && e.startMin < earlyEndMin)
      ).length;
      const banner = document.createElement("div");
      banner.className = "early-collapsed-banner";
      banner.style.height = `${COLLAPSED_EARLY_HEIGHT}px`;
      banner.innerHTML = `<span>🌙 새벽 ${earlyStartLabel} ~ ${earlyEndLabel} 접힘 (클릭해 펼치기${earlyCount ? ` · 일정 ${earlyCount}개` : ""})</span>`;
      banner.addEventListener("click", () => {
        prefs.earlyCollapsed = false;
        PlannerAPI.savePrefs(prefs);
        renderAll();
      });
      el.hourRowsLayer.appendChild(banner);
    } else {
      for (let h = 0; h < earlyEndHour; h++) {
        appendHourRow(h);
      }
    }
  }

  function renderEvents() {
    el.eventsLayer.innerHTML = "";
    const earlyStartMin = getEarlyStartMin();
    const earlyEndMin = getEarlyEndMin();

    const timedEvents = schedules.filter((ev) => {
      if (!ev.hasStartAt) return false;
      if (prefs.earlyCollapsed) {
        if (ev.type === "reminder") {
          if (ev.startMin >= earlyStartMin && ev.startMin < earlyEndMin) return false;
        } else if (ev.startMin >= earlyStartMin && ev.visualEndMin <= earlyEndMin) {
          return false;
        }
      }
      return true;
    });

    const blockEvents = timedEvents.filter((ev) => ev.type !== "reminder");
    const reminderEvents = timedEvents
      .filter((ev) => ev.type === "reminder")
      .sort((a, b) => a.startMin - b.startMin);

    const cols = computeEventColumns(blockEvents);

    for (const ev of blockEvents) {
      const visualStart =
        prefs.earlyCollapsed && ev.startMin >= earlyStartMin && ev.startMin < earlyEndMin
          ? earlyEndMin
          : ev.startMin;
      const visualEnd =
        ev.startMin < earlyEndMin && ev.visualEndMin > earlyEndMin ? earlyEndMin : ev.visualEndMin;
      const top = minToY(visualStart);
      const bottom = endMinToY(visualEnd, visualStart);
      const height = Math.max(26, bottom - top);
      const isCompact = height < 40;

      const layout = cols.get(ev.id) || { col: 0, totalCols: 1 };
      const widthPct = 100 / layout.totalCols;
      const leftPct = layout.col * widthPct;

      const { isNow, isPast } = getEventTimeState(ev);
      const isFilteredOut = activeTypeFilter !== "all" && ev.type !== activeTypeFilter;

      const block = document.createElement("div");
      block.className = [
        "event-block",
        `type-${ev.type}`,
        isCompact ? "is-compact" : "",
        ev.visualEndMin >= 1380 ? "is-near-bottom" : "",
        isNow ? "is-now" : "",
        isPast ? "is-past" : "",
        ev.done ? "is-done" : "",
        ev.id === selectedEventId ? "is-selected" : "",
        isFilteredOut ? "is-filtered-out" : ""
      ]
        .filter(Boolean)
        .join(" ");

      block.dataset.id = ev.id;
      block.style.top = `${top}px`;
      block.style.height = `${height - 2}px`;
      block.style.left = `calc(${leftPct}% + 2px)`;
      block.style.width = `calc(${widthPct}% - 4px)`;

      const timeText = formatEventTimeLabel(ev);
      const reminderBadge =
        ev.type === "reminder"
          ? `<span class="badge-reminder">🔔 ${minToTimeStr(ev.startMin)}</span>`
          : "";
      const typeBadge =
        ev.type === "task" ? `<span class="badge-type">할 일</span>` : "";
      const srcBadge =
        ev.source === "muse" ? `<span class="badge-src is-muse">Muse</span>` : "";
      const routineBadge =
        ev.template_id ? `<span class="badge-routine" title="반복 루틴에서 자동 생성됨">🔁</span>` : "";

      block.innerHTML = `
        <div class="resize-handle top" title="위로 끌어 시작 시각 조절"></div>
        <div class="event-top-row">
          <input type="checkbox" class="event-check" ${ev.done ? "checked" : ""} title="완료 체크" />
          <span class="event-title">${escapeHtml(ev.title)}</span>
          <div class="event-badges">
            ${isNow ? `<span class="badge-now">NOW</span>` : ""}
            ${routineBadge}
            ${reminderBadge}
            ${typeBadge}
            ${srcBadge}
          </div>
        </div>
        <div class="event-sub-row">
          <span class="event-time-text">${escapeHtml(timeText)}</span>
        </div>
        <div class="event-quick-actions">
          <button type="button" class="q-btn" data-act="minus15" title="15분 줄이기">-15m</button>
          <button type="button" class="q-btn" data-act="plus15" title="15분 늘리기">+15m</button>
          <button type="button" class="q-btn q-icon" data-act="edit" title="편집" aria-label="일정 편집">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button type="button" class="q-btn q-icon del" data-act="delete" title="삭제" aria-label="일정 삭제">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
          </button>
        </div>
        <div class="resize-handle bottom" title="아래로 끌어 종료 시각 조절"></div>
      `;

      block.querySelector(".event-check").addEventListener("pointerdown", (e) => e.stopPropagation());
      block.querySelector(".event-check").addEventListener("change", (e) => {
        e.stopPropagation();
        toggleScheduleDone(ev.id, e.target.checked);
      });

      block.querySelectorAll(".q-btn").forEach((btn) => {
        btn.addEventListener("pointerdown", (e) => e.stopPropagation());
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          handleQuickAction(ev.id, btn.dataset.act);
        });
      });

      block.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openEventModal(ev.id);
      });

      bindEventPointerInteractions(block, ev);
      el.eventsLayer.appendChild(block);
    }

    // 알림(reminder)은 블록이 아닌 독립 오버레이 마커 라인으로 렌더링
    let prevRemTop = -999;
    let staggerCol = 0;
    for (const rem of reminderEvents) {
      const top = minToY(rem.startMin);
      if (Math.abs(top - prevRemTop) < 24) {
        staggerCol = (staggerCol + 1) % 2;
      } else {
        staggerCol = 0;
      }
      prevRemTop = top;
      renderReminderMarker(rem, top, staggerCol);
    }
  }

  function renderReminderMarker(ev, top, staggerCol = 0) {
    const { isNow, isPast } = getEventTimeState(ev);
    const isFilteredOut = activeTypeFilter !== "all" && ev.type !== activeTypeFilter;

    const marker = document.createElement("div");
    marker.className = [
      "reminder-line-marker",
      isNow ? "is-now" : "",
      isPast ? "is-past" : "",
      ev.done ? "is-done" : "",
      isFilteredOut ? "is-filtered-out" : ""
    ]
      .filter(Boolean)
      .join(" ");
    marker.dataset.id = ev.id;
    marker.style.top = `${top}px`;

    const pill = document.createElement("div");
    pill.className = "reminder-marker-pill";
    if (staggerCol > 0) {
      pill.style.marginRight = `${staggerCol * 148}px`;
    }
    pill.innerHTML = `
      <input type="checkbox" class="event-check" ${ev.done ? "checked" : ""} title="완료 체크" />
      <span class="reminder-marker-time">🔔 ${minToTimeStr(ev.startMin)}</span>
      <span class="reminder-marker-title">${escapeHtml(ev.title)}</span>
      <button type="button" class="reminder-marker-del" title="삭제" aria-label="알림 삭제">✕</button>
    `;

    const line = document.createElement("div");
    line.className = "reminder-marker-line";

    marker.appendChild(line);
    marker.appendChild(pill);

    pill.querySelector(".event-check").addEventListener("pointerdown", (e) => e.stopPropagation());
    pill.querySelector(".event-check").addEventListener("change", (e) => {
      e.stopPropagation();
      toggleScheduleDone(ev.id, e.target.checked);
    });

    pill.querySelector(".reminder-marker-del").addEventListener("pointerdown", (e) => e.stopPropagation());
    pill.querySelector(".reminder-marker-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteScheduleById(ev.id);
    });

    bindReminderMarkerInteractions(marker, pill, ev);
    el.eventsLayer.appendChild(marker);
  }

  function syncDockDragState(sourceEl, ghostRef, ev, clientX, clientY) {
    const timelineRect = el.timelineScroll?.getBoundingClientRect();
    const dockRect = el.stagingDock?.getBoundingClientRect();
    const isOverDock = Boolean(
      dockRect &&
        dockRect.width > 0 &&
        dockRect.height > 0 &&
        clientX >= dockRect.left &&
        clientX <= dockRect.right &&
        clientY >= dockRect.top &&
        clientY <= dockRect.bottom
    );
    const isLeavingTimeline = Boolean(
      isOverDock || (timelineRect && dockRect && dockRect.width > 0 && clientX < timelineRect.left)
    );

    el.stagingDock?.classList.toggle("drop-active", isOverDock);
    sourceEl?.classList.toggle("is-unscheduling", isLeavingTimeline);

    if (isLeavingTimeline) {
      if (!ghostRef.current) {
        const ghost = document.createElement("div");
        ghost.className = "dock-drag-ghost";
        ghost.innerHTML = `<span class="dock-ghost-icon">📥</span><span class="dock-ghost-title">${escapeHtml(ev.title)}</span><span class="dock-ghost-sub">시간 미정으로</span>`;
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
      }
      ghostRef.current.style.left = `${clientX}px`;
      ghostRef.current.style.top = `${clientY}px`;
      ghostRef.current.classList.toggle("is-over-dock", isOverDock);
    } else if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }

    return { isOverDock, isLeavingTimeline };
  }

  function clearDockDragState(sourceEl, ghostRef) {
    if (ghostRef?.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    sourceEl?.classList.remove("is-unscheduling");
    el.stagingDock?.classList.remove("drop-active");
  }

  function bindReminderMarkerInteractions(marker, pill, ev) {
    pill.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, button")) return;
      e.stopPropagation();
    });
    pill.addEventListener("click", (e) => {
      if (e.target.closest("input, button")) return;
      e.stopPropagation();
      openEventModal(ev.id);
    });
  }

  async function handleQuickAction(eventId, action) {
    const ev = schedules.find((e) => e.id === eventId);
    if (!ev) return;

    if (action === "edit") {
      openEventModal(eventId);
      return;
    }
    if (action === "delete") {
      await deleteScheduleById(eventId);
      return;
    }

    if (!ev.hasStartAt) return;
    if (action === "minus15") {
      const baseEnd = ev.hasEndAt && ev.endMin !== null ? ev.endMin : ev.startMin + 30;
      const nextEnd = Math.max(ev.startMin + 15, baseEnd - 15);
      await commitScheduleTimeChange(ev, ev.startMin, nextEnd);
    } else if (action === "plus15") {
      const baseEnd = ev.hasEndAt && ev.endMin !== null ? ev.endMin : ev.startMin + 15;
      const nextEnd = Math.min(1440, baseEnd + 15);
      await commitScheduleTimeChange(ev, ev.startMin, nextEnd);
    } else if (action === "plus30") {
      const baseEnd = ev.hasEndAt && ev.endMin !== null ? ev.endMin : ev.startMin + 15;
      const nextEnd = Math.min(1440, baseEnd + 30);
      await commitScheduleTimeChange(ev, ev.startMin, nextEnd);
    }
  }

  /* -------------------- 60fps 포인터 드래그 & 상하 리사이즈 -------------------- */

  function selectEventBlock(eventId) {
    if (eventId) clearTouchDraftSlot();
    selectedEventId = eventId;
    if (!el.eventsLayer) return;
    el.eventsLayer.querySelectorAll(".event-block").forEach((node) => {
      node.classList.toggle("is-selected", Boolean(eventId) && node.dataset.id === eventId);
    });
  }

  function renderTouchDraftSlot() {
    if (!el.ghostPreview) return;
    if (!touchDraftSlot) {
      el.ghostPreview.classList.remove("is-touch-draft");
      el.ghostPreview.classList.add("hidden");
      el.ghostPreview.innerHTML = "";
      return;
    }

    const { startMin, endMin } = touchDraftSlot;
    const earlyStartMin = getEarlyStartMin();
    const earlyEndMin = getEarlyEndMin();
    const visualStart =
      prefs.earlyCollapsed && startMin >= earlyStartMin && startMin < earlyEndMin ? earlyEndMin : startMin;
    const top = minToY(visualStart);
    const h = Math.max(30, endMinToY(endMin, visualStart) - top);

    el.ghostPreview.style.top = `${top}px`;
    el.ghostPreview.style.height = `${h}px`;
    el.ghostPreview.classList.add("is-touch-draft");
    el.ghostPreview.classList.remove("hidden");
    el.ghostPreview.innerHTML = `
      <div class="ghost-draft-header">
        <span class="ghost-draft-label">+ ${minToTimeStr(startMin)} ~ ${minToTimeStr(endMin)} (${endMin - startMin}분)</span>
        <button type="button" class="ghost-draft-close" aria-label="선택 취소">✕</button>
      </div>
      ${h >= 46 ? '<div class="ghost-draft-hint">탭하여 등록 · 위아래로 끌어 시간 조절</div>' : ""}
      <div class="ghost-draft-handle" aria-hidden="true"></div>
    `;
  }

  function clearTouchDraftSlot() {
    if (!touchDraftSlot) return;
    touchDraftSlot = null;
    renderTouchDraftSlot();
  }

  function bindEventPointerInteractions(block, ev) {
    const topHandle = block.querySelector(".resize-handle.top");
    const bottomHandle = block.querySelector(".resize-handle.bottom");

    const startPointerOp = (mode, downEvent) => {
      if (downEvent.button !== 0 && downEvent.pointerType !== "touch") return;
      if (downEvent.target.closest("input, button")) return;

      const isTouch = downEvent.pointerType === "touch";
      const isAlreadySelected = selectedEventId === ev.id;

      // 터치 환경: 선택되지 않은 일정은 이동/리사이즈 불가 (단일 탭으로만 선택/핸들 활성화)
      if (isTouch && !isAlreadySelected) {
        if (mode !== "move") return;

        const tapStartX = downEvent.clientX;
        const tapStartY = downEvent.clientY;
        let movedByScroll = false;

        const cleanupTap = () => {
          window.removeEventListener("pointermove", onTapMove);
          window.removeEventListener("pointerup", onTapUp);
          window.removeEventListener("pointercancel", cleanupTap);
        };

        const onTapMove = (mv) => {
          if (Math.abs(mv.clientY - tapStartY) > 8 || Math.abs(mv.clientX - tapStartX) > 8) {
            movedByScroll = true;
            cleanupTap();
          }
        };

        const onTapUp = () => {
          cleanupTap();
          if (!movedByScroll) {
            selectEventBlock(ev.id);
          }
        };

        window.addEventListener("pointermove", onTapMove);
        window.addEventListener("pointerup", onTapUp);
        window.addEventListener("pointercancel", cleanupTap);
        return;
      }

      downEvent.stopPropagation();

      const startClientX = downEvent.clientX;
      const startClientY = downEvent.clientY;
      const origStart = ev.startMin;
      const origHasEnd = ev.hasEndAt && ev.endMin !== null;
      const origVisualDur = ev.visualEndMin - ev.startMin;
      const origRealDur = origHasEnd ? ev.endMin - ev.startMin : null;

      let hasMoved = false;
      let previewStart = origStart;
      let previewVisualEnd = ev.visualEndMin;
      let previewHasEnd = origHasEnd;
      let droppingToDock = false;
      const dockGhostRef = { current: null };

      activePointerDrag = true;
      selectedEventId = ev.id;

      const timeSpan = block.querySelector(".event-time-text");

      const cleanupListeners = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };

      const onMove = (moveEvent) => {
        const dy = moveEvent.clientY - startClientY;
        const dx = Math.abs(moveEvent.clientX - startClientX);

        if (!hasMoved && Math.abs(dy) < 4 && dx < 4) return;
        hasMoved = true;
        block.classList.add("is-dragging");

        const deltaMin = snap(dy / prefs.pxPerMin);
        const earlyStartMin = getEarlyStartMin();
        const earlyEndMin = getEarlyEndMin();
        const minBound = getTimelineMinBound();

        if (mode === "move") {
          const { isOverDock, isLeavingTimeline } = syncDockDragState(
            block,
            dockGhostRef,
            ev,
            moveEvent.clientX,
            moveEvent.clientY
          );
          droppingToDock = isOverDock;

          if (isLeavingTimeline) {
            previewStart = origStart;
            previewVisualEnd = ev.visualEndMin;
          } else {
            const origD = toDisplayMin(origStart);
            const nextD = clamp(origD + deltaMin, 0, 1440 - origVisualDur);
            const rawStart = fromDisplayMin(nextD);
            if (rawStart >= earlyEndMin && rawStart + origVisualDur > 1440) {
              previewStart = 1440 - origVisualDur;
            } else if (rawStart < earlyEndMin && rawStart + origVisualDur > earlyEndMin) {
              previewStart = earlyEndMin - origVisualDur;
            } else {
              previewStart = rawStart;
            }
            previewVisualEnd = previewStart + origVisualDur;
          }
        } else if (mode === "resize-bottom") {
          const baseEnd = origHasEnd ? ev.endMin : origStart + 15;
          const maxEnd = origStart < earlyEndMin ? earlyEndMin : 1440;
          previewVisualEnd = clamp(baseEnd + deltaMin, origStart + (prefs.snapMin || 15), maxEnd);
          previewHasEnd = true;
        } else if (mode === "resize-top") {
          const ceiling = origHasEnd ? ev.endMin : origStart + 30;
          const localMinBound = origStart >= earlyEndMin ? earlyEndMin : minBound;
          previewStart = clamp(origStart + deltaMin, localMinBound, ceiling - (prefs.snapMin || 15));
          previewVisualEnd = ceiling;
        }

        const visualStart =
          prefs.earlyCollapsed && previewStart >= earlyStartMin && previewStart < earlyEndMin
            ? earlyEndMin
            : previewStart;
        const top = minToY(visualStart);
        const height = Math.max(26, endMinToY(previewVisualEnd, visualStart) - top);
        block.style.top = `${top}px`;
        block.style.height = `${height - 2}px`;
        if (timeSpan) {
          timeSpan.textContent = previewHasEnd
            ? `${minToTimeStr(previewStart)} - ${minToTimeStr(previewVisualEnd)} (${previewVisualEnd - previewStart}분)`
            : minToTimeStr(previewStart);
        }
      };

      const onCancel = () => {
        activePointerDrag = false;
        cleanupListeners();
        block.classList.remove("is-dragging");
        clearDockDragState(block, dockGhostRef);
        if (hasMoved) renderEvents();
      };

      const onUp = async () => {
        activePointerDrag = false;
        cleanupListeners();
        block.classList.remove("is-dragging");
        clearDockDragState(block, dockGhostRef);

        if (!hasMoved) {
          if (isTouch && mode === "move") {
            openEventModal(ev.id);
          } else {
            renderEvents();
          }
          return;
        }

        if (droppingToDock) {
          await commitScheduleTimeChange(ev, null, null, {
            customStartIso: null,
            customEndIso: null
          });
          showToast("시간 미정 목록으로 옮겼습니다.", "📥");
          return;
        }

        const finalEndOrNull = previewHasEnd
          ? mode === "move" && origRealDur !== null
            ? previewStart + origRealDur
            : previewVisualEnd
          : null;

        const changed =
          previewStart !== origStart ||
          previewHasEnd !== origHasEnd ||
          (origHasEnd && finalEndOrNull !== ev.endMin);

        if (changed) {
          await commitScheduleTimeChange(ev, previewStart, finalEndOrNull);
        } else {
          renderEvents();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };

    topHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-top", e));
    bottomHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-bottom", e));
    block.addEventListener("pointerdown", (e) => startPointerOp("move", e));
  }

  /* -------------------- 빈 타임라인 드래그 생성 & 카드 드롭 -------------------- */

  function bindTimelineCreationAndDrop() {
    el.hourRowsLayer.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".early-collapsed-banner")) return;

      // 터치 환경: 스크롤과 구분해 1차 탭으로 점선 박스(touchDraftSlot) 표시
      if (e.pointerType === "touch") {
        const tapStartX = e.clientX;
        const tapStartY = e.clientY;
        let movedByScroll = false;

        const cleanupTap = () => {
          window.removeEventListener("pointermove", onTapMove);
          window.removeEventListener("pointerup", onTapUp);
          window.removeEventListener("pointercancel", cleanupTap);
        };

        const onTapMove = (mv) => {
          if (Math.abs(mv.clientY - tapStartY) > 8 || Math.abs(mv.clientX - tapStartX) > 8) {
            movedByScroll = true;
            cleanupTap();
          }
        };

        const onTapUp = () => {
          cleanupTap();
          if (movedByScroll) return;

          if (selectedEventId) {
            selectEventBlock(null);
            return;
          }
          if (touchDraftSlot) {
            clearTouchDraftSlot();
            return;
          }

          const gridRect = el.timelineGrid.getBoundingClientRect();
          const y = tapStartY - gridRect.top;
          const earlyEndMin = getEarlyEndMin();
          const defaultSpan = getDefaultDurationMin();
          const rawAnchor = snap(yToMin(y));
          const zoneMin = rawAnchor < earlyEndMin ? 0 : earlyEndMin;
          const zoneMax = rawAnchor < earlyEndMin ? earlyEndMin : 1440;
          const anchorMin = clamp(rawAnchor, zoneMin, zoneMax - Math.max(15, defaultSpan));
          const endMin = Math.min(zoneMax, anchorMin + defaultSpan);
          touchDraftSlot = { startMin: anchorMin, endMin };
          renderTouchDraftSlot();
        };

        window.addEventListener("pointermove", onTapMove);
        window.addEventListener("pointerup", onTapUp);
        window.addEventListener("pointercancel", cleanupTap);
        return;
      }

      if (e.button !== 0) return;

      const gridRect = el.timelineGrid.getBoundingClientRect();
      const startY = e.clientY - gridRect.top;
      const earlyEndMin = getEarlyEndMin();
      const rawAnchor = snap(yToMin(startY));
      const zoneMin = rawAnchor < earlyEndMin ? 0 : earlyEndMin;
      const zoneMax = rawAnchor < earlyEndMin ? earlyEndMin : 1440;
      const anchorMin = clamp(rawAnchor, zoneMin, Math.max(zoneMin, zoneMax - 15));
      const step = prefs.snapMin || 15;
      let curEndMin = Math.min(zoneMax, anchorMin + Math.max(30, step));
      let curStartMin = anchorMin;
      let dragged = false;

      const updateGhost = () => {
        const top = minToY(curStartMin);
        const h = Math.max(22, endMinToY(curEndMin, curStartMin) - top);
        el.ghostPreview.classList.remove("is-touch-draft");
        el.ghostPreview.style.top = `${top}px`;
        el.ghostPreview.style.height = `${h}px`;
        el.ghostPreview.textContent = `+ 새 일정: ${minToTimeStr(curStartMin)} ~ ${minToTimeStr(curEndMin)} (${curEndMin - curStartMin}분)`;
        el.ghostPreview.classList.remove("hidden");
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        el.ghostPreview.classList.add("hidden");
      };

      const onMove = (mv) => {
        if (Math.abs(mv.clientY - e.clientY) > 6) dragged = true;
        if (!dragged) return;
        const y = mv.clientY - el.timelineGrid.getBoundingClientRect().top;
        const hoveredMin = clamp(snap(yToMin(y)), zoneMin, zoneMax);
        curStartMin = Math.min(anchorMin, hoveredMin);
        curEndMin = clamp(Math.max(anchorMin, hoveredMin) + step, curStartMin + step, zoneMax);
        updateGhost();
      };

      const onCancel = () => {
        cleanup();
      };

      const onUp = () => {
        cleanup();

        if (!dragged) {
          curStartMin = anchorMin;
          curEndMin = Math.min(zoneMax, anchorMin + getDefaultDurationMin());
        }
        openNewEventModal(curStartMin, curEndMin);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    });

    // 모바일/터치 점선 박스(touchDraftSlot): 다시 터치해 끌면 시간 늘리기, 그냥 탭하면 일정 생성 모달 열기
    el.ghostPreview.addEventListener("pointerdown", (e) => {
      if (!touchDraftSlot) return;
      e.stopPropagation();

      if (e.target.closest(".ghost-draft-close")) {
        clearTouchDraftSlot();
        return;
      }

      const startY = e.clientY;
      const origStart = touchDraftSlot.startMin;
      const origEnd = touchDraftSlot.endMin;
      const step = prefs.snapMin || 15;
      const minBound = getTimelineMinBound();

      const cleanupDraft = () => {
        window.removeEventListener("pointermove", onDraftMove);
        window.removeEventListener("pointerup", onDraftUp);
        window.removeEventListener("pointercancel", onDraftCancel);
      };

      const onDraftMove = (mv) => {
        if (!touchDraftSlot) return;
        const dy = mv.clientY - startY;
        const deltaMin = snap(dy / prefs.pxPerMin);
        if (deltaMin >= 0) {
          touchDraftSlot.startMin = origStart;
          touchDraftSlot.endMin = clamp(origEnd + deltaMin, origStart + step, 1440);
        } else {
          touchDraftSlot.startMin = clamp(origStart + deltaMin, minBound, origEnd - step);
          touchDraftSlot.endMin = origEnd;
        }
        renderTouchDraftSlot();
      };

      const onDraftCancel = () => {
        cleanupDraft();
      };

      const onDraftUp = () => {
        cleanupDraft();
        if (!touchDraftSlot) return;
        const { startMin, endMin } = touchDraftSlot;
        clearTouchDraftSlot();
        openNewEventModal(startMin, endMin);
      };

      window.addEventListener("pointermove", onDraftMove);
      window.addEventListener("pointerup", onDraftUp);
      window.addEventListener("pointercancel", onDraftCancel);
    });

    el.hourRowsLayer.addEventListener("click", (e) => {
      if (e.target.closest(".early-collapsed-banner")) return;
      if (selectedEventId) {
        selectEventBlock(null);
      }
    });

    el.timelineScroll.addEventListener("dragover", (e) => {
      if (!activeHtmlDragPayload) return;
      e.preventDefault();
      const span = Math.max(15, activeHtmlDragPayload.durationMin || getDefaultDurationMin());
      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(snap(yToMin(y)), getTimelineMinBound(), 1440 - span);
      const dropEnd = dropStart + span;
      const top = minToY(dropStart);
      const h = Math.max(24, minToY(dropEnd) - top);

      el.ghostPreview.style.top = `${top}px`;
      el.ghostPreview.style.height = `${h}px`;
      el.ghostPreview.textContent =
        activeHtmlDragPayload.durationMin > 0
          ? `📥 ${activeHtmlDragPayload.title} (${minToTimeStr(dropStart)} ~ ${minToTimeStr(dropEnd)})`
          : `🔔 ${activeHtmlDragPayload.title} (${minToTimeStr(dropStart)})`;
      el.ghostPreview.classList.remove("hidden");
    });

    el.timelineScroll.addEventListener("dragleave", (e) => {
      if (!el.timelineScroll.contains(e.relatedTarget)) {
        el.ghostPreview.classList.add("hidden");
      }
    });

    el.timelineScroll.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.ghostPreview.classList.add("hidden");
      let payload = activeHtmlDragPayload;
      if (!payload) {
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
      }
      if (!payload) return;
      activeHtmlDragPayload = null;

      const span = Math.max(15, payload.durationMin || getDefaultDurationMin());
      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(snap(yToMin(y)), getTimelineMinBound(), 1440 - span);
      const dropEnd = payload.durationMin > 0 ? Math.min(1440, dropStart + payload.durationMin) : null;

      try {
        if (payload.kind === "untimed") {
          const item = schedules.find((s) => s.id === payload.id);
          if (item) await commitScheduleTimeChange(item, dropStart, dropEnd);
        } else if (payload.kind === "youtube") {
          await createScheduleAndRecord(
            {
              date: currentDate,
              start_at: PlannerAPI.kstMinutesToIso(currentDate, dropStart),
              end_at: PlannerAPI.kstMinutesToIso(currentDate, Math.min(1440, dropStart + (payload.durationMin || 30))),
              title: payload.title,
              type: "schedule",
              source: "app",
              memo: payload.url || ""
            },
            `${minToTimeStr(dropStart)}에 유튜브 시청 일정을 등록했습니다.`
          );
        } else if (payload.kind === "preset") {
          await createScheduleAndRecord({
            date: currentDate,
            start_at: PlannerAPI.kstMinutesToIso(currentDate, dropStart),
            end_at: dropEnd !== null ? PlannerAPI.kstMinutesToIso(currentDate, dropEnd) : null,
            title: payload.title,
            type: payload.type || "schedule",
            source: "app",
            memo: ""
          });
        }
      } catch (err) {
        showToast(`배치 실패: ${err.message}`);
      }
    });
  }

  /* -------------------- 현재 시각 NOW Line & Dynamic Island -------------------- */

  const ISLAND_RING_CIRCUMFERENCE = 2 * Math.PI * 7.5;

  function jumpToSchedule(ev) {
    switchMobileTab("timeline");
    setIslandExpanded(false);
    if (!ev || !ev.hasStartAt) {
      scrollToOptimalPosition(true);
      return;
    }
    selectedEventId = ev.id;
    renderEvents();
    scrollTimelineToY(minToY(ev.startMin) - 80, true);
  }

  async function startScheduleNow(ev) {
    if (!ev) return;
    const nowMin = clamp(getNowKstMinutes(), getTimelineMinBound(), 1425);
    const dur = ev.hasEndAt && ev.endMin !== null ? Math.max(15, ev.endMin - ev.startMin) : getDefaultDurationMin();
    const nextEnd = Math.min(1440, nowMin + dur);
    await commitScheduleTimeChange(ev, nowMin, nextEnd);
    showToast(`'${ev.title}' 일정을 지금 바로 시작합니다!`, "▶");
  }

  function updateIslandRing(pct, strokeColor) {
    if (!el.islandRingFg) return;
    const clamped = clamp(pct, 0, 100);
    el.islandRingFg.style.stroke = strokeColor;
    el.islandRingFg.style.strokeDashoffset = String(ISLAND_RING_CIRCUMFERENCE * (1 - clamped / 100));
  }

  function alignDynamicIsland() {
    if (!el.nowBanner || !el.islandExpanded) return;
    const bannerRect = el.nowBanner.getBoundingClientRect();
    const panelW = Math.min(420, window.innerWidth - 24);
    const desiredLeft = bannerRect.left + bannerRect.width / 2 - panelW / 2;
    const clampedLeft = clamp(desiredLeft, 12, Math.max(12, window.innerWidth - panelW - 12));
    const offsetPx = clampedLeft - desiredLeft;
    el.nowBanner.style.setProperty("--island-offset-x", `${Math.round(offsetPx)}px`);
  }

  function setIslandExpanded(expanded) {
    if (!el.nowBanner) return;
    if (islandCollapseTimer) {
      clearTimeout(islandCollapseTimer);
      islandCollapseTimer = null;
    }
    if (expanded) {
      alignDynamicIsland();
      el.nowBanner.classList.add("is-expanded");
      islandCollapseTimer = setTimeout(() => {
        setIslandExpanded(false);
      }, ISLAND_AUTO_COLLAPSE_MS);
    } else {
      el.nowBanner.classList.remove("is-expanded");
      if (el.nowBanner.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
  }

  function renderNowState() {
    const nowMin = getNowKstMinutes();
    const isToday = isViewingToday();
    lastNowRenderMin = nowMin;

    if (isToday) {
      el.nowLine.classList.remove("hidden");
      el.nowLine.style.top = `${minToY(nowMin)}px`;
      el.nowLineBadge.textContent = minToTimeStr(nowMin);
    } else {
      el.nowLine.classList.add("hidden");
    }

    const activeEv = isToday
      ? schedules.find((e) => {
          if (!e.hasStartAt || e.done) return false;
          const end = e.hasEndAt && e.endMin !== null ? e.endMin : e.startMin + 30;
          return e.startMin <= nowMin && nowMin < end;
        })
      : null;

    const nextEv = isToday
      ? schedules
          .filter((e) => e.hasStartAt && !e.done && e.startMin > nowMin)
          .sort((a, b) => a.startMin - b.startMin)[0]
      : null;

    const focusEv = activeEv || nextEv;

    if (activeEv) {
      const activeEnd = activeEv.hasEndAt && activeEv.endMin !== null ? activeEv.endMin : activeEv.startMin + 30;
      const total = Math.max(1, activeEnd - activeEv.startMin);
      const elapsed = clamp(nowMin - activeEv.startMin, 0, total);
      const pct = Math.round((elapsed / total) * 100);
      const remain = Math.max(0, activeEnd - nowMin);

      el.nowBanner.classList.add("is-active");
      el.nowBannerLabel.textContent = activeEv.type === "reminder" ? "ALERT" : "NOW";
      el.nowEventTitle.textContent = activeEv.title;
      el.nowRemaining.textContent = `${remain}분 남음`;
      updateIslandRing(pct, activeEv.type === "reminder" ? "#f59e0b" : "#ef4444");

      el.islandTypeBadge.textContent = TYPE_META[activeEv.type]?.badge || "일정";
      el.nowEventTime.textContent = activeEv.hasEndAt
        ? `${minToTimeStr(activeEv.startMin)} ~ ${minToTimeStr(activeEv.endMin)}`
        : `${minToTimeStr(activeEv.startMin)} 시작`;
      el.islandElapsedText.textContent = `${pct}% 진행 · ${elapsed}분 경과`;
      el.nowProgressBar.style.width = `${pct}%`;

      el.nowMinusBtn.classList.remove("hidden");
      el.nowMinusBtn.disabled = activeEv.hasEndAt ? activeEv.endMin - activeEv.startMin <= 15 : true;
      el.nowExtendBtn.classList.remove("hidden");
      el.nowPlus30Btn.classList.remove("hidden");
      el.nowStartNowBtn.classList.add("hidden");
      el.nowDoneBtn.classList.remove("hidden");

      el.nowMinusBtn.onclick = (e) => { e.stopPropagation(); handleQuickAction(activeEv.id, "minus15"); };
      el.nowExtendBtn.onclick = (e) => { e.stopPropagation(); handleQuickAction(activeEv.id, "plus15"); };
      el.nowPlus30Btn.onclick = (e) => { e.stopPropagation(); handleQuickAction(activeEv.id, "plus30"); };
      el.nowJumpBtn.onclick = (e) => { e.stopPropagation(); jumpToSchedule(activeEv); };
      el.nowDoneBtn.onclick = (e) => { e.stopPropagation(); toggleScheduleDone(activeEv.id, true); };
    } else if (nextEv) {
      const minsLeft = Math.max(1, nextEv.startMin - nowMin);
      const prepPct = clamp(Math.round(((60 - Math.min(60, minsLeft)) / 60) * 100), 8, 95);

      el.nowBanner.classList.remove("is-active");
      el.nowBannerLabel.textContent = nextEv.type === "reminder" ? "NEXT 🔔" : "NEXT";
      el.nowEventTitle.textContent = nextEv.title;
      el.nowRemaining.textContent = `${minsLeft}분 뒤`;
      updateIslandRing(prepPct, nextEv.type === "reminder" ? "#f59e0b" : "#6366f1");

      el.islandTypeBadge.textContent = TYPE_META[nextEv.type]?.badge || "예정";
      el.nowEventTime.textContent = nextEv.hasEndAt
        ? `${minToTimeStr(nextEv.startMin)} ~ ${minToTimeStr(nextEv.endMin)}`
        : `${minToTimeStr(nextEv.startMin)} 예정`;
      el.islandElapsedText.textContent = `시작 ${minsLeft}분 전`;
      el.nowProgressBar.style.width = `${prepPct}%`;

      el.nowMinusBtn.classList.add("hidden");
      el.nowExtendBtn.classList.add("hidden");
      el.nowPlus30Btn.classList.add("hidden");
      el.nowDoneBtn.classList.add("hidden");
      el.nowStartNowBtn.classList.remove("hidden");

      el.nowStartNowBtn.onclick = (e) => { e.stopPropagation(); startScheduleNow(nextEv); };
      el.nowJumpBtn.onclick = (e) => { e.stopPropagation(); jumpToSchedule(nextEv); };
    } else {
      const doneCnt = schedules.filter((e) => e.done).length;
      const donePct = schedules.length ? Math.round((doneCnt / schedules.length) * 100) : 100;

      el.nowBanner.classList.remove("is-active");
      el.nowBannerLabel.textContent = isToday ? "FREE" : currentDate;
      el.nowEventTitle.textContent = isToday ? "진행 중인 일정이 없습니다" : `${currentDate} 일정 보기`;
      el.nowRemaining.textContent = isToday ? "여유 시간" : `${schedules.length}건`;
      updateIslandRing(donePct, "#10b981");

      el.islandTypeBadge.textContent = isToday ? "대기" : currentDate;
      el.nowEventTime.textContent = "타임라인을 클릭하거나 '+ 새 일정' 추가";
      el.islandElapsedText.textContent = `완료 ${doneCnt}/${schedules.length}`;
      el.nowProgressBar.style.width = `${donePct}%`;

      el.nowMinusBtn.classList.add("hidden");
      el.nowExtendBtn.classList.add("hidden");
      el.nowPlus30Btn.classList.add("hidden");
      el.nowStartNowBtn.classList.add("hidden");
      el.nowDoneBtn.classList.add("hidden");
      el.nowJumpBtn.onclick = (e) => {
        e.stopPropagation();
        switchMobileTab("timeline");
        setIslandExpanded(false);
        scrollToOptimalPosition(true);
      };
    }

    const memoText = focusEv?.memo?.trim() || "";
    if (memoText) {
      el.islandMemoPreview.textContent = memoText;
      el.islandMemoPreview.classList.remove("hidden");
    } else {
      el.islandMemoPreview.classList.add("hidden");
    }

    // 다음 일정 & 남은 알림 하단 스트립
    const upNextEv = activeEv
      ? schedules
          .filter((e) => e.hasStartAt && !e.done && e.id !== activeEv.id && e.startMin >= activeEv.startMin)
          .sort((a, b) => a.startMin - b.startMin)[0]
      : nextEv;

    if (activeEv && upNextEv) {
      el.islandNextInfo.innerHTML = `<span>다음 · <strong>${escapeHtml(upNextEv.title)}</strong></span><span>${minToTimeStr(upNextEv.startMin)}</span>`;
    } else if (!activeEv && nextEv) {
      const remainCnt = schedules.filter((e) => !e.done).length;
      el.islandNextInfo.innerHTML = `<span>오늘 남은 미완료 일정</span><span>${remainCnt}건</span>`;
    } else {
      el.islandNextInfo.innerHTML = `<span>이후 예정된 일정 없음</span><span>${schedules.length}건 중 ${schedules.filter((e) => e.done).length}건 완료</span>`;
    }

    const remEv =
      schedules.find(
        (e) =>
          e.type === "reminder" &&
          !e.done &&
          e.id !== activeEv?.id &&
          (!isToday || !e.hasStartAt || e.startMin >= nowMin)
      ) || schedules.find((e) => e.type === "reminder" && !e.done && e.id !== activeEv?.id);

    if (remEv) {
      el.islandReminderInfo.classList.remove("hidden");
      el.islandReminderInfo.innerHTML = `<span>🔔 ${remEv.hasStartAt ? `${minToTimeStr(remEv.startMin)} ` : ""}${escapeHtml(remEv.title)}</span><span>이동 ›</span>`;
      el.islandReminderInfo.onclick = (e) => {
        e.stopPropagation();
        jumpToSchedule(remEv);
      };
    } else {
      el.islandReminderInfo.classList.add("hidden");
      el.islandReminderInfo.onclick = null;
    }

    alignDynamicIsland();
  }

  /* -------------------- 우측 요약 & 위젯 -------------------- */

  function renderRightWidgets() {
    const totalCount = schedules.length;
    const doneCount = schedules.filter((e) => e.done).length;
    const remainCount = totalCount - doneCount;
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    el.completionPercent.textContent = `${pct}%`;
    el.statTotalCount.textContent = `${totalCount}개`;
    el.statDoneCount.textContent = `${doneCount}개`;
    el.statRemainingCount.textContent = `${remainCount}개`;

    const countsByType = { schedule: 0, task: 0, reminder: 0 };
    for (const s of schedules) {
      countsByType[s.type] = (countsByType[s.type] || 0) + 1;
    }

    el.typeBreakdownBars.innerHTML = "";
    for (const [key, meta] of Object.entries(TYPE_META)) {
      const cnt = countsByType[key] || 0;
      const ratio = totalCount ? Math.round((cnt / totalCount) * 100) : 0;
      const row = document.createElement("div");
      row.className = "cat-bar-row";
      row.innerHTML = `
        <span class="cat-bar-label">${meta.label}</span>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${ratio}%; background:${meta.color}"></div>
        </div>
        <span class="cat-bar-time">${cnt}건</span>
      `;
      el.typeBreakdownBars.appendChild(row);
    }

    renderYoutubeList();

    if (document.activeElement !== el.dailyMemo) {
      el.dailyMemo.value = widgetsState.memo || "";
    }
  }

  function renderYoutubeList() {
    const list = widgetsState.youtubeList || [];
    el.ytCountBadge.textContent = String(list.length);
    el.youtubeList.innerHTML = "";

    if (!list.length) {
      el.youtubeList.innerHTML = `<div class="empty-hint">볼 유튜브 영상을 추가해 보세요</div>`;
      return;
    }

    for (const yt of list) {
      const card = document.createElement("div");
      card.className = `yt-card ${yt.done ? "is-done" : ""}`;
      card.draggable = true;
      card.innerHTML = `
        <div class="yt-card-top">
          <input type="checkbox" class="event-check" ${yt.done ? "checked" : ""} />
          <div class="yt-title">${escapeHtml(yt.title)}</div>
        </div>
        <div class="yt-card-bottom">
          <span>${yt.durationMin}분</span>
          <div class="dock-card-actions">
            ${yt.url ? `<a href="${escapeAttr(yt.url)}" target="_blank" rel="noopener" class="mini-btn yt-link">열기</a>` : ""}
            <button type="button" class="mini-btn schedule-yt-btn" title="일정으로 등록">📅</button>
            <button type="button" class="mini-btn del del-yt-btn">✕</button>
          </div>
        </div>
      `;

      card.querySelector(".event-check").addEventListener("change", (e) => {
        yt.done = e.target.checked;
        PlannerAPI.saveWidgetsState(currentDate, widgetsState);
        renderYoutubeList();
      });

      card.querySelector(".schedule-yt-btn").addEventListener("click", async () => {
        const startMin = findNextAvailableSlot(yt.durationMin);
        try {
          await createScheduleAndRecord(
            {
              date: currentDate,
              start_at: PlannerAPI.kstMinutesToIso(currentDate, startMin),
              end_at: PlannerAPI.kstMinutesToIso(currentDate, Math.min(1440, startMin + yt.durationMin)),
              title: `📺 ${yt.title}`,
              type: "schedule",
              source: "app",
              memo: yt.url || ""
            },
            `${minToTimeStr(startMin)}에 유튜브 일정을 등록했습니다.`
          );
        } catch (err) {
          showToast(`등록 실패: ${err.message}`, "⚠️");
        }
      });

      card.querySelector(".del-yt-btn").addEventListener("click", () => {
        widgetsState.youtubeList = list.filter((y) => y.id !== yt.id);
        PlannerAPI.saveWidgetsState(currentDate, widgetsState);
        renderYoutubeList();
      });

      card.addEventListener("dragstart", (e) => {
        activeHtmlDragPayload = {
          kind: "youtube",
          id: yt.id,
          title: `📺 ${yt.title}`,
          durationMin: yt.durationMin,
          url: yt.url || ""
        };
        e.dataTransfer.setData("text/plain", JSON.stringify(activeHtmlDragPayload));
      });
      card.addEventListener("dragend", () => {
        activeHtmlDragPayload = null;
        el.ghostPreview.classList.add("hidden");
      });

      el.youtubeList.appendChild(card);
    }
  }

  /* -------------------- 모달: 일정 생성 / 편집 -------------------- */

  function syncTimeFieldsVisibility() {
    const timed = el.editTimedCheck.checked;
    el.editTimeFields.classList.toggle("hidden", !timed);
    el.editStart.required = timed;
    el.editEnd.disabled = !el.editHasEndCheck.checked;
    if (!el.editHasEndCheck.checked) {
      el.editEnd.value = "";
    } else if (!el.editEnd.value && el.editStart.value) {
      const sMin = PlannerAPI.hhmmToMinutes(el.editStart.value) ?? 540;
      el.editEnd.value = minToTimeStr(Math.min(1439, sMin + getDefaultDurationMin()));
    }
  }

  function renderModalUntimedPicker(defaultStartMin, defaultEndMin) {
    if (!el.modalUntimedPicker || !el.modalUntimedChips) return;
    const pending = schedules.filter((s) => !s.hasStartAt && !s.done);
    if (!pending.length) {
      el.modalUntimedPicker.classList.add("hidden");
      el.modalUntimedChips.innerHTML = "";
      return;
    }

    el.modalUntimedPicker.classList.remove("hidden");
    el.modalUntimedChips.innerHTML = "";

    for (const item of pending) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `modal-untimed-chip type-${item.type}`;
      const icon = TYPE_META[item.type]?.icon || "📌";
      chip.innerHTML = `<span class="chip-icon">${icon}</span><span class="chip-title">${escapeHtml(item.title)}</span>`;
      chip.addEventListener("click", async () => {
        const pickedStart = PlannerAPI.hhmmToMinutes(el.editStart.value) ?? defaultStartMin;
        const pickedEndRaw = el.editHasEndCheck.checked
          ? PlannerAPI.hhmmToMinutes(el.editEnd.value) ?? defaultEndMin
          : null;
        const finalEnd =
          item.type === "reminder"
            ? null
            : pickedEndRaw !== null && pickedEndRaw > pickedStart
              ? Math.min(1440, pickedEndRaw)
              : Math.min(1440, pickedStart + getDefaultDurationMin());

        el.eventModal.classList.add("hidden");
        await commitScheduleTimeChange(item, pickedStart, finalEnd);
        showToast(`${minToTimeStr(pickedStart)}에 "${item.title}" 배치됨`, "📥");
      });
      el.modalUntimedChips.appendChild(chip);
    }
  }

  function openNewEventModal(startMin = 600, endMin = 660) {
    el.eventModalTitle.textContent = "새 일정 추가";
    el.editEventId.value = "";
    el.editTitle.value = "";
    el.editDate.value = currentDate;
    el.editType.value = "schedule";
    el.editTimedCheck.checked = true;
    el.editStart.value = minToTimeStr(Math.min(1439, startMin));
    el.editHasEndCheck.checked = true;
    el.editEnd.value = minToTimeStr(Math.min(1439, endMin));
    el.editDone.checked = false;
    el.editMemo.value = "";
    el.deleteEventModalBtn.classList.add("hidden");
    syncTimeFieldsVisibility();
    renderModalUntimedPicker(startMin, endMin);
    el.eventModal.classList.remove("hidden");
    setTimeout(() => el.editTitle.focus(), 40);
  }

  function openEventModal(eventId) {
    const ev = schedules.find((e) => e.id === eventId);
    if (!ev) return;
    if (el.modalUntimedPicker) el.modalUntimedPicker.classList.add("hidden");
    el.eventModalTitle.textContent = "일정 세부 편집";
    el.editEventId.value = ev.id;
    el.editTitle.value = ev.title;
    el.editDate.value = ev.date || currentDate;
    el.editType.value = ev.type || "schedule";
    el.editTimedCheck.checked = ev.hasStartAt;
    el.editStart.value = ev.hasStartAt ? minToTimeStr(Math.min(1439, ev.startMin)) : "09:00";
    el.editHasEndCheck.checked = ev.hasStartAt && ev.hasEndAt && ev.endMin !== null;
    el.editEnd.value =
      ev.hasStartAt && ev.hasEndAt && ev.endMin !== null
        ? minToTimeStr(Math.min(1439, ev.endMin))
        : "";
    el.editDone.checked = ev.done;
    el.editMemo.value = ev.memo || "";
    el.deleteEventModalBtn.classList.remove("hidden");
    syncTimeFieldsVisibility();
    el.eventModal.classList.remove("hidden");
    setTimeout(() => el.editTitle.focus(), 40);
  }

  /* -------------------- 모달: 커스텀 프리셋 -------------------- */

  function setPresetDurationValue(mins) {
    const num = Number(mins);
    const snapped = Number.isFinite(num) ? clamp(Math.round(num / 5) * 5, 0, 240) : 30;
    const durStr = String(snapped);
    if (el.presetDuration) el.presetDuration.value = durStr;
    if (el.presetDurLabel) el.presetDurLabel.textContent = snapped > 0 ? `${snapped}분` : "시작만";
    if (el.presetDurationSelect) {
      const hasOption = [...el.presetDurationSelect.options].some((o) => o.value === durStr);
      if (hasOption) {
        el.presetDurationSelect.value = durStr;
      } else {
        el.presetDurationSelect.selectedIndex = -1;
      }
    }
    if (el.presetDurMinusBtn) el.presetDurMinusBtn.disabled = snapped <= 0;
    if (el.presetDurPlusBtn) el.presetDurPlusBtn.disabled = snapped >= 240;
  }

  function resetPresetForm() {
    if (el.presetEditId) el.presetEditId.value = "";
    if (el.presetIcon) el.presetIcon.value = "⚡";
    if (el.presetTitle) el.presetTitle.value = "";
    setPresetDurationValue(30);
    if (el.presetType) el.presetType.value = "schedule";
    if (el.presetSubmitBtn) el.presetSubmitBtn.textContent = "추가";
    if (el.presetCancelEditBtn) el.presetCancelEditBtn.classList.add("hidden");
    renderPresetManager();
  }

  function startPresetEdit(p) {
    if (!p) return;
    if (el.presetEditId) el.presetEditId.value = p.id;
    if (el.presetIcon) el.presetIcon.value = p.icon || "⚡";
    if (el.presetTitle) el.presetTitle.value = p.title || "";
    setPresetDurationValue(Number(p.durationMin || 0));
    if (el.presetType) el.presetType.value = p.type || "schedule";
    if (el.presetSubmitBtn) el.presetSubmitBtn.textContent = "저장";
    if (el.presetCancelEditBtn) el.presetCancelEditBtn.classList.remove("hidden");
    renderPresetManager();
    el.presetTitle?.focus();
  }

  function renderPresetManager() {
    el.presetManageList.innerHTML = "";
    const editingId = el.presetEditId?.value || "";
    prefs.presets.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "preset-manage-item" + (editingId && editingId === p.id ? " is-editing" : "");
      const durLabel = p.durationMin > 0 ? `${p.durationMin}분` : "시작 시각만";
      row.innerHTML = `
        <span>${escapeHtml(p.icon)} <strong>${escapeHtml(p.title)}</strong> (${durLabel} · ${TYPE_META[p.type]?.label || p.type})</span>
        <div class="preset-item-actions">
          <button type="button" class="mini-btn edit" title="프리셋 편집">편집</button>
          <button type="button" class="mini-btn del" title="프리셋 삭제">삭제</button>
        </div>
      `;
      row.querySelector(".edit").addEventListener("click", () => {
        startPresetEdit(p);
      });
      row.querySelector(".del").addEventListener("click", () => {
        const wasEditing = el.presetEditId?.value === p.id;
        prefs.presets.splice(idx, 1);
        PlannerAPI.savePrefs(prefs);
        if (wasEditing) {
          resetPresetForm();
        } else {
          renderPresetManager();
        }
        renderPresets();
      });
      el.presetManageList.appendChild(row);
    });
  }

  /* -------------------- 모달: API 설정 -------------------- */

  function updateSupabaseAuthUi() {
    const signedIn = Boolean(supabaseSession?.user);
    el.sbSignedInBox.classList.toggle("hidden", !signedIn);
    el.sbLoginFormBox.classList.toggle("hidden", signedIn);
    if (signedIn) {
      el.sbUserEmail.textContent = supabaseSession.user.email || supabaseSession.user.id || "로그인됨";
    }
    updateAuthGateVisibility();
  }

  function updateAuthGateVisibility() {
    if (!el.authGate) return;
    const shouldShowGate = !supabaseSession;
    el.authGate.classList.toggle("hidden", !shouldShowGate);
    if (shouldShowGate && el.authGateEmail && !el.authGateEmail.value) {
      setTimeout(() => el.authGateEmail?.focus(), 40);
    }
  }

  function checkBrowserNotifications() {
    if (!prefs.browserNotify || !isViewingToday()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const nowMin = getNowKstMinutes();
    for (const ev of schedules) {
      if (!ev || ev.done || !ev.hasStartAt) continue;
      if (ev.startMin !== nowMin) continue;

      const key = `${currentDate}:${ev.id}:${ev.startMin}`;
      if (notifiedEventKeys.has(key)) continue;
      notifiedEventKeys.add(key);

      try {
        const prefix = ev.type === "reminder" ? "🔔 알림" : "📅 시작";
        new Notification(`${prefix}: ${ev.title}`, {
          body: formatEventTimeLabel(ev),
          tag: key
        });
      } catch {
        // ignore browser notification failures
      }
    }
  }

  const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function formatWeekdaysLabel(days = []) {
    const sorted = [...new Set(days.map(Number))].sort((a, b) => a - b);
    if (sorted.length === 7) return "매일";
    if (sorted.length === 5 && sorted.join(",") === "1,2,3,4,5") return "평일";
    if (sorted.length === 2 && sorted.join(",") === "0,6") return "주말";
    return sorted.map((d) => WEEKDAY_NAMES[d] || "").filter(Boolean).join("·");
  }

  function resetRoutineForm() {
    if (el.routineEditId) el.routineEditId.value = "";
    if (el.routineTitle) el.routineTitle.value = "";
    if (el.routineType) el.routineType.value = "schedule";
    if (el.routineUntimedCheck) el.routineUntimedCheck.checked = false;
    if (el.routineTime) {
      el.routineTime.disabled = false;
      el.routineTime.value = "23:00";
    }
    if (el.routineDuration) {
      el.routineDuration.disabled = false;
      el.routineDuration.value = "30";
    }
    el.routineWeekdayBar
      ?.querySelectorAll('.routine-weekday-chips input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = true;
      });
    if (el.routineSubmitBtn) el.routineSubmitBtn.textContent = "+ 루틴 추가";
    el.routineCancelEditBtn?.classList.add("hidden");
    el.routineManageList
      ?.querySelectorAll(".routine-manage-item.is-editing")
      .forEach((node) => node.classList.remove("is-editing"));
  }

  function startRoutineEdit(rt) {
    if (!rt) return;
    if (el.routineEditId) el.routineEditId.value = rt.id;
    if (el.routineTitle) el.routineTitle.value = rt.title || "";
    if (el.routineType) el.routineType.value = rt.type || "schedule";

    const untimed = !rt.start_time;
    if (el.routineUntimedCheck) el.routineUntimedCheck.checked = untimed;
    if (el.routineTime) {
      el.routineTime.disabled = untimed;
      el.routineTime.value = rt.start_time || "23:00";
    }
    if (el.routineDuration) {
      el.routineDuration.disabled = untimed;
      const durVal = String(rt.duration_min ?? 30);
      if (![...el.routineDuration.options].some((opt) => opt.value === durVal)) {
        const opt = document.createElement("option");
        opt.value = durVal;
        opt.textContent = `${durVal}분`;
        el.routineDuration.appendChild(opt);
      }
      el.routineDuration.value = durVal;
    }

    const activeDays = Array.isArray(rt.weekdays) ? rt.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6];
    el.routineWeekdayBar
      ?.querySelectorAll('.routine-weekday-chips input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = activeDays.includes(Number(cb.value));
      });

    if (el.routineSubmitBtn) el.routineSubmitBtn.textContent = "💾 루틴 저장";
    el.routineCancelEditBtn?.classList.remove("hidden");
    el.routineManageList?.querySelectorAll(".routine-manage-item").forEach((node) => {
      node.classList.toggle("is-editing", node.dataset.id === rt.id);
    });
    el.routineTitle?.focus();
  }

  async function loadAndRenderRoutines() {
    if (!el.routineManageList) return;
    const settings = PlannerAPI.getSettings();
    if (settings.mode === "supabase" && !supabaseSession) {
      el.routineManageList.innerHTML = `<div class="empty-hint">로그인 후 반복 루틴을 관리할 수 있습니다.</div>`;
      return;
    }

    try {
      const list = await PlannerAPI.fetchRoutineTemplates();
      el.routineManageList.innerHTML = "";
      if (!list.length) {
        el.routineManageList.innerHTML = `<div class="empty-hint">등록된 반복 루틴이 없습니다. 아래에서 매일·요일별 루틴을 추가해 보세요.</div>`;
        return;
      }

      const editingId = el.routineEditId?.value || "";
      for (const rt of list) {
        const row = document.createElement("div");
        row.className = `routine-manage-item ${rt.enabled ? "" : "is-disabled"} ${editingId === rt.id ? "is-editing" : ""}`;
        row.dataset.id = rt.id;
        const timeStr = rt.start_time ? `${rt.start_time}` : "시간 미정";
        const durStr = rt.start_time && rt.duration_min > 0 ? ` · ${rt.duration_min}분` : rt.start_time ? " · 시작만" : "";
        const dayStr = formatWeekdaysLabel(rt.weekdays);
        const typeLabel = TYPE_META[rt.type]?.label || "일정";

        row.innerHTML = `
          <label class="routine-item-toggle" title="루틴 활성화/비활성화">
            <input type="checkbox" class="routine-enable-cb" ${rt.enabled ? "checked" : ""} />
          </label>
          <div class="routine-item-info">
            <div class="routine-item-title">${escapeHtml(rt.title)}</div>
            <div class="routine-item-meta">
              <span class="routine-day-badge">${escapeHtml(dayStr)}</span>
              <span>${escapeHtml(timeStr + durStr)} · ${escapeHtml(typeLabel)}</span>
            </div>
          </div>
          <div class="routine-item-actions">
            <button type="button" class="mini-btn edit-routine-btn" title="루틴 편집">✏️</button>
            <button type="button" class="mini-btn del" title="루틴 삭제">✕</button>
          </div>
        `;

        row.querySelector(".routine-enable-cb").addEventListener("change", async (e) => {
          const enabled = e.target.checked;
          try {
            await PlannerAPI.patchRoutineTemplate(rt.id, { enabled });
            row.classList.toggle("is-disabled", !enabled);
            if (enabled) {
              const added = await PlannerAPI.applyRoutinesForDate(currentDate);
              if (added > 0) await loadDay(currentDate, false);
            }
            showToast(enabled ? "루틴을 활성화했습니다." : "루틴을 일시 중지했습니다.");
          } catch (err) {
            e.target.checked = !enabled;
            showToast(`루틴 변경 실패: ${err.message}`, "⚠️");
          }
        });

        row.querySelector(".edit-routine-btn").addEventListener("click", () => {
          startRoutineEdit(rt);
        });

        row.querySelector(".del").addEventListener("click", async () => {
          try {
            await PlannerAPI.deleteRoutineTemplate(rt.id);
            if (el.routineEditId?.value === rt.id) {
              resetRoutineForm();
            }
            await loadAndRenderRoutines();
            showToast(`'${rt.title}' 루틴을 삭제했습니다.`);
          } catch (err) {
            showToast(`루틴 삭제 실패: ${err.message}`, "⚠️");
          }
        });

        el.routineManageList.appendChild(row);
      }
    } catch (err) {
      el.routineManageList.innerHTML = `<div class="empty-hint">루틴 목록 조회 실패: ${escapeHtml(err.message)}</div>`;
    }
  }

  function openApiSettingsModal(scrollSectionEl = null) {
    updateSupabaseAuthUi();
    renderPresetManager();
    applyPrefsToUI();
    loadAndRenderRoutines();
    el.apiModal.classList.remove("hidden");
    requestAnimationFrame(() => {
      if (scrollSectionEl && typeof scrollSectionEl.scrollIntoView === "function") {
        scrollSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (el.settingsModalBody) {
        el.settingsModalBody.scrollTop = 0;
      }
    });
  }

  /* -------------------- 이벤트 바인딩 -------------------- */

  function bindControls() {
    el.datePicker?.addEventListener("change", (e) => {
      if (e.target.value) loadDay(e.target.value);
    });

    el.datePickerBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.calendarPopover?.classList.contains("hidden")) {
        openCalendarPopover();
      } else {
        closeCalendarPopover();
      }
    });

    el.calPrevMonthBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      shiftCalendarMonth(-1);
    });

    el.calNextMonthBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      shiftCalendarMonth(1);
    });

    el.calTodayBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeCalendarPopover();
      loadDay(PlannerAPI.todayKst());
    });

    el.calendarPopover?.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      if (
        el.calendarPopover &&
        !el.calendarPopover.classList.contains("hidden") &&
        !el.dateNav?.contains(e.target)
      ) {
        closeCalendarPopover();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCalendarPopover();
      }
    });

    el.prevDayBtn.addEventListener("click", () => {
      closeCalendarPopover();
      loadDay(PlannerAPI.shiftDateStr(currentDate, -1));
    });
    el.nextDayBtn.addEventListener("click", () => {
      closeCalendarPopover();
      loadDay(PlannerAPI.shiftDateStr(currentDate, 1));
    });
    el.todayBtn.addEventListener("click", () => {
      closeCalendarPopover();
      loadDay(PlannerAPI.todayKst());
    });

    el.snapSelect?.addEventListener("change", (e) => {
      prefs.snapMin = Number(e.target.value);
      PlannerAPI.savePrefs(prefs);
      showToast(`스냅 간격: ${prefs.snapMin}분`);
    });

    el.zoomRange?.addEventListener("input", (e) => {
      prefs.pxPerMin = Number(e.target.value);
      PlannerAPI.savePrefs(prefs);
      if (el.zoomValueLabel) {
        el.zoomValueLabel.textContent = `${prefs.pxPerMin.toFixed(2)}x`;
      }
      renderTimelineGrid();
      renderEvents();
      renderNowState();
    });

    el.defaultDurationSelect?.addEventListener("change", (e) => {
      prefs.defaultDurationMin = Number(e.target.value);
      PlannerAPI.savePrefs(prefs);
      showToast(`새 일정 기본 길이: ${getDefaultDurationMin()}분`);
    });

    el.earlyStartHourSelect?.addEventListener("change", (e) => {
      const startHour = clamp(Number(e.target.value), 0, 11);
      prefs.earlyStartHour = startHour;
      if ((Number(prefs.earlyEndHour) || 7) <= startHour) {
        prefs.earlyEndHour = Math.min(12, startHour + 1);
      }
      PlannerAPI.savePrefs(prefs);
      renderAll();
      const sLabel = `${String(Math.round(getEarlyStartMin() / 60)).padStart(2, "0")}:00`;
      const eLabel = `${String(Math.round(getEarlyEndMin() / 60)).padStart(2, "0")}:00`;
      showToast(`새벽 접기 기준: ${sLabel} ~ ${eLabel}`);
    });

    el.earlyEndHourSelect?.addEventListener("change", (e) => {
      const endHour = clamp(Number(e.target.value), 1, 12);
      prefs.earlyEndHour = endHour;
      if ((Number(prefs.earlyStartHour) || 0) >= endHour) {
        prefs.earlyStartHour = Math.max(0, endHour - 1);
      }
      PlannerAPI.savePrefs(prefs);
      renderAll();
      const sLabel = `${String(Math.round(getEarlyStartMin() / 60)).padStart(2, "0")}:00`;
      const eLabel = `${String(Math.round(getEarlyEndMin() / 60)).padStart(2, "0")}:00`;
      showToast(`새벽 접기 기준: ${sLabel} ~ ${eLabel}`);
    });

    el.earlyCollapsedCheck?.addEventListener("change", (e) => {
      prefs.earlyCollapsed = e.target.checked;
      PlannerAPI.savePrefs(prefs);
      renderAll();
    });

    el.cascadeCheck?.addEventListener("change", (e) => {
      prefs.cascadeMode = e.target.checked;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.cascadeMode ? "🔗 연쇄 밀기 켜짐" : "연쇄 밀기 꺼짐");
    });

    el.earlyToggleBtn.addEventListener("click", () => {
      prefs.earlyCollapsed = !prefs.earlyCollapsed;
      PlannerAPI.savePrefs(prefs);
      renderAll();
    });

    el.openRoutinesBtn?.addEventListener("click", () => {
      openApiSettingsModal(el.settingsRoutineSection);
    });

    el.routineUntimedCheck?.addEventListener("change", (e) => {
      if (el.routineTime) el.routineTime.disabled = e.target.checked;
      if (el.routineDuration) el.routineDuration.disabled = e.target.checked;
    });

    el.routineWeekdayBar?.querySelectorAll("[data-day-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.dayPreset;
        const target =
          kind === "none"
            ? []
            : kind === "weekdays"
              ? [1, 2, 3, 4, 5]
              : kind === "weekend"
                ? [0, 6]
                : [0, 1, 2, 3, 4, 5, 6];
        el.routineWeekdayBar.querySelectorAll('.routine-weekday-chips input[type="checkbox"]').forEach((cb) => {
          cb.checked = target.includes(Number(cb.value));
        });
      });
    });

    el.routineCancelEditBtn?.addEventListener("click", () => {
      resetRoutineForm();
    });

    el.addRoutineForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = el.routineTitle.value.trim();
      if (!title) return;

      const weekdays = [...el.routineWeekdayBar.querySelectorAll('.routine-weekday-chips input[type="checkbox"]:checked')].map(
        (cb) => Number(cb.value)
      );
      if (!weekdays.length) {
        showToast("반복할 요일을 1개 이상 선택해 주세요.", "⚠️");
        return;
      }

      const untimed = Boolean(el.routineUntimedCheck?.checked);
      const startTime = untimed ? null : el.routineTime?.value || null;
      const durationMin = untimed ? 0 : Number(el.routineDuration?.value ?? 30);
      const editId = el.routineEditId?.value?.trim() || "";

      try {
        if (editId) {
          await PlannerAPI.patchRoutineTemplate(editId, {
            title,
            type: el.routineType?.value || "schedule",
            start_time: startTime,
            duration_min: durationMin,
            weekdays
          });
          resetRoutineForm();
          await loadAndRenderRoutines();
          showToast(`루틴 '${title}'을(를) 수정했습니다. (이후 날짜부터 반영)`, "✏️");
        } else {
          await PlannerAPI.createRoutineTemplate({
            title,
            type: el.routineType?.value || "schedule",
            start_time: startTime,
            duration_min: durationMin,
            weekdays,
            enabled: true
          });
          resetRoutineForm();
          await loadAndRenderRoutines();
          const applied = await PlannerAPI.applyRoutinesForDate(currentDate);
          if (applied > 0) {
            await loadDay(currentDate, false);
            showToast(`루틴 '${title}'을(를) 추가하고 현재 날짜에도 바로 반영했습니다.`, "🔁");
          } else {
            showToast(`루틴 '${title}'을(를) 추가했습니다.`, "🔁");
          }
        }
      } catch (err) {
        showToast(`루틴 저장 실패: ${err.message}`, "⚠️");
      }
    });

    el.applyRoutinesNowBtn?.addEventListener("click", async () => {
      try {
        const added = await PlannerAPI.applyRoutinesForDate(currentDate);
        if (added > 0) {
          await loadDay(currentDate, false);
          showToast(`현재 날짜(${currentDate})에 루틴 ${added}건을 반영했습니다.`, "🔁");
        } else {
          showToast("현재 날짜에 새로 반영할 루틴이 없습니다.");
        }
      } catch (err) {
        showToast(`루틴 반영 실패: ${err.message}`, "⚠️");
      }
    });

    el.themeSelect?.addEventListener("change", (e) => {
      prefs.theme = e.target.value === "light" ? "light" : "dark";
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.theme === "light" ? "라이트 모드로 전환했습니다" : "다크 모드로 전환했습니다");
    });

    el.dimCompletedCheck?.addEventListener("change", (e) => {
      prefs.dimCompleted = e.target.checked;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.dimCompleted ? "완료 일정을 흐리게 표시합니다." : "완료 일정을 선명하게 표시합니다.");
    });

    el.showPlacedListCheck?.addEventListener("change", (e) => {
      prefs.showPlacedList = e.target.checked;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      renderAll();
      showToast(prefs.showPlacedList ? "좌측 배치 목록을 표시합니다." : "좌측 배치 목록을 숨겼습니다.");
    });

    el.placedCollapseBtn?.addEventListener("click", () => {
      prefs.placedCollapsed = !prefs.placedCollapsed;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
    });

    el.placedTasksOnlyBtn?.addEventListener("click", () => {
      prefs.placedTasksOnly = !prefs.placedTasksOnly;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      renderAll();
      showToast(prefs.placedTasksOnly ? "배치 목록: 할 일만 표시" : "배치 목록: 전체 표시");
    });

    el.browserNotifyCheck?.addEventListener("change", async (e) => {
      if (!e.target.checked) {
        prefs.browserNotify = false;
        PlannerAPI.savePrefs(prefs);
        showToast("브라우저 정각 알림을 껐습니다.");
        return;
      }

      if (typeof Notification === "undefined") {
        e.target.checked = false;
        prefs.browserNotify = false;
        PlannerAPI.savePrefs(prefs);
        showToast("이 브라우저는 데스크톱 알림을 지원하지 않습니다.", "⚠️");
        return;
      }

      if (Notification.permission === "granted") {
        prefs.browserNotify = true;
        PlannerAPI.savePrefs(prefs);
        showToast("브라우저 정각 알림이 켜졌습니다.", "🔔");
        return;
      }

      if (Notification.permission === "denied") {
        e.target.checked = false;
        prefs.browserNotify = false;
        PlannerAPI.savePrefs(prefs);
        showToast("브라우저 알림 권한이 차단되어 있습니다. 사이트 설정에서 허용해 주세요.", "⚠️");
        return;
      }

      const result = await Notification.requestPermission();
      if (result === "granted") {
        prefs.browserNotify = true;
        PlannerAPI.savePrefs(prefs);
        applyPrefsToUI();
        showToast("브라우저 정각 알림이 활성화되었습니다.", "🔔");
      } else {
        e.target.checked = false;
        prefs.browserNotify = false;
        PlannerAPI.savePrefs(prefs);
        applyPrefsToUI();
        showToast("알림 권한이 허용되지 않았습니다.", "⚠️");
      }
    });

    el.settingsWidgetChecks?.querySelectorAll("input[data-widget]").forEach((cb) => {
      cb.addEventListener("change", () => {
        prefs.widgets[cb.dataset.widget] = cb.checked;
        PlannerAPI.savePrefs(prefs);
        applyPrefsToUI();
      });
    });

    el.resetPresetsBtn?.addEventListener("click", () => {
      prefs.presets = PlannerAPI.getDefaultPresets();
      PlannerAPI.savePrefs(prefs);
      resetPresetForm();
      renderPresets();
      showToast("빠른 블록 프리셋을 기본값으로 복원했습니다.", "⚡");
    });

    el.saveSettingsBtn?.addEventListener("click", () => {
      if (el.snapSelect) prefs.snapMin = Number(el.snapSelect.value) || 15;
      if (el.defaultDurationSelect) prefs.defaultDurationMin = Number(el.defaultDurationSelect.value) || 30;
      if (el.earlyStartHourSelect) {
        prefs.earlyStartHour = clamp(Number(el.earlyStartHourSelect.value), 0, 11);
      }
      if (el.earlyEndHourSelect) {
        prefs.earlyEndHour = clamp(Number(el.earlyEndHourSelect.value), 1, 12);
      }
      if ((Number(prefs.earlyEndHour) || 7) <= (Number(prefs.earlyStartHour) || 0)) {
        prefs.earlyEndHour = Math.min(12, (Number(prefs.earlyStartHour) || 0) + 1);
      }
      if (el.earlyCollapsedCheck) prefs.earlyCollapsed = el.earlyCollapsedCheck.checked;
      if (el.cascadeCheck) prefs.cascadeMode = el.cascadeCheck.checked;
      if (el.themeSelect) prefs.theme = el.themeSelect.value === "light" ? "light" : "dark";
      if (el.dimCompletedCheck) prefs.dimCompleted = el.dimCompletedCheck.checked;
      if (el.browserNotifyCheck) prefs.browserNotify = el.browserNotifyCheck.checked;
      el.settingsWidgetChecks?.querySelectorAll("input[data-widget]").forEach((cb) => {
        if (!prefs.widgets) prefs.widgets = {};
        prefs.widgets[cb.dataset.widget] = cb.checked;
      });
      PlannerAPI.savePrefs(prefs);
      renderAll();
      el.apiModal.classList.add("hidden");
      showToast("설정이 저장되었습니다.", "✅");
    });

    el.resetAllPrefsBtn?.addEventListener("click", () => {
      if (
        !window.confirm(
          "테마, 스냅, 줌, 위젯, 프리셋 등 모든 로컬 설정을 기본값으로 되돌릴까요?\n(저장된 일정 데이터와 로그인 세션은 유지됩니다.)"
        )
      ) {
        return;
      }
      prefs = PlannerAPI.resetPrefsToDefault();
      renderPresetManager();
      renderPresets();
      renderAll();
      showToast("모든 플래너 설정을 기본값으로 초기화했습니다.", "🔄");
    });

    el.undoBtn.addEventListener("click", () => {
      undoLastAction();
    });

    el.syncNowBtn.addEventListener("click", () => {
      loadDay(currentDate, false).then(() => showToast("일정을 새로고침했습니다.", "🔄"));
    });

    const compactBar = el.nowBanner.querySelector(".island-compact");
    if (compactBar) {
      compactBar.addEventListener("click", (e) => {
        e.stopPropagation();
        const willExpand = !el.nowBanner.classList.contains("is-expanded");
        setIslandExpanded(willExpand);
      });
    }
    if (el.islandExpanded) {
      el.islandExpanded.addEventListener("pointerdown", () => {
        if (el.nowBanner.classList.contains("is-expanded")) {
          setIslandExpanded(true);
        }
      });
    }
    el.nowBanner.addEventListener("mouseenter", () => {
      alignDynamicIsland();
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        setIslandExpanded(true);
      }
    });
    el.nowBanner.addEventListener("mouseleave", () => {
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        setIslandExpanded(false);
      }
    });
    el.nowBanner.addEventListener("focusin", alignDynamicIsland);
    window.addEventListener("resize", alignDynamicIsland);
    document.addEventListener("pointerdown", (e) => {
      if (el.nowBanner.classList.contains("is-expanded") && !el.nowBanner.contains(e.target)) {
        setIslandExpanded(false);
      }
    });
    document.addEventListener("click", (e) => {
      if (!el.nowBanner.contains(e.target)) {
        setIslandExpanded(false);
      }
    });

    el.typeFilterBar.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTypeFilter = btn.dataset.type;
        el.typeFilterBar.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderEvents();
      });
    });

    const openQuickNewEvent = () => {
      const dur = getDefaultDurationMin();
      const next = findNextAvailableSlot(dur);
      openNewEventModal(next, Math.min(1440, next + dur));
    };

    el.addEventBtn.addEventListener("click", openQuickNewEvent);
    if (el.mobileAddFab) {
      el.mobileAddFab.addEventListener("click", openQuickNewEvent);
    }

    // 모바일 반응형: 날짜 네비게이션을 타임라인 바로 위로 이동 & 하단 탭 전환
    const mobileMq = window.matchMedia("(max-width: 960px)");
    const syncResponsiveDateNav = () => {
      if (!el.dateNav || !el.desktopDateSlot || !el.mobileDateSlot) return;
      const targetSlot = mobileMq.matches ? el.mobileDateSlot : el.desktopDateSlot;
      if (el.dateNav.parentElement !== targetSlot) {
        targetSlot.appendChild(el.dateNav);
      }
      alignDynamicIsland();
    };
    syncResponsiveDateNav();
    if (mobileMq.addEventListener) {
      mobileMq.addEventListener("change", syncResponsiveDateNav);
    } else {
      window.addEventListener("resize", syncResponsiveDateNav);
    }

    if (el.mobileTabBar && el.appShell) {
      el.mobileTabBar.querySelectorAll(".mobile-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          switchMobileTab(btn.dataset.mobileTab || "timeline");
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }

    // 좌측 시간 미정 추가
    el.addStagedForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = el.newStagedTitle.value.trim();
      if (!title) return;
      const type = el.newStagedType.value || "task";
      try {
        el.newStagedTitle.value = "";
        await createScheduleAndRecord(
          {
            date: currentDate,
            start_at: null,
            end_at: null,
            title,
            type,
            source: "app",
            memo: ""
          },
          "시간 미정 일정을 등록했습니다."
        );
      } catch (err) {
        showToast(`등록 실패: ${err.message}`, "⚠️");
      }
    });

    // 우측 유튜브 볼 리스트 (로컬 위젯)
    el.addYoutubeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = el.newYtTitle.value.trim();
      if (!title) return;
      widgetsState.youtubeList.unshift({
        id: PlannerAPI.uid("yt"),
        title,
        url: el.newYtUrl.value.trim(),
        durationMin: Number(el.newYtDuration.value),
        done: false
      });
      PlannerAPI.saveWidgetsState(currentDate, widgetsState);
      el.newYtTitle.value = "";
      el.newYtUrl.value = "";
      renderYoutubeList();
    });

    el.dailyMemo.addEventListener("input", (e) => {
      widgetsState.memo = e.target.value;
      PlannerAPI.saveWidgetsState(currentDate, widgetsState);
      el.memoSavedHint.textContent = `로컬 저장 (${minToTimeStr(getNowKstMinutes())})`;
    });

    el.widgetConfigBtn?.addEventListener("click", () => {
      openApiSettingsModal(el.settingsDisplaySection);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".event-block") && selectedEventId) {
        selectedEventId = null;
        renderEvents();
      }
    });

    // 일정 편집 모달 제어
    el.editTimedCheck.addEventListener("change", syncTimeFieldsVisibility);
    el.editHasEndCheck.addEventListener("change", syncTimeFieldsVisibility);
    el.editType.addEventListener("change", () => {
      if (!el.editEventId.value && el.editType.value === "reminder") {
        el.editHasEndCheck.checked = false;
        syncTimeFieldsVisibility();
      }
    });

    el.eventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = el.editEventId.value;
      const dateVal = el.editDate.value || currentDate;
      const titleVal = el.editTitle.value.trim();
      if (!titleVal) return;

      let startAt = null;
      let endAt = null;
      if (el.editTimedCheck.checked) {
        const startMin = PlannerAPI.hhmmToMinutes(el.editStart.value);
        if (startMin === null) {
          showToast("시작 시각을 입력해 주세요.");
          return;
        }
        startAt = PlannerAPI.kstMinutesToIso(dateVal, startMin);

        if (el.editHasEndCheck.checked && el.editEnd.value) {
          const endMin = PlannerAPI.hhmmToMinutes(el.editEnd.value);
          if (endMin < startMin) {
            showToast("종료 시각은 시작 시각보다 빠를 수 없습니다.");
            return;
          }
          endAt = PlannerAPI.kstMinutesToIso(dateVal, endMin);
        }
      }

      const payload = {
        date: dateVal,
        title: titleVal,
        type: el.editType.value,
        start_at: startAt,
        end_at: endAt,
        done: el.editDone.checked,
        memo: el.editMemo.value
      };

      try {
        el.eventModal.classList.add("hidden");
        if (id) {
          const prevEv = schedules.find((s) => s.id === id);
          lastUserMutationAt = Date.now();
          const updated = await PlannerAPI.patchSchedule(id, payload, currentDate);
          if (updated && updated.date === currentDate) {
            schedules = PlannerAPI.sortSchedules(schedules.map((s) => (s.id === id ? updated : s)));
            syncSwrCacheIfCurrent(currentDate, schedules);
            renderAll();
          } else {
            await loadDay(dateVal === currentDate ? currentDate : dateVal, false);
          }
          if (prevEv) {
            const snapPatch = {
              date: prevEv.date,
              title: prevEv.title,
              type: prevEv.type,
              start_at: prevEv.start_at,
              end_at: prevEv.end_at,
              done: prevEv.done,
              memo: prevEv.memo || ""
            };
            pushUndoAction(`'${prevEv.title}' 수정`, async () => {
              const reverted = await PlannerAPI.patchSchedule(id, snapPatch, snapPatch.date);
              if (reverted && reverted.date === currentDate) {
                schedules = PlannerAPI.sortSchedules(schedules.map((s) => (s.id === id ? reverted : s)));
                syncSwrCacheIfCurrent(currentDate, schedules);
                renderAll();
              } else {
                await loadDay(snapPatch.date, false);
              }
            });
          }
          showToast("일정을 수정했습니다.", "✏️");
        } else {
          await createScheduleAndRecord(
            {
              ...payload,
              source: "app"
            },
            "새 일정을 등록했습니다."
          );
        }
      } catch (err) {
        showToast(`저장 실패: ${err.message}`, "⚠️");
      }
    });

    el.deleteEventModalBtn.addEventListener("click", async () => {
      const id = el.editEventId.value;
      if (!id) return;
      el.eventModal.classList.add("hidden");
      await deleteScheduleById(id);
    });

    // 빠른 블록 프리셋 편집 & 통합 설정 모달 열기
    el.editPresetsBtn?.addEventListener("click", () => {
      resetPresetForm();
      openApiSettingsModal(el.settingsPresetSection);
    });

    el.presetCancelEditBtn?.addEventListener("click", () => {
      resetPresetForm();
    });

    el.presetDurMinusBtn?.addEventListener("click", () => {
      setPresetDurationValue((Number(el.presetDuration?.value) || 0) - 5);
    });
    el.presetDurPlusBtn?.addEventListener("click", () => {
      setPresetDurationValue((Number(el.presetDuration?.value) || 0) + 5);
    });
    el.presetDurationSelect?.addEventListener("change", (e) => {
      setPresetDurationValue(e.target.value);
    });

    el.addPresetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = el.presetTitle.value.trim();
      if (!title) return;
      const editId = el.presetEditId?.value?.trim() || "";
      const payload = {
        icon: el.presetIcon.value.trim() || "⚡",
        title,
        durationMin: Number(el.presetDuration.value),
        type: el.presetType.value || "schedule"
      };
      if (editId) {
        const target = prefs.presets.find((item) => item.id === editId);
        if (target) {
          Object.assign(target, payload);
        }
        PlannerAPI.savePrefs(prefs);
        resetPresetForm();
        renderPresets();
        showToast("빠른 블록 프리셋을 수정했습니다.", "💾");
      } else {
        prefs.presets.push({
          id: PlannerAPI.uid("pre"),
          ...payload
        });
        PlannerAPI.savePrefs(prefs);
        resetPresetForm();
        renderPresets();
        showToast("빠른 블록 프리셋을 추가했습니다.", "⚡");
      }
    });

    // 통합 설정 & 계정 모달
    el.openSettingsBtn?.addEventListener("click", () => openApiSettingsModal());
    el.openApiModalBtn?.addEventListener("click", () => openApiSettingsModal(el.settingsAccountSection));

    async function performSupabaseLogin() {
      const email = el.sbLoginEmail.value.trim();
      const password = el.sbLoginPassword.value;
      if (!email || !password) {
        showToast("이메일과 비밀번호를 모두 입력해 주세요.", "⚠️");
        return;
      }
      el.sbLoginBtn.disabled = true;
      el.sbLoginBtn.textContent = "로그인 중...";
      try {
        supabaseSession = await PlannerAPI.signInSupabase(email, password);
        el.sbLoginPassword.value = "";
        updateSupabaseAuthUi();
        updateApiBadge();
        el.apiModal.classList.add("hidden");
        await loadDay(currentDate);
        await setupRealtimeSync(true);
        showToast("가계부 계정으로 로그인되었습니다.", "✅");
      } catch (err) {
        showToast(`로그인 실패: ${err.message}`, "⚠️");
      } finally {
        el.sbLoginBtn.disabled = false;
        el.sbLoginBtn.textContent = "로그인";
      }
    }

    el.sbLoginBtn.addEventListener("click", performSupabaseLogin);

    el.sbLogoutBtn.addEventListener("click", async () => {
      try {
        await PlannerAPI.signOutSupabase();
      } catch {
        // ignore signOut errors
      }
      supabaseSession = null;
      await disconnectRealtime();
      el.apiModal.classList.add("hidden");
      updateSupabaseAuthUi();
      updateApiBadge();
      schedules = [];
      renderAll();
      showToast("로그아웃했습니다.");
    });

    el.authGateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = el.authGateEmail.value.trim();
      const password = el.authGatePassword.value;
      el.authGateError.classList.add("hidden");
      el.authGateSubmitBtn.disabled = true;
      el.authGateSubmitBtn.textContent = "로그인 중...";
      try {
        supabaseSession = await PlannerAPI.signInSupabase(email, password);
        el.authGatePassword.value = "";
        updateSupabaseAuthUi();
        updateApiBadge();
        await loadDay(currentDate);
        await setupRealtimeSync(true);
        showToast("가계부 계정으로 로그인되었습니다.", "✅");
      } catch (err) {
        el.authGateError.textContent = err.message || "이메일 또는 비밀번호를 확인해 주세요.";
        el.authGateError.classList.remove("hidden");
      } finally {
        el.authGateSubmitBtn.disabled = false;
        el.authGateSubmitBtn.textContent = "로그인";
      }
    });

    el.apiSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!supabaseSession) {
        await performSupabaseLogin();
      } else {
        el.apiModal.classList.add("hidden");
      }
    });

    // 모달 닫기
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.close)?.classList.add("hidden");
      });
    });

    document.querySelectorAll(".modal-backdrop").forEach((bd) => {
      bd.addEventListener("click", (e) => {
        if (e.target === bd) bd.classList.add("hidden");
      });
    });

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      const isEditingText = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !isEditingText) {
        e.preventDefault();
        undoLastAction();
        return;
      }

      if (e.key === "Escape") {
        setIslandExpanded(false);
        clearTouchDraftSlot();
        document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEventId && !isEditingText) {
        e.preventDefault();
        deleteScheduleById(selectedEventId);
      }
    });

    bindTimelineCreationAndDrop();
  }

  /* -------------------- 부트스트랩 -------------------- */

  bindControls();

  (async function bootstrap() {
    try {
      supabaseSession = await PlannerAPI.getSupabaseSession();
      const sb = await PlannerAPI.getSupabaseClient().catch(() => null);
      if (sb) {
        sb.auth.onAuthStateChange((_event, session) => {
          supabaseSession = session || null;
          updateApiBadge();
          updateSupabaseAuthUi();
          if (supabaseSession) {
            setupRealtimeSync(true);
          } else {
            disconnectRealtime();
          }
        });
      }
    } catch {
      supabaseSession = null;
    }

    updateSupabaseAuthUi();
    if (supabaseSession) {
      await loadDay(currentDate);
    } else {
      updateApiBadge();
    }
    setupRealtimeSync();
  })();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncIfChanged(true, { force: true });
      setupRealtimeSync();
    }
  });
  window.addEventListener("focus", () => {
    syncIfChanged(true, { force: true });
  });

  setInterval(() => {
    const curMin = getNowKstMinutes();
    if (curMin !== lastNowRenderMin) {
      renderEvents();
    }
    renderNowState();
    checkBrowserNotifications();

    const now = Date.now();
    const pollInterval = realtimeConnected ? 15000 : 5000;
    if (now - lastIntervalPollAt >= pollInterval) {
      lastIntervalPollAt = now;
      syncIfChanged(true);
    }
  }, 5000);
})();
