(function () {
  const EARLY_END_MIN = 420; // 07:00
  const COLLAPSED_EARLY_HEIGHT = 30;
  const CAT_META = {
    focus: { label: "집중", color: "#3b82f6" },
    meeting: { label: "미팅", color: "#a855f7" },
    personal: { label: "개인", color: "#10b981" },
    youtube: { label: "유튜브", color: "#ef4444" },
    break: { label: "휴식", color: "#64748b" }
  };

  let currentDate = PlannerAPI.formatDateStr(new Date());
  let prefs = PlannerAPI.getPrefs();
  let dayData = null;
  let undoStack = [];
  let selectedEventId = null;
  let activeFilter = "all";
  let activeHtmlDragPayload = null;
  let saveTimer = null;
  let toastTimer = null;

  // DOM 참조
  const el = {
    datePicker: document.getElementById("datePicker"),
    prevDayBtn: document.getElementById("prevDayBtn"),
    nextDayBtn: document.getElementById("nextDayBtn"),
    todayBtn: document.getElementById("todayBtn"),
    nowBanner: document.getElementById("nowBanner"),
    nowBannerLabel: document.getElementById("nowBannerLabel"),
    nowEventTitle: document.getElementById("nowEventTitle"),
    nowEventTime: document.getElementById("nowEventTime"),
    nowProgressBar: document.getElementById("nowProgressBar"),
    nowRemaining: document.getElementById("nowRemaining"),
    nowExtendBtn: document.getElementById("nowExtendBtn"),
    nowDoneBtn: document.getElementById("nowDoneBtn"),
    snapSelect: document.getElementById("snapSelect"),
    zoomRange: document.getElementById("zoomRange"),
    cascadeToggleBtn: document.getElementById("cascadeToggleBtn"),
    reflowBtn: document.getElementById("reflowBtn"),
    undoBtn: document.getElementById("undoBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    syncNowBtn: document.getElementById("syncNowBtn"),
    openApiModalBtn: document.getElementById("openApiModalBtn"),
    apiSourceDot: document.getElementById("apiSourceDot"),
    apiSourceLabel: document.getElementById("apiSourceLabel"),

    stagingDock: document.getElementById("stagingDock"),
    stagedCountBadge: document.getElementById("stagedCountBadge"),
    addStagedForm: document.getElementById("addStagedForm"),
    newStagedTitle: document.getElementById("newStagedTitle"),
    newStagedDuration: document.getElementById("newStagedDuration"),
    newStagedCategory: document.getElementById("newStagedCategory"),
    deferredList: document.getElementById("deferredList"),
    todoList: document.getElementById("todoList"),
    deferredCount: document.getElementById("deferredCount"),
    todoCount: document.getElementById("todoCount"),

    categoryFilterBar: document.getElementById("categoryFilterBar"),
    earlyToggleBtn: document.getElementById("earlyToggleBtn"),
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
    widgetConfigMenu: document.getElementById("widgetConfigMenu"),
    completionPercent: document.getElementById("completionPercent"),
    statTotalHours: document.getElementById("statTotalHours"),
    statDoneHours: document.getElementById("statDoneHours"),
    statRemainingCount: document.getElementById("statRemainingCount"),
    categoryBars: document.getElementById("categoryBars"),
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
    editStart: document.getElementById("editStart"),
    editEnd: document.getElementById("editEnd"),
    editCategory: document.getElementById("editCategory"),
    editPinned: document.getElementById("editPinned"),
    editDone: document.getElementById("editDone"),
    editUrl: document.getElementById("editUrl"),
    editNote: document.getElementById("editNote"),
    deleteEventModalBtn: document.getElementById("deleteEventModalBtn"),

    presetModal: document.getElementById("presetModal"),
    presetManageList: document.getElementById("presetManageList"),
    addPresetForm: document.getElementById("addPresetForm"),
    presetIcon: document.getElementById("presetIcon"),
    presetTitle: document.getElementById("presetTitle"),
    presetDuration: document.getElementById("presetDuration"),
    presetCategory: document.getElementById("presetCategory"),

    apiModal: document.getElementById("apiModal"),
    apiSettingsForm: document.getElementById("apiSettingsForm"),
    gcalFields: document.getElementById("gcalFields"),
    gasFields: document.getElementById("gasFields"),
    supabaseFields: document.getElementById("supabaseFields"),
    gcalCalendarId: document.getElementById("gcalCalendarId"),
    gcalIncludeTasks: document.getElementById("gcalIncludeTasks"),
    gcalAccessToken: document.getElementById("gcalAccessToken"),
    gcalWriteBack: document.getElementById("gcalWriteBack"),
    gasUrl: document.getElementById("gasUrl"),
    gasToken: document.getElementById("gasToken"),
    sbUrl: document.getElementById("sbUrl"),
    sbAnonKey: document.getElementById("sbAnonKey"),
    musePayloadPreview: document.getElementById("musePayloadPreview"),
    copyMusePromptBtn: document.getElementById("copyMusePromptBtn"),
    resetDemoBtn: document.getElementById("resetDemoBtn"),
    toast: document.getElementById("toast")
  };

  /* -------------------- 유틸 -------------------- */

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }

  function snap(min) {
    const step = prefs.snapMin || 15;
    return Math.round(min / step) * step;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function minToTimeStr(totalMin) {
    const m = clamp(Math.round(totalMin), 0, 1440);
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function timeStrToMin(str) {
    const [hh, mm] = (str || "09:00").split(":").map(Number);
    return clamp((hh || 0) * 60 + (mm || 0), 0, 1440);
  }

  function formatDurationLabel(mins) {
    if (mins < 60) return `${mins}분`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}시간 ${m}분` : `${h}시간`;
  }

  function getNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  /* -------------------- 좌표 <-> 시간 변환 -------------------- */

  function minToY(min) {
    if (!prefs.earlyCollapsed) {
      return min * prefs.pxPerMin;
    }
    if (min <= EARLY_END_MIN) {
      return (min / EARLY_END_MIN) * COLLAPSED_EARLY_HEIGHT;
    }
    return COLLAPSED_EARLY_HEIGHT + (min - EARLY_END_MIN) * prefs.pxPerMin;
  }

  function yToMin(y) {
    if (!prefs.earlyCollapsed) {
      return clamp(y / prefs.pxPerMin, 0, 1440);
    }
    if (y <= COLLAPSED_EARLY_HEIGHT) {
      return EARLY_END_MIN;
    }
    return clamp(EARLY_END_MIN + (y - COLLAPSED_EARLY_HEIGHT) / prefs.pxPerMin, EARLY_END_MIN, 1440);
  }

  function getTimelineTotalHeight() {
    if (!prefs.earlyCollapsed) return 1440 * prefs.pxPerMin;
    return COLLAPSED_EARLY_HEIGHT + (1440 - EARLY_END_MIN) * prefs.pxPerMin;
  }

  /* -------------------- Undo & 저장 -------------------- */

  function pushUndo() {
    if (!dayData) return;
    undoStack.push(clone(dayData));
    if (undoStack.length > 25) undoStack.shift();
    el.undoBtn.disabled = undoStack.length === 0;
  }

  function performUndo() {
    if (!undoStack.length) return;
    dayData = undoStack.pop();
    el.undoBtn.disabled = undoStack.length === 0;
    renderAll();
    scheduleSave();
    showToast("이전 상태로 되돌렸습니다.");
  }

  function scheduleSave(changedGcalEvent = null) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await PlannerAPI.saveDayData(currentDate, dayData, changedGcalEvent);
        el.memoSavedHint.textContent = `저장됨 (${minToTimeStr(getNowMinutes())})`;
      } catch (err) {
        showToast(`동기화 오류: ${err.message}`);
      }
    }, 280);
  }

  /* -------------------- 연쇄 밀기 & 재정렬 알고리즘 -------------------- */

  /**
   * 연쇄 밀기(Cascade Shift):
   * anchorId 일정이 늘어나거나 이동해 아래 일정과 겹칠 때,
   * 고정(pinned) 일정은 건드리지 않고 후속 미고정 일정들을 도미노처럼 뒤로 민다.
   */
  function applyCascade(anchorId) {
    if (!prefs.cascadeMode || !dayData) return;
    const anchor = dayData.events.find((e) => e.id === anchorId);
    if (!anchor) return;

    const pinned = dayData.events.filter((e) => e.id !== anchorId && e.pinned);
    const others = dayData.events
      .filter((e) => e.id !== anchorId && !e.pinned)
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    let activeEnd = anchor.endMin;

    for (const ev of others) {
      if (ev.endMin > anchor.startMin && ev.startMin < activeEnd) {
        const dur = ev.endMin - ev.startMin;
        let nextStart = activeEnd;

        // 고정(pinned) 일정과 겹치면 고정 일정 뒤로 점프
        let collided = true;
        while (collided) {
          collided = false;
          for (const p of pinned) {
            if (nextStart < p.endMin && nextStart + dur > p.startMin) {
              nextStart = p.endMin;
              collided = true;
            }
          }
        }

        ev.startMin = clamp(nextStart, 0, 1440 - dur);
        ev.endMin = ev.startMin + dur;
        activeEnd = Math.max(activeEnd, ev.endMin);
      }
    }
  }

  /**
   * 밀린 일정 지금부터 재정렬:
   * 완료되지 않았고 고정되지 않은 일정 중 현재 시각 이전(또는 겹치는) 일정을
   * 현재 시각(스냅 올림) 이후 빈 공간에 순서대로 재배치
   */
  function reflowOverdueFromNow() {
    if (!dayData) return;
    const step = prefs.snapMin || 15;
    const nowSnapped = Math.ceil(getNowMinutes() / step) * step;
    const cursorBase = currentDate === PlannerAPI.formatDateStr(new Date()) ? nowSnapped : 540;

    const fixed = dayData.events.filter((e) => e.pinned || e.done);
    const movable = dayData.events
      .filter((e) => !e.pinned && !e.done)
      .sort((a, b) => a.startMin - b.startMin);

    const hasOverdue = movable.some((e) => e.startMin < cursorBase);
    if (!hasOverdue) {
      showToast("현재 시각 이전에 밀린 미완료 일정이 없습니다.");
      return;
    }

    pushUndo();
    let cursor = cursorBase;

    for (const ev of movable) {
      const dur = ev.endMin - ev.startMin;
      let candidate = Math.max(ev.startMin, cursor);

      let collided = true;
      while (collided) {
        collided = false;
        for (const f of fixed) {
          if (candidate < f.endMin && candidate + dur > f.startMin) {
            candidate = f.endMin;
            collided = true;
          }
        }
      }

      ev.startMin = clamp(candidate, 0, 1440 - dur);
      ev.endMin = ev.startMin + dur;
      cursor = ev.endMin;
    }

    renderAll();
    scheduleSave();
    showToast(`미완료 일정을 ${minToTimeStr(cursorBase)} 기준으로 재정렬했습니다.`);
  }

  /**
   * 겹치는 일정들의 가로 컬럼 배치 계산
   */
  function computeEventColumns(events) {
    const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
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
          colEnds.push(ev.endMin);
        } else {
          colEnds[colIdx] = ev.endMin;
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
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    }
    flushCluster(cluster);
    return layoutMap;
  }

  /**
   * 빈 타임라인 슬롯 자동 탐색 (원클릭 배치용)
   */
  function findNextAvailableSlot(durationMin) {
    const step = prefs.snapMin || 15;
    const isToday = currentDate === PlannerAPI.formatDateStr(new Date());
    const startSearch = isToday ? Math.max(EARLY_END_MIN, Math.ceil(getNowMinutes() / step) * step) : 540;
    const sorted = [...dayData.events].sort((a, b) => a.startMin - b.startMin);

    let candidate = startSearch;
    for (const ev of sorted) {
      if (candidate + durationMin <= ev.startMin) {
        return candidate;
      }
      if (candidate < ev.endMin) {
        candidate = Math.ceil(ev.endMin / step) * step;
      }
    }
    return clamp(candidate, EARLY_END_MIN, 1440 - durationMin);
  }

  /* -------------------- 데이터 로드 & 렌더링 -------------------- */

  async function loadDay(dateStr) {
    currentDate = dateStr;
    el.datePicker.value = dateStr;
    undoStack = [];
    el.undoBtn.disabled = true;
    selectedEventId = null;

    updateApiBadge();
    try {
      dayData = await PlannerAPI.fetchDayData(dateStr);
    } catch (err) {
      showToast(err.message);
      dayData = await PlannerAPI.fetchDayData(dateStr).catch(() => ({
        date: dateStr,
        events: [],
        staged: [],
        youtubeList: [],
        memo: ""
      }));
    }

    renderAll();
    scrollToOptimalPosition();
  }

  function scrollToOptimalPosition() {
    const isToday = currentDate === PlannerAPI.formatDateStr(new Date());
    const targetMin = isToday ? Math.max(EARLY_END_MIN, getNowMinutes() - 90) : 510;
    el.timelineScroll.scrollTop = Math.max(0, minToY(targetMin) - 24);
  }

  function renderAll() {
    if (!dayData) return;
    applyPrefsToUI();
    renderPresets();
    renderStagingDock();
    renderTimelineGrid();
    renderEvents();
    renderNowState();
    renderRightWidgets();
  }

  function applyPrefsToUI() {
    document.documentElement.setAttribute("data-theme", prefs.theme);
    el.themeToggleBtn.textContent = prefs.theme === "dark" ? "☀️ 라이트" : "🌙 다크";
    el.snapSelect.value = String(prefs.snapMin);
    el.zoomRange.value = String(prefs.pxPerMin);
    el.cascadeToggleBtn.classList.toggle("active", prefs.cascadeMode);
    el.earlyToggleBtn.classList.toggle("active", prefs.earlyCollapsed);
    el.earlyToggleBtn.textContent = prefs.earlyCollapsed ? "🌙 새벽 접힘" : "☀️ 전체 24h";

    // 위젯 표시 상태
    Object.entries(prefs.widgets).forEach(([key, visible]) => {
      const card = document.getElementById(`widget-${key}`);
      if (card) card.classList.toggle("hidden", !visible);
      const cb = el.widgetConfigMenu.querySelector(`input[data-widget="${key}"]`);
      if (cb) cb.checked = visible;
    });
  }

  function updateApiBadge() {
    const s = PlannerAPI.getSettings();
    const labelMap = {
      local: "로컬 모드",
      gcal: "Google 캘린더",
      gas: "GAS 자체 API",
      supabase: "Supabase API"
    };
    el.apiSourceDot.className = `source-dot ${s.mode}`;
    el.apiSourceLabel.textContent = labelMap[s.mode] || "로컬 모드";
  }

  /* -------------------- 프리셋 바 -------------------- */

  function renderPresets() {
    el.presetList.innerHTML = "";
    for (const p of prefs.presets) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "preset-pill";
      pill.draggable = true;
      pill.title = "클릭해 자동 배치하거나 타임라인으로 드래그하세요";
      pill.innerHTML = `<span>${p.icon}</span><span>${escapeHtml(p.title)}</span><span style="opacity:.65">${p.durationMin}m</span>`;

      pill.addEventListener("click", () => {
        const startMin = findNextAvailableSlot(p.durationMin);
        pushUndo();
        dayData.events.push({
          id: PlannerAPI.uid("evt"),
          title: `${p.icon} ${p.title}`,
          startMin,
          endMin: Math.min(1440, startMin + p.durationMin),
          category: p.category,
          done: false,
          pinned: false,
          note: "",
          source: "local",
          url: ""
        });
        renderAll();
        scheduleSave();
        showToast(`${minToTimeStr(startMin)}에 '${p.title}' 블록을 추가했습니다.`);
      });

      pill.addEventListener("dragstart", (e) => {
        activeHtmlDragPayload = {
          kind: "preset",
          title: `${p.icon} ${p.title}`,
          durationMin: p.durationMin,
          category: p.category
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

  /* -------------------- 좌측 Staging Dock -------------------- */

  function renderStagingDock() {
    const deferred = dayData.staged.filter((s) => s.status === "deferred");
    const todos = dayData.staged.filter((s) => s.status !== "deferred");

    el.stagedCountBadge.textContent = String(dayData.staged.length);
    el.deferredCount.textContent = String(deferred.length);
    el.todoCount.textContent = String(todos.length);

    renderStagedList(el.deferredList, deferred, "보류한 일정이 없습니다.");
    renderStagedList(el.todoList, todos, "미배치 할 일을 추가해 보세요.");
  }

  function renderStagedList(container, items, emptyText) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<div class="empty-hint">${emptyText}</div>`;
      return;
    }

    for (const item of items) {
      const card = document.createElement("div");
      card.className = `dock-card ${item.done ? "is-done" : ""}`;
      card.dataset.cat = item.category;
      card.draggable = true;

      card.innerHTML = `
        <div class="dock-card-top">
          <input type="checkbox" class="event-check" ${item.done ? "checked" : ""} title="완료 체크" />
          <div class="dock-card-title">${escapeHtml(item.title)}</div>
        </div>
        <div class="dock-card-meta">
          <span>${CAT_META[item.category]?.label || "기타"} · ${item.durationMin}분</span>
          <div class="dock-card-actions">
            <button type="button" class="mini-btn place-btn" title="빈 시간에 바로 배치">📅 배치</button>
            <button type="button" class="mini-btn del del-btn" title="삭제">✕</button>
          </div>
        </div>
      `;

      card.querySelector(".event-check").addEventListener("change", (e) => {
        pushUndo();
        item.done = e.target.checked;
        renderStagingDock();
        scheduleSave();
      });

      card.querySelector(".place-btn").addEventListener("click", () => {
        placeStagedItemAt(item.id, findNextAvailableSlot(item.durationMin));
      });

      card.querySelector(".del-btn").addEventListener("click", () => {
        pushUndo();
        dayData.staged = dayData.staged.filter((s) => s.id !== item.id);
        renderStagingDock();
        scheduleSave();
      });

      card.addEventListener("dragstart", (e) => {
        activeHtmlDragPayload = {
          kind: "staged",
          id: item.id,
          title: item.title,
          durationMin: item.durationMin,
          category: item.category
        };
        e.dataTransfer.setData("text/plain", JSON.stringify(activeHtmlDragPayload));
      });
      card.addEventListener("dragend", () => {
        activeHtmlDragPayload = null;
        el.ghostPreview.classList.add("hidden");
      });

      container.appendChild(card);
    }
  }

  function placeStagedItemAt(stagedId, startMin) {
    const idx = dayData.staged.findIndex((s) => s.id === stagedId);
    if (idx === -1) return;
    pushUndo();
    const [item] = dayData.staged.splice(idx, 1);
    const ev = {
      id: PlannerAPI.uid("evt"),
      title: item.title,
      startMin: clamp(startMin, 0, 1440 - item.durationMin),
      endMin: clamp(startMin + item.durationMin, 15, 1440),
      category: item.category,
      done: item.done,
      pinned: false,
      note: item.note || "",
      source: "local",
      url: ""
    };
    dayData.events.push(ev);
    if (prefs.cascadeMode) applyCascade(ev.id);
    renderAll();
    scheduleSave();
  }

  /* -------------------- 중앙 타임라인 눈금 & 블록 -------------------- */

  function renderTimelineGrid() {
    const totalH = getTimelineTotalHeight();
    el.timelineGrid.style.height = `${totalH}px`;
    el.hourRowsLayer.innerHTML = "";

    if (prefs.earlyCollapsed) {
      const earlyCount = dayData.events.filter((e) => e.startMin < EARLY_END_MIN).length;
      const banner = document.createElement("div");
      banner.className = "early-collapsed-banner";
      banner.style.height = `${COLLAPSED_EARLY_HEIGHT}px`;
      banner.innerHTML = `<span>🌙 새벽 00:00 ~ 07:00 접힘 (클릭해 펼치기${earlyCount ? ` · 일정 ${earlyCount}개` : ""})</span>`;
      banner.addEventListener("click", () => {
        prefs.earlyCollapsed = false;
        PlannerAPI.savePrefs(prefs);
        renderAll();
      });
      el.hourRowsLayer.appendChild(banner);
    }

    const startHour = prefs.earlyCollapsed ? 7 : 0;
    const hourPx = 60 * prefs.pxPerMin;
    for (let h = startHour; h < 24; h++) {
      const row = document.createElement("div");
      row.className = "hour-row";
      row.style.height = `${hourPx}px`;
      row.innerHTML = `<span class="hour-label">${String(h).padStart(2, "0")}:00</span>`;
      el.hourRowsLayer.appendChild(row);
    }
  }

  function renderEvents() {
    el.eventsLayer.innerHTML = "";
    const nowMin = getNowMinutes();
    const isToday = currentDate === PlannerAPI.formatDateStr(new Date());

    const visibleEvents = dayData.events.filter((ev) => {
      if (prefs.earlyCollapsed && ev.endMin <= EARLY_END_MIN) return false;
      return true;
    });

    const cols = computeEventColumns(visibleEvents);

    for (const ev of visibleEvents) {
      const visualStart = prefs.earlyCollapsed ? Math.max(EARLY_END_MIN, ev.startMin) : ev.startMin;
      const top = minToY(visualStart);
      const bottom = minToY(ev.endMin);
      const height = Math.max(24, bottom - top);
      const layout = cols.get(ev.id) || { col: 0, totalCols: 1 };
      const widthPct = 100 / layout.totalCols;
      const leftPct = layout.col * widthPct;

      const isNow = isToday && !ev.done && ev.startMin <= nowMin && nowMin < ev.endMin;
      const isFilteredOut = activeFilter !== "all" && ev.category !== activeFilter;

      const block = document.createElement("div");
      block.className = [
        "event-block",
        `cat-${ev.category}`,
        isNow ? "is-now" : "",
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

      const dur = ev.endMin - ev.startMin;
      const srcBadge =
        ev.source === "gcal"
          ? `<span class="badge-src">GCal</span>`
          : ev.source === "muse"
          ? `<span class="badge-src">Muse</span>`
          : "";

      block.innerHTML = `
        <div class="resize-handle top" title="위로 끌어 시작 시간 조절"></div>
        <div class="event-top-row">
          <input type="checkbox" class="event-check" ${ev.done ? "checked" : ""} title="완료 체크" />
          <span class="event-title">${ev.pinned ? "🔒 " : ""}${escapeHtml(ev.title)}</span>
          <div class="event-badges">
            ${isNow ? `<span class="badge-now">NOW</span>` : ""}
            ${srcBadge}
          </div>
        </div>
        <div class="event-sub-row">
          <span class="event-time-text">${minToTimeStr(ev.startMin)} - ${minToTimeStr(ev.endMin)} (${dur}분)</span>
          <div class="event-quick-actions">
            <button type="button" class="q-btn" data-act="minus15" title="15분 줄이기">-15m</button>
            <button type="button" class="q-btn" data-act="plus15" title="15분 늘리기">+15m</button>
            <button type="button" class="q-btn" data-act="plus30" title="30분 늘리기">+30m</button>
            <button type="button" class="q-btn ${ev.pinned ? "active" : ""}" data-act="pin" title="고정 토글">🔒</button>
            <button type="button" class="q-btn" data-act="defer" title="보류함으로 빼기">📥</button>
            <button type="button" class="q-btn" data-act="edit" title="세부 편집">✏️</button>
          </div>
        </div>
        <div class="resize-handle bottom" title="아래로 끌어 종료 시간 조절"></div>
      `;

      // 체크박스 완료 토글
      block.querySelector(".event-check").addEventListener("change", (e) => {
        e.stopPropagation();
        toggleEventDone(ev.id, e.target.checked);
      });

      // 퀵 액션 버튼들
      block.querySelectorAll(".q-btn").forEach((btn) => {
        btn.addEventListener("pointerdown", (e) => e.stopPropagation());
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          handleQuickAction(ev.id, btn.dataset.act);
        });
      });

      // 더블클릭 편집
      block.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openEventModal(ev.id);
      });

      // 포인터 기반 이동 & 상하 리사이즈 연결
      bindEventPointerInteractions(block, ev);

      el.eventsLayer.appendChild(block);
    }
  }

  function toggleEventDone(eventId, checked) {
    const ev = dayData.events.find((e) => e.id === eventId);
    if (!ev) return;
    pushUndo();
    ev.done = checked;
    // 연결된 유튜브 항목이 있으면 함께 상태 반영
    if (ev.youtubeId) {
      const yt = dayData.youtubeList.find((y) => y.id === ev.youtubeId);
      if (yt) yt.done = checked;
    }
    renderAll();
    scheduleSave(ev.source === "gcal" ? ev : null);
  }

  function handleQuickAction(eventId, action) {
    const ev = dayData.events.find((e) => e.id === eventId);
    if (!ev) return;

    if (action === "edit") {
      openEventModal(eventId);
      return;
    }

    pushUndo();

    if (action === "minus15") {
      ev.endMin = Math.max(ev.startMin + 15, ev.endMin - 15);
    } else if (action === "plus15") {
      ev.endMin = Math.min(1440, ev.endMin + 15);
      if (prefs.cascadeMode) applyCascade(ev.id);
    } else if (action === "plus30") {
      ev.endMin = Math.min(1440, ev.endMin + 30);
      if (prefs.cascadeMode) applyCascade(ev.id);
    } else if (action === "pin") {
      ev.pinned = !ev.pinned;
      showToast(ev.pinned ? "🔒 시간을 고정했습니다." : "고정을 해제했습니다.");
    } else if (action === "defer") {
      dayData.events = dayData.events.filter((e) => e.id !== eventId);
      dayData.staged.unshift({
        id: PlannerAPI.uid("stg"),
        title: ev.title,
        durationMin: ev.endMin - ev.startMin,
        category: ev.category,
        done: ev.done,
        status: "deferred",
        note: ev.note
      });
      showToast("일정을 좌측 보류함으로 옮겼습니다.");
      renderAll();
      scheduleSave();
      return;
    }

    renderAll();
    scheduleSave(ev.source === "gcal" ? ev : null);
  }

  /* -------------------- 60fps 포인터 드래그 & 상하 리사이즈 -------------------- */

  function bindEventPointerInteractions(block, ev) {
    const topHandle = block.querySelector(".resize-handle.top");
    const bottomHandle = block.querySelector(".resize-handle.bottom");

    const startPointerOp = (mode, downEvent) => {
      if (downEvent.button !== 0) return;
      if (downEvent.target.closest("input, button")) return;
      downEvent.stopPropagation();

      selectedEventId = ev.id;
      const startClientY = downEvent.clientY;
      const origStart = ev.startMin;
      const origEnd = ev.endMin;
      const dur = origEnd - origStart;
      let hasMoved = false;
      let previewStart = origStart;
      let previewEnd = origEnd;
      let droppingToDock = false;

      const timeSpan = block.querySelector(".event-time-text");

      const onMove = (moveEvent) => {
        const dy = moveEvent.clientY - startClientY;
        const dx = Math.abs(moveEvent.clientX - downEvent.clientX);
        if (!hasMoved && Math.abs(dy) < 4 && dx < 4) return;
        hasMoved = true;
        block.classList.add("is-dragging");

        const deltaMin = snap(dy / prefs.pxPerMin);
        const minBound = prefs.earlyCollapsed ? EARLY_END_MIN : 0;

        if (mode === "move") {
          previewStart = clamp(origStart + deltaMin, minBound, 1440 - dur);
          previewEnd = previewStart + dur;

          // 좌측 Staging Dock 위로 드래그 중인지 감지
          const dockRect = el.stagingDock.getBoundingClientRect();
          droppingToDock =
            moveEvent.clientX >= dockRect.left &&
            moveEvent.clientX <= dockRect.right &&
            moveEvent.clientY >= dockRect.top &&
            moveEvent.clientY <= dockRect.bottom;
          el.stagingDock.classList.toggle("drop-active", droppingToDock);
        } else if (mode === "resize-bottom") {
          previewEnd = clamp(origEnd + deltaMin, origStart + (prefs.snapMin || 15), 1440);
        } else if (mode === "resize-top") {
          previewStart = clamp(origStart + deltaMin, minBound, origEnd - (prefs.snapMin || 15));
        }

        const visualStart = prefs.earlyCollapsed ? Math.max(EARLY_END_MIN, previewStart) : previewStart;
        const top = minToY(visualStart);
        const height = Math.max(24, minToY(previewEnd) - top);
        block.style.top = `${top}px`;
        block.style.height = `${height - 2}px`;
        if (timeSpan) {
          timeSpan.textContent = `${minToTimeStr(previewStart)} - ${minToTimeStr(previewEnd)} (${previewEnd - previewStart}분)`;
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        block.classList.remove("is-dragging");
        el.stagingDock.classList.remove("drop-active");

        if (!hasMoved) {
          renderEvents();
          return;
        }

        if (droppingToDock) {
          pushUndo();
          dayData.events = dayData.events.filter((e) => e.id !== ev.id);
          dayData.staged.unshift({
            id: PlannerAPI.uid("stg"),
            title: ev.title,
            durationMin: origEnd - origStart,
            category: ev.category,
            done: ev.done,
            status: "deferred",
            note: ev.note
          });
          showToast("보류함으로 이동했습니다.");
          renderAll();
          scheduleSave();
          return;
        }

        if (previewStart !== origStart || previewEnd !== origEnd) {
          pushUndo();
          ev.startMin = previewStart;
          ev.endMin = previewEnd;
          if (prefs.cascadeMode) {
            applyCascade(ev.id);
          }
          renderAll();
          scheduleSave(ev.source === "gcal" ? ev : null);
        } else {
          renderEvents();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    topHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-top", e));
    bottomHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-bottom", e));
    block.addEventListener("pointerdown", (e) => startPointerOp("move", e));
  }

  /* -------------------- 빈 타임라인 드래그 생성 & 외부 카드 드롭 -------------------- */

  function bindTimelineCreationAndDrop() {
    // 1) 빈 타임라인 드래그해서 새 일정 생성
    el.hourRowsLayer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".early-collapsed-banner")) return;

      const gridRect = el.timelineGrid.getBoundingClientRect();
      const startY = e.clientY - gridRect.top;
      const anchorMin = snap(yToMin(startY));
      const step = prefs.snapMin || 15;
      let curEndMin = Math.min(1440, anchorMin + Math.max(30, step));
      let curStartMin = anchorMin;
      let dragged = false;

      const updateGhost = () => {
        const top = minToY(curStartMin);
        const h = Math.max(20, minToY(curEndMin) - top);
        el.ghostPreview.style.top = `${top}px`;
        el.ghostPreview.style.height = `${h}px`;
        el.ghostPreview.textContent = `+ 새 일정: ${minToTimeStr(curStartMin)} ~ ${minToTimeStr(curEndMin)} (${curEndMin - curStartMin}분)`;
        el.ghostPreview.classList.remove("hidden");
      };

      const onMove = (mv) => {
        if (Math.abs(mv.clientY - e.clientY) > 6) dragged = true;
        if (!dragged) return;
        const y = mv.clientY - el.timelineGrid.getBoundingClientRect().top;
        const hoveredMin = snap(yToMin(y));
        curStartMin = Math.min(anchorMin, hoveredMin);
        curEndMin = clamp(Math.max(anchorMin, hoveredMin) + step, curStartMin + step, 1440);
        updateGhost();
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        el.ghostPreview.classList.add("hidden");

        if (!dragged) {
          curStartMin = anchorMin;
          curEndMin = Math.min(1440, anchorMin + 30);
        }
        openNewEventModal(curStartMin, curEndMin);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // 2) 좌측/우측/프리셋 HTML5 드래그 드롭 수신
    el.timelineScroll.addEventListener("dragover", (e) => {
      if (!activeHtmlDragPayload) return;
      e.preventDefault();
      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(snap(yToMin(y)), prefs.earlyCollapsed ? EARLY_END_MIN : 0, 1440 - activeHtmlDragPayload.durationMin);
      const dropEnd = dropStart + activeHtmlDragPayload.durationMin;
      const top = minToY(dropStart);
      const h = Math.max(22, minToY(dropEnd) - top);

      el.ghostPreview.style.top = `${top}px`;
      el.ghostPreview.style.height = `${h}px`;
      el.ghostPreview.textContent = `📥 ${activeHtmlDragPayload.title} (${minToTimeStr(dropStart)} ~ ${minToTimeStr(dropEnd)})`;
      el.ghostPreview.classList.remove("hidden");
    });

    el.timelineScroll.addEventListener("dragleave", (e) => {
      if (!el.timelineScroll.contains(e.relatedTarget)) {
        el.ghostPreview.classList.add("hidden");
      }
    });

    el.timelineScroll.addEventListener("drop", (e) => {
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

      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(
        snap(yToMin(y)),
        prefs.earlyCollapsed ? EARLY_END_MIN : 0,
        1440 - (payload.durationMin || 30)
      );

      if (payload.kind === "staged") {
        placeStagedItemAt(payload.id, dropStart);
      } else if (payload.kind === "youtube") {
        scheduleYoutubeItemAt(payload.id, dropStart);
      } else if (payload.kind === "preset") {
        pushUndo();
        const ev = {
          id: PlannerAPI.uid("evt"),
          title: payload.title,
          startMin: dropStart,
          endMin: Math.min(1440, dropStart + payload.durationMin),
          category: payload.category,
          done: false,
          pinned: false,
          note: "",
          source: "local",
          url: ""
        };
        dayData.events.push(ev);
        if (prefs.cascadeMode) applyCascade(ev.id);
        renderAll();
        scheduleSave();
      }
      activeHtmlDragPayload = null;
    });
  }

  /* -------------------- 현재 시각 Now Line & 상단 배너 -------------------- */

  function renderNowState() {
    const nowMin = getNowMinutes();
    const isToday = currentDate === PlannerAPI.formatDateStr(new Date());

    // Now Line 위치
    if (isToday) {
      el.nowLine.classList.remove("hidden");
      el.nowLine.style.top = `${minToY(nowMin)}px`;
      el.nowLineBadge.textContent = minToTimeStr(nowMin);
    } else {
      el.nowLine.classList.add("hidden");
    }

    // 지금 하는 일 배너
    if (!dayData) return;
    const activeEv = isToday
      ? dayData.events.find((e) => !e.done && e.startMin <= nowMin && nowMin < e.endMin)
      : null;

    if (activeEv) {
      const total = Math.max(1, activeEv.endMin - activeEv.startMin);
      const elapsed = clamp(nowMin - activeEv.startMin, 0, total);
      const pct = Math.round((elapsed / total) * 100);
      const remain = Math.max(0, activeEv.endMin - nowMin);

      el.nowBanner.classList.add("is-active");
      el.nowBannerLabel.textContent = "NOW";
      el.nowEventTitle.textContent = activeEv.title;
      el.nowEventTime.textContent = `${minToTimeStr(activeEv.startMin)} ~ ${minToTimeStr(activeEv.endMin)}`;
      el.nowProgressBar.style.width = `${pct}%`;
      el.nowRemaining.textContent = `${remain}분 남음`;
      el.nowExtendBtn.classList.remove("hidden");
      el.nowDoneBtn.classList.remove("hidden");

      el.nowExtendBtn.onclick = () => handleQuickAction(activeEv.id, "plus15");
      el.nowDoneBtn.onclick = () => toggleEventDone(activeEv.id, true);
    } else {
      el.nowBanner.classList.remove("is-active");
      el.nowProgressBar.style.width = "0%";
      el.nowExtendBtn.classList.add("hidden");
      el.nowDoneBtn.classList.add("hidden");

      const nextEv = isToday
        ? dayData.events
            .filter((e) => !e.done && e.startMin > nowMin)
            .sort((a, b) => a.startMin - b.startMin)[0]
        : null;

      if (nextEv) {
        el.nowBannerLabel.textContent = "NEXT";
        el.nowEventTitle.textContent = nextEv.title;
        el.nowEventTime.textContent = `${minToTimeStr(nextEv.startMin)} 시작`;
        el.nowRemaining.textContent = `${nextEv.startMin - nowMin}분 뒤`;
      } else {
        el.nowBannerLabel.textContent = isToday ? "FREE" : currentDate;
        el.nowEventTitle.textContent = isToday ? "현재 진행 중인 일정이 없습니다" : "선택한 날짜의 일정을 보고 있습니다";
        el.nowEventTime.textContent = "빈 시간을 클릭하거나 왼쪽에서 드래그해 추가하세요";
        el.nowRemaining.textContent = "";
      }
    }
  }

  /* -------------------- 우측 커스텀 위젯 -------------------- */

  function renderRightWidgets() {
    // 1) 시간 요약 위젯
    const totalMin = dayData.events.reduce((acc, e) => acc + (e.endMin - e.startMin), 0);
    const doneMin = dayData.events.filter((e) => e.done).reduce((acc, e) => acc + (e.endMin - e.startMin), 0);
    const remainCount = dayData.events.filter((e) => !e.done).length;
    const pct = totalMin ? Math.round((doneMin / totalMin) * 100) : 0;

    el.completionPercent.textContent = `${pct}%`;
    el.statTotalHours.textContent = `${(totalMin / 60).toFixed(1)}h`;
    el.statDoneHours.textContent = `${(doneMin / 60).toFixed(1)}h`;
    el.statRemainingCount.textContent = `${remainCount}개`;

    const catTotals = {};
    for (const key of Object.keys(CAT_META)) catTotals[key] = 0;
    for (const e of dayData.events) {
      catTotals[e.category] = (catTotals[e.category] || 0) + (e.endMin - e.startMin);
    }

    el.categoryBars.innerHTML = "";
    for (const [key, meta] of Object.entries(CAT_META)) {
      const mins = catTotals[key] || 0;
      const ratio = totalMin ? Math.round((mins / totalMin) * 100) : 0;
      const row = document.createElement("div");
      row.className = "cat-bar-row";
      row.innerHTML = `
        <span class="cat-bar-label">${meta.label}</span>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${ratio}%; background:${meta.color}"></div>
        </div>
        <span class="cat-bar-time">${formatDurationLabel(mins)}</span>
      `;
      el.categoryBars.appendChild(row);
    }

    // 2) 유튜브 볼 리스트 위젯
    renderYoutubeList();

    // 3) 퀵 메모
    if (document.activeElement !== el.dailyMemo) {
      el.dailyMemo.value = dayData.memo || "";
    }
  }

  function renderYoutubeList() {
    el.ytCountBadge.textContent = String(dayData.youtubeList.length);
    el.youtubeList.innerHTML = "";

    if (!dayData.youtubeList.length) {
      el.youtubeList.innerHTML = `<div class="empty-hint">볼 유튜브 영상을 추가해 보세요</div>`;
      return;
    }

    for (const yt of dayData.youtubeList) {
      const card = document.createElement("div");
      card.className = `yt-card ${yt.done ? "is-done" : ""}`;
      card.draggable = true;
      card.innerHTML = `
        <div class="yt-card-top">
          <input type="checkbox" class="event-check" ${yt.done ? "checked" : ""} />
          <div class="yt-title">${escapeHtml(yt.title)}</div>
        </div>
        <div class="yt-card-bottom">
          <span>${yt.durationMin}분 · ${escapeHtml(yt.addedBy || "직접")}</span>
          <div class="dock-card-actions">
            ${yt.url ? `<a href="${escapeAttr(yt.url)}" target="_blank" rel="noopener" class="mini-btn yt-link">열기</a>` : ""}
            <button type="button" class="mini-btn schedule-yt-btn" title="빈 시간에 시청 블록 잡기">📅</button>
            <button type="button" class="mini-btn del del-yt-btn">✕</button>
          </div>
        </div>
      `;

      card.querySelector(".event-check").addEventListener("change", (e) => {
        pushUndo();
        yt.done = e.target.checked;
        renderYoutubeList();
        scheduleSave();
      });

      card.querySelector(".schedule-yt-btn").addEventListener("click", () => {
        scheduleYoutubeItemAt(yt.id, findNextAvailableSlot(yt.durationMin));
      });

      card.querySelector(".del-yt-btn").addEventListener("click", () => {
        pushUndo();
        dayData.youtubeList = dayData.youtubeList.filter((y) => y.id !== yt.id);
        renderYoutubeList();
        scheduleSave();
      });

      card.addEventListener("dragstart", (e) => {
        activeHtmlDragPayload = {
          kind: "youtube",
          id: yt.id,
          title: `📺 ${yt.title}`,
          durationMin: yt.durationMin,
          category: "youtube"
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

  function scheduleYoutubeItemAt(ytId, startMin) {
    const yt = dayData.youtubeList.find((y) => y.id === ytId);
    if (!yt) return;
    pushUndo();
    const ev = {
      id: PlannerAPI.uid("evt"),
      title: `📺 ${yt.title}`,
      startMin: clamp(startMin, 0, 1440 - yt.durationMin),
      endMin: clamp(startMin + yt.durationMin, 15, 1440),
      category: "youtube",
      done: yt.done,
      pinned: false,
      note: yt.url ? `링크: ${yt.url}` : "",
      source: "local",
      url: yt.url || "",
      youtubeId: yt.id
    };
    dayData.events.push(ev);
    if (prefs.cascadeMode) applyCascade(ev.id);
    renderAll();
    scheduleSave();
    showToast(`${minToTimeStr(ev.startMin)}에 유튜브 시청 일정을 잡았습니다.`);
  }

  /* -------------------- 모달: 일정 생성/수정 -------------------- */

  function openNewEventModal(startMin = 600, endMin = 660) {
    el.eventModalTitle.textContent = "새 일정 추가";
    el.editEventId.value = "";
    el.editTitle.value = "";
    el.editStart.value = minToTimeStr(Math.min(1439, startMin));
    el.editEnd.value = minToTimeStr(Math.min(1439, endMin));
    el.editCategory.value = "focus";
    el.editPinned.checked = false;
    el.editDone.checked = false;
    el.editUrl.value = "";
    el.editNote.value = "";
    el.deleteEventModalBtn.classList.add("hidden");
    el.eventModal.classList.remove("hidden");
    setTimeout(() => el.editTitle.focus(), 40);
  }

  function openEventModal(eventId) {
    const ev = dayData.events.find((e) => e.id === eventId);
    if (!ev) return;
    el.eventModalTitle.textContent = "일정 세부 편집";
    el.editEventId.value = ev.id;
    el.editTitle.value = ev.title;
    el.editStart.value = minToTimeStr(Math.min(1439, ev.startMin));
    el.editEnd.value = minToTimeStr(Math.min(1439, ev.endMin));
    el.editCategory.value = ev.category;
    el.editPinned.checked = ev.pinned;
    el.editDone.checked = ev.done;
    el.editUrl.value = ev.url || "";
    el.editNote.value = ev.note || "";
    el.deleteEventModalBtn.classList.remove("hidden");
    el.eventModal.classList.remove("hidden");
    setTimeout(() => el.editTitle.focus(), 40);
  }

  /* -------------------- 모달: 커스텀 프리셋 관리 -------------------- */

  function renderPresetManager() {
    el.presetManageList.innerHTML = "";
    prefs.presets.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "preset-manage-item";
      row.innerHTML = `
        <span>${p.icon} <strong>${escapeHtml(p.title)}</strong> (${p.durationMin}분 · ${CAT_META[p.category]?.label || p.category})</span>
        <button type="button" class="mini-btn del">삭제</button>
      `;
      row.querySelector(".del").addEventListener("click", () => {
        prefs.presets.splice(idx, 1);
        PlannerAPI.savePrefs(prefs);
        renderPresetManager();
        renderPresets();
      });
      el.presetManageList.appendChild(row);
    });
  }

  /* -------------------- 모달: API 설정 -------------------- */

  function openApiSettingsModal() {
    const s = PlannerAPI.getSettings();
    const radio = el.apiSettingsForm.querySelector(`input[name="apiMode"][value="${s.mode}"]`);
    if (radio) radio.checked = true;

    el.gcalCalendarId.value = s.gcalCalendarId || "primary";
    el.gcalIncludeTasks.value = s.gcalIncludeTasks || "true";
    el.gcalAccessToken.value = s.gcalAccessToken || "";
    el.gcalWriteBack.value = s.gcalWriteBack || "false";
    el.gasUrl.value = s.gasUrl || "";
    el.gasToken.value = s.gasToken || "";
    el.sbUrl.value = s.sbUrl || "";
    el.sbAnonKey.value = s.sbAnonKey || "";

    toggleProviderFields(s.mode);
    updateMuseSnippet();
    el.apiModal.classList.remove("hidden");
  }

  function toggleProviderFields(mode) {
    el.gcalFields.classList.toggle("hidden", mode !== "gcal");
    el.gasFields.classList.toggle("hidden", mode !== "gas");
    el.supabaseFields.classList.toggle("hidden", mode !== "supabase");
  }

  function updateMuseSnippet() {
    const sample = {
      action: "upsertEvent",
      token: el.gasToken.value || "YOUR_SECRET_TOKEN",
      date: currentDate,
      event: {
        title: "Muse가 추천한 저녁 복습",
        startMin: 1200,
        endMin: 1245,
        category: "focus",
        pinned: false,
        note: "자동 등록"
      }
    };
    el.musePayloadPreview.textContent = JSON.stringify(sample, null, 2);
  }

  /* -------------------- HTML Escaping -------------------- */

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

  /* -------------------- 이벤트 바인딩 초기화 -------------------- */

  function bindControls() {
    // 날짜 이동
    el.datePicker.addEventListener("change", (e) => {
      if (e.target.value) loadDay(e.target.value);
    });

    const shiftDay = (delta) => {
      const [y, m, d] = currentDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d + delta);
      loadDay(PlannerAPI.formatDateStr(dt));
    };
    el.prevDayBtn.addEventListener("click", () => shiftDay(-1));
    el.nextDayBtn.addEventListener("click", () => shiftDay(1));
    el.todayBtn.addEventListener("click", () => loadDay(PlannerAPI.formatDateStr(new Date())));

    // 상단 컨트롤
    el.snapSelect.addEventListener("change", (e) => {
      prefs.snapMin = Number(e.target.value);
      PlannerAPI.savePrefs(prefs);
      showToast(`스냅 간격: ${prefs.snapMin}분`);
    });

    el.zoomRange.addEventListener("input", (e) => {
      prefs.pxPerMin = Number(e.target.value);
      PlannerAPI.savePrefs(prefs);
      renderTimelineGrid();
      renderEvents();
      renderNowState();
    });

    el.cascadeToggleBtn.addEventListener("click", () => {
      prefs.cascadeMode = !prefs.cascadeMode;
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.cascadeMode ? "🔗 연쇄 밀기 켜짐" : "연쇄 밀기 꺼짐");
    });

    el.earlyToggleBtn.addEventListener("click", () => {
      prefs.earlyCollapsed = !prefs.earlyCollapsed;
      PlannerAPI.savePrefs(prefs);
      renderAll();
    });

    el.reflowBtn.addEventListener("click", reflowOverdueFromNow);
    el.undoBtn.addEventListener("click", performUndo);

    el.themeToggleBtn.addEventListener("click", () => {
      prefs.theme = prefs.theme === "dark" ? "light" : "dark";
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.theme === "light" ? "라이트 모드로 전환했습니다" : "다크 모드로 전환했습니다");
    });

    el.syncNowBtn.addEventListener("click", () => {
      loadDay(currentDate).then(() => showToast("데이터를 새로고침했습니다."));
    });

    // 카테고리 필터
    el.categoryFilterBar.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.cat;
        el.categoryFilterBar.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderEvents();
      });
    });

    // 새 일정 버튼
    el.addEventBtn.addEventListener("click", () => {
      const next = findNextAvailableSlot(60);
      openNewEventModal(next, Math.min(1440, next + 60));
    });

    // 좌측 할 일 빠르게 추가
    el.addStagedForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = el.newStagedTitle.value.trim();
      if (!title) return;
      pushUndo();
      dayData.staged.unshift({
        id: PlannerAPI.uid("stg"),
        title,
        durationMin: Number(el.newStagedDuration.value),
        category: el.newStagedCategory.value,
        done: false,
        status: "todo",
        note: ""
      });
      el.newStagedTitle.value = "";
      renderStagingDock();
      scheduleSave();
    });

    // 우측 유튜브 볼 리스트 추가
    el.addYoutubeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = el.newYtTitle.value.trim();
      if (!title) return;
      pushUndo();
      dayData.youtubeList.unshift({
        id: PlannerAPI.uid("yt"),
        title,
        url: el.newYtUrl.value.trim(),
        durationMin: Number(el.newYtDuration.value),
        done: false,
        addedBy: "직접 추가"
      });
      el.newYtTitle.value = "";
      el.newYtUrl.value = "";
      renderYoutubeList();
      scheduleSave();
    });

    // 메모 자동 저장
    el.dailyMemo.addEventListener("input", (e) => {
      dayData.memo = e.target.value;
      el.memoSavedHint.textContent = "저장 중...";
      scheduleSave();
    });

    // 우측 위젯 커스텀 메뉴
    el.widgetConfigBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      el.widgetConfigMenu.classList.toggle("hidden");
    });

    el.widgetConfigMenu.querySelectorAll("input[data-widget]").forEach((cb) => {
      cb.addEventListener("change", () => {
        prefs.widgets[cb.dataset.widget] = cb.checked;
        PlannerAPI.savePrefs(prefs);
        applyPrefsToUI();
      });
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#widgetConfigMenu") && !e.target.closest("#widgetConfigBtn")) {
        el.widgetConfigMenu.classList.add("hidden");
      }
      if (!e.target.closest(".event-block") && selectedEventId) {
        selectedEventId = null;
        renderEvents();
      }
    });

    // 일정 편집 모달 저장
    el.eventForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = el.editEventId.value;
      const startMin = timeStrToMin(el.editStart.value);
      let endMin = timeStrToMin(el.editEnd.value);
      if (endMin <= startMin) endMin = Math.min(1440, startMin + 15);

      pushUndo();
      let gcalEv = null;
      if (id) {
        const ev = dayData.events.find((item) => item.id === id);
        if (ev) {
          ev.title = el.editTitle.value.trim() || "(제목 없음)";
          ev.startMin = startMin;
          ev.endMin = endMin;
          ev.category = el.editCategory.value;
          ev.pinned = el.editPinned.checked;
          ev.done = el.editDone.checked;
          ev.url = el.editUrl.value.trim();
          ev.note = el.editNote.value;
          if (prefs.cascadeMode) applyCascade(ev.id);
          if (ev.source === "gcal") gcalEv = ev;
        }
      } else {
        const newEv = {
          id: PlannerAPI.uid("evt"),
          title: el.editTitle.value.trim() || "(제목 없음)",
          startMin,
          endMin,
          category: el.editCategory.value,
          pinned: el.editPinned.checked,
          done: el.editDone.checked,
          url: el.editUrl.value.trim(),
          note: el.editNote.value,
          source: "local"
        };
        dayData.events.push(newEv);
        if (prefs.cascadeMode) applyCascade(newEv.id);
      }

      el.eventModal.classList.add("hidden");
      renderAll();
      scheduleSave(gcalEv);
    });

    el.deleteEventModalBtn.addEventListener("click", () => {
      const id = el.editEventId.value;
      if (!id) return;
      pushUndo();
      dayData.events = dayData.events.filter((e) => e.id !== id);
      el.eventModal.classList.add("hidden");
      renderAll();
      scheduleSave();
      showToast("일정을 삭제했습니다.");
    });

    // 커스텀 프리셋 관리 모달
    el.editPresetsBtn.addEventListener("click", () => {
      renderPresetManager();
      el.presetModal.classList.remove("hidden");
    });

    el.addPresetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = el.presetTitle.value.trim();
      if (!title) return;
      prefs.presets.push({
        id: PlannerAPI.uid("pre"),
        icon: el.presetIcon.value.trim() || "⚡",
        title,
        durationMin: Number(el.presetDuration.value),
        category: el.presetCategory.value
      });
      PlannerAPI.savePrefs(prefs);
      el.presetTitle.value = "";
      renderPresetManager();
      renderPresets();
    });

    // API 설정 모달
    el.openApiModalBtn.addEventListener("click", openApiSettingsModal);
    el.apiSettingsForm.querySelectorAll('input[name="apiMode"]').forEach((radio) => {
      radio.addEventListener("change", () => toggleProviderFields(radio.value));
    });
    el.gasToken.addEventListener("input", updateMuseSnippet);

    el.copyMusePromptBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el.musePayloadPreview.textContent);
        showToast("Muse POST JSON 예시를 복사했습니다.");
      } catch {
        showToast("복사에 실패했습니다.");
      }
    });

    el.resetDemoBtn.addEventListener("click", () => {
      pushUndo();
      dayData = PlannerAPI.resetDemoForToday(currentDate);
      el.apiModal.classList.add("hidden");
      renderAll();
      showToast("오늘 샘플 데이터를 복원했습니다.");
    });

    el.apiSettingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const mode = el.apiSettingsForm.querySelector('input[name="apiMode"]:checked')?.value || "local";
      PlannerAPI.saveSettings({
        mode,
        gcalCalendarId: el.gcalCalendarId.value.trim() || "primary",
        gcalIncludeTasks: el.gcalIncludeTasks.value,
        gcalAccessToken: el.gcalAccessToken.value.trim(),
        gcalWriteBack: el.gcalWriteBack.value,
        gasUrl: el.gasUrl.value.trim(),
        gasToken: el.gasToken.value.trim(),
        sbUrl: el.sbUrl.value.trim(),
        sbAnonKey: el.sbAnonKey.value.trim()
      });
      el.apiModal.classList.add("hidden");
      loadDay(currentDate).then(() => showToast("데이터 소스 설정을 저장하고 동기화했습니다."));
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

    // 키보드 단축키
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      const isEditingText = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !isEditingText) {
        e.preventDefault();
        performUndo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEventId && !isEditingText) {
        e.preventDefault();
        pushUndo();
        dayData.events = dayData.events.filter((ev) => ev.id !== selectedEventId);
        selectedEventId = null;
        renderAll();
        scheduleSave();
        showToast("일정을 삭제했습니다 (Ctrl+Z로 복구 가능)");
      }
    });

    bindTimelineCreationAndDrop();
  }

  /* -------------------- 부트스트랩 -------------------- */

  bindControls();
  loadDay(currentDate);
  setInterval(renderNowState, 30000);
})();
