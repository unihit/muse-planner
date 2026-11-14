(function () {
  const EARLY_END_MIN = 420; // 07:00
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
  let activeTypeFilter = "all";
  let activeHtmlDragPayload = null;
  let toastTimer = null;
  let lastNowRenderMin = -1;
  let isBackgroundSyncing = false;
  let lastSyncCheckAt = 0;

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
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    syncNowBtn: document.getElementById("syncNowBtn"),
    openApiModalBtn: document.getElementById("openApiModalBtn"),
    apiSourceDot: document.getElementById("apiSourceDot"),
    apiSourceLabel: document.getElementById("apiSourceLabel"),

    stagingDock: document.getElementById("stagingDock"),
    stagedCountBadge: document.getElementById("stagedCountBadge"),
    addStagedForm: document.getElementById("addStagedForm"),
    newStagedTitle: document.getElementById("newStagedTitle"),
    newStagedType: document.getElementById("newStagedType"),
    untimedCount: document.getElementById("untimedCount"),
    untimedList: document.getElementById("untimedList"),
    reminderSummaryCount: document.getElementById("reminderSummaryCount"),
    reminderHighlightList: document.getElementById("reminderHighlightList"),

    typeFilterBar: document.getElementById("typeFilterBar"),
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

    presetModal: document.getElementById("presetModal"),
    presetManageList: document.getElementById("presetManageList"),
    addPresetForm: document.getElementById("addPresetForm"),
    presetIcon: document.getElementById("presetIcon"),
    presetTitle: document.getElementById("presetTitle"),
    presetDuration: document.getElementById("presetDuration"),
    presetType: document.getElementById("presetType"),

    apiModal: document.getElementById("apiModal"),
    apiSettingsForm: document.getElementById("apiSettingsForm"),
    agentFields: document.getElementById("agentFields"),
    agentApiUrl: document.getElementById("agentApiUrl"),
    agentApiToken: document.getElementById("agentApiToken"),
    musePayloadPreview: document.getElementById("musePayloadPreview"),
    copyMusePromptBtn: document.getElementById("copyMusePromptBtn"),
    seedTestDataBtn: document.getElementById("seedTestDataBtn"),

    toast: document.getElementById("toast")
  };

  /* -------------------- 유틸 -------------------- */

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2800);
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

  function findNextAvailableSlot(durationMin = 30) {
    const step = prefs.snapMin || 15;
    const timed = schedules.filter((e) => e.hasStartAt).sort((a, b) => a.startMin - b.startMin);
    const startSearch = isViewingToday()
      ? Math.max(EARLY_END_MIN, Math.ceil(getNowKstMinutes() / step) * step)
      : 540;

    let candidate = startSearch;
    const span = Math.max(15, durationMin || 30);
    for (const ev of timed) {
      if (candidate + span <= ev.startMin) {
        return candidate;
      }
      if (candidate < ev.visualEndMin) {
        candidate = Math.ceil(ev.visualEndMin / step) * step;
      }
    }
    return clamp(candidate, EARLY_END_MIN, 1440 - span);
  }

  /* -------------------- API 호출 래퍼 -------------------- */

  async function loadDay(dateStr, scrollOptimal = true) {
    currentDate = dateStr;
    el.datePicker.value = dateStr;
    selectedEventId = null;
    updateApiBadge();

    widgetsState = PlannerAPI.loadWidgetsState(dateStr);

    try {
      schedules = await PlannerAPI.fetchSchedules(dateStr);
    } catch (err) {
      schedules = [];
      showToast(err.message);
    }

    renderAll();
    if (scrollOptimal) {
      scrollToOptimalPosition();
    }
  }

  function getScheduleSignature(list) {
    return (list || [])
      .map((s) => `${s.id}|${s.updated_at || ""}|${s.done ? 1 : 0}|${s.start_at || ""}|${s.end_at || ""}|${s.title}|${s.type}|${s.memo || ""}`)
      .join("\n");
  }

  function isAutoSyncPaused() {
    if (document.hidden || isBackgroundSyncing || activeHtmlDragPayload) return true;
    if (document.querySelector(".modal-backdrop:not(.hidden)")) return true;
    const s = PlannerAPI.getSettings();
    if (s.mode === "agent" && (!s.agentApiUrl || !s.agentApiToken)) return true;
    return false;
  }

  async function syncIfChanged(showNotify = true) {
    const now = Date.now();
    if (now - lastSyncCheckAt < 2000) return;
    if (isAutoSyncPaused()) return;

    lastSyncCheckAt = now;
    isBackgroundSyncing = true;
    const targetDate = currentDate;

    try {
      const fresh = await PlannerAPI.fetchSchedules(targetDate);
      if (targetDate !== currentDate || isAutoSyncPaused()) return;

      if (getScheduleSignature(fresh) !== getScheduleSignature(schedules)) {
        schedules = fresh;
        renderAll();
        if (showNotify) {
          showToast("일정 변경사항이 자동 반영되었습니다.");
        }
      }
    } catch {
      // 백그라운드 동기화 실패 시 조용히 다음 주기에 재시도
    } finally {
      isBackgroundSyncing = false;
    }
  }

  function scrollToOptimalPosition() {
    const timed = schedules.filter((e) => e.hasStartAt);
    let targetMin = 540;
    if (isViewingToday()) {
      const nowMin = getNowKstMinutes();
      const firstTimedMin = timed.length ? timed[0].startMin : nowMin;
      targetMin = Math.max(EARLY_END_MIN, Math.min(nowMin, firstTimedMin) - 45);
    } else if (timed.length) {
      targetMin = Math.max(EARLY_END_MIN, timed[0].startMin - 45);
    }
    el.timelineScroll.scrollTop = Math.max(0, minToY(targetMin) - 18);
  }

  async function toggleScheduleDone(id, checked) {
    const idx = schedules.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const prev = { ...schedules[idx] };
    schedules[idx] = {
      ...prev,
      done: checked,
      done_at: checked ? new Date().toISOString() : null
    };
    renderAll();

    try {
      const updated = await PlannerAPI.patchSchedule(id, { done: checked }, currentDate);
      const curIdx = schedules.findIndex((s) => s.id === id);
      if (curIdx !== -1 && updated) {
        schedules[curIdx] = updated;
        renderAll();
      }
    } catch (err) {
      const curIdx = schedules.findIndex((s) => s.id === id);
      if (curIdx !== -1) schedules[curIdx] = prev;
      renderAll();
      showToast(`완료 저장 실패: ${err.message}`);
    }
  }

  async function deleteScheduleById(id) {
    const prevList = [...schedules];
    schedules = schedules.filter((s) => s.id !== id);
    if (selectedEventId === id) selectedEventId = null;
    renderAll();

    try {
      await PlannerAPI.deleteSchedule(id, currentDate);
      showToast("일정을 삭제했습니다.");
    } catch (err) {
      schedules = prevList;
      renderAll();
      showToast(`삭제 실패: ${err.message}`);
    }
  }

  async function commitScheduleTimeChange(ev, nextStartMin, nextEndMinOrNull) {
    const oldStartIso = ev.start_at;
    const oldEndIso = ev.end_at;
    const nextStartIso = PlannerAPI.kstMinutesToIso(ev.date, nextStartMin);
    const nextEndIso =
      nextEndMinOrNull !== null ? PlannerAPI.kstMinutesToIso(ev.date, nextEndMinOrNull) : null;

    // 연쇄 밀기 대상 계산
    const cascadePatches = [];
    if (prefs.cascadeMode) {
      const movedAnchorVisualEnd =
        nextEndMinOrNull !== null ? nextEndMinOrNull : Math.min(1440, nextStartMin + 30);
      let cursor = movedAnchorVisualEnd;
      const others = schedules
        .filter((s) => s.id !== ev.id && s.hasStartAt && !s.done)
        .sort((a, b) => a.startMin - b.startMin);

      for (const item of others) {
        if (item.visualEndMin > nextStartMin && item.startMin < cursor) {
          const itemSpan = item.hasEndAt ? item.endMin - item.startMin : null;
          const nextItemStart = clamp(cursor, 0, itemSpan ? 1440 - itemSpan : 1425);
          const nextItemEnd = itemSpan !== null ? nextItemStart + itemSpan : null;
          cascadePatches.push({
            id: item.id,
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

    try {
      const updated = await PlannerAPI.patchSchedule(
        ev.id,
        { start_at: nextStartIso, end_at: nextEndIso },
        currentDate
      );
      if (cascadePatches.length > 0) {
        await Promise.all(
          cascadePatches.map((cp) => PlannerAPI.patchSchedule(cp.id, cp.patch, currentDate))
        );
      }
      schedules = await PlannerAPI.fetchSchedules(currentDate);
      renderAll();
      if (!updated) throw new Error("업데이트 응답이 비어 있습니다.");
    } catch (err) {
      ev.start_at = oldStartIso;
      ev.end_at = oldEndIso;
      await loadDay(currentDate, false);
      showToast(`시간 수정 실패: ${err.message}`);
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
    const themeLabel = prefs.theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
    el.themeToggleBtn.setAttribute("title", themeLabel);
    el.themeToggleBtn.setAttribute("aria-label", themeLabel);

    el.snapSelect.value = String(prefs.snapMin);
    el.zoomRange.value = String(prefs.pxPerMin);
    el.cascadeToggleBtn.classList.toggle("active", prefs.cascadeMode);
    el.earlyToggleBtn.classList.toggle("active", prefs.earlyCollapsed);
    el.earlyToggleBtn.textContent = prefs.earlyCollapsed ? "🌙 새벽 접힘" : "☀️ 전체 24h";

    Object.entries(prefs.widgets).forEach(([key, visible]) => {
      const card = document.getElementById(`widget-${key}`);
      if (card) card.classList.toggle("hidden", !visible);
      const cb = el.widgetConfigMenu.querySelector(`input[data-widget="${key}"]`);
      if (cb) cb.checked = visible;
    });
  }

  function updateApiBadge() {
    const s = PlannerAPI.getSettings();
    if (s.mode === "agent") {
      if (s.agentApiUrl && s.agentApiToken) {
        el.apiSourceDot.className = "source-dot agent";
        el.apiSourceLabel.textContent = "Agent API";
      } else {
        el.apiSourceDot.className = "source-dot agent-warn";
        el.apiSourceLabel.textContent = "API 설정 필요";
      }
    } else {
      el.apiSourceDot.className = "source-dot local";
      el.apiSourceLabel.textContent = "로컬 모드";
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
          await PlannerAPI.createSchedule({
            date: currentDate,
            start_at: PlannerAPI.kstMinutesToIso(currentDate, startMin),
            end_at: endMin !== null ? PlannerAPI.kstMinutesToIso(currentDate, endMin) : null,
            title: `${p.icon} ${p.title}`,
            type: p.type || "schedule",
            source: "app",
            memo: ""
          });
          schedules = await PlannerAPI.fetchSchedules(currentDate);
          renderAll();
          showToast(`${minToTimeStr(startMin)}에 '${p.title}' 일정을 등록했습니다.`);
        } catch (err) {
          showToast(`등록 실패: ${err.message}`);
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

  function renderLeftPanel() {
    const untimed = schedules.filter((s) => !s.hasStartAt);
    const reminders = schedules.filter((s) => s.type === "reminder");

    el.stagedCountBadge.textContent = String(untimed.length);
    el.untimedCount.textContent = String(untimed.length);
    el.reminderSummaryCount.textContent = String(reminders.length);

    el.untimedList.innerHTML = "";
    if (!untimed.length) {
      el.untimedList.innerHTML = `<div class="empty-hint">시간 미정 일정이 없습니다.<br/>위에서 추가하거나 타임라인에서 빼오세요.</div>`;
    } else {
      for (const item of untimed) {
        const card = document.createElement("div");
        card.className = `dock-card ${item.done ? "is-done" : ""}`;
        card.dataset.type = item.type;
        card.draggable = true;

        card.innerHTML = `
          <div class="dock-card-top">
            <input type="checkbox" class="event-check" ${item.done ? "checked" : ""} title="완료 체크" />
            <div class="dock-card-title">${escapeHtml(item.title)}</div>
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
    }

    el.reminderHighlightList.innerHTML = "";
    if (!reminders.length) {
      el.reminderHighlightList.innerHTML = `<div class="empty-hint">등록된 알림 일정이 없습니다.</div>`;
    } else {
      for (const rem of reminders) {
        const card = document.createElement("div");
        card.className = `reminder-pill-card ${rem.done ? "is-done" : ""}`;
        card.innerHTML = `
          <input type="checkbox" class="event-check" ${rem.done ? "checked" : ""} title="완료 체크" />
          <span class="reminder-pill-time">${rem.hasStartAt ? minToTimeStr(rem.startMin) : "미정"}</span>
          <span class="reminder-pill-title" title="${escapeAttr(rem.title)}">${escapeHtml(rem.title)}</span>
        `;

        card.querySelector(".event-check").addEventListener("click", (e) => e.stopPropagation());
        card.querySelector(".event-check").addEventListener("change", (e) => {
          toggleScheduleDone(rem.id, e.target.checked);
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
    }
  }

  function renderTimelineGrid() {
    const totalH = getTimelineTotalHeight();
    el.timelineGrid.style.height = `${totalH}px`;
    el.hourRowsLayer.innerHTML = "";

    if (prefs.earlyCollapsed) {
      const earlyCount = schedules.filter((e) => e.hasStartAt && e.startMin < EARLY_END_MIN).length;
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

    const timedEvents = schedules.filter((ev) => {
      if (!ev.hasStartAt) return false;
      if (prefs.earlyCollapsed && ev.visualEndMin <= EARLY_END_MIN) return false;
      return true;
    });

    const cols = computeEventColumns(timedEvents);

    for (const ev of timedEvents) {
      const visualStart = prefs.earlyCollapsed ? Math.max(EARLY_END_MIN, ev.startMin) : ev.startMin;
      const top = minToY(visualStart);
      const bottom = minToY(ev.visualEndMin);
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

      block.innerHTML = `
        <div class="resize-handle top" title="위로 끌어 시작 시각 조절"></div>
        <div class="event-top-row">
          <input type="checkbox" class="event-check" ${ev.done ? "checked" : ""} title="완료 체크" />
          <span class="event-title">${escapeHtml(ev.title)}</span>
          <div class="event-badges">
            ${isNow ? `<span class="badge-now">NOW</span>` : ""}
            ${reminderBadge}
            ${typeBadge}
            ${srcBadge}
          </div>
        </div>
        <div class="event-sub-row">
          <span class="event-time-text">${escapeHtml(timeText)}</span>
          <div class="event-quick-actions">
            <button type="button" class="q-btn" data-act="minus15" title="15분 줄이기">-15m</button>
            <button type="button" class="q-btn" data-act="plus15" title="15분 늘리기">+15m</button>
            <button type="button" class="q-btn q-icon" data-act="edit" title="편집" aria-label="일정 편집">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="q-btn q-icon del" data-act="delete" title="삭제" aria-label="일정 삭제">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
            </button>
          </div>
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
    }
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
      const origHasEnd = ev.hasEndAt && ev.endMin !== null;
      const origVisualDur = ev.visualEndMin - ev.startMin;
      const origRealDur = origHasEnd ? ev.endMin - ev.startMin : null;

      let hasMoved = false;
      let previewStart = origStart;
      let previewVisualEnd = ev.visualEndMin;
      let previewHasEnd = origHasEnd;
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
          previewStart = clamp(origStart + deltaMin, minBound, 1440 - origVisualDur);
          previewVisualEnd = previewStart + origVisualDur;

          const dockRect = el.stagingDock.getBoundingClientRect();
          droppingToDock =
            moveEvent.clientX >= dockRect.left &&
            moveEvent.clientX <= dockRect.right &&
            moveEvent.clientY >= dockRect.top &&
            moveEvent.clientY <= dockRect.bottom;
          el.stagingDock.classList.toggle("drop-active", droppingToDock);
        } else if (mode === "resize-bottom") {
          const baseEnd = origHasEnd ? ev.endMin : origStart + 15;
          previewVisualEnd = clamp(baseEnd + deltaMin, origStart + (prefs.snapMin || 15), 1440);
          previewHasEnd = true;
        } else if (mode === "resize-top") {
          const ceiling = origHasEnd ? ev.endMin : origStart + 30;
          previewStart = clamp(origStart + deltaMin, minBound, ceiling - (prefs.snapMin || 15));
          previewVisualEnd = ceiling;
        }

        const visualStart = prefs.earlyCollapsed ? Math.max(EARLY_END_MIN, previewStart) : previewStart;
        const top = minToY(visualStart);
        const height = Math.max(26, minToY(previewVisualEnd) - top);
        block.style.top = `${top}px`;
        block.style.height = `${height - 2}px`;
        if (timeSpan) {
          timeSpan.textContent = previewHasEnd
            ? `${minToTimeStr(previewStart)} - ${minToTimeStr(previewVisualEnd)} (${previewVisualEnd - previewStart}분)`
            : minToTimeStr(previewStart);
        }
      };

      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        block.classList.remove("is-dragging");
        el.stagingDock.classList.remove("drop-active");

        if (!hasMoved) {
          renderEvents();
          return;
        }

        if (droppingToDock) {
          try {
            await PlannerAPI.patchSchedule(ev.id, { start_at: null, end_at: null }, currentDate);
            schedules = await PlannerAPI.fetchSchedules(currentDate);
            renderAll();
            showToast("시간 미정 목록으로 옮겼습니다.");
          } catch (err) {
            renderAll();
            showToast(`이동 실패: ${err.message}`);
          }
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
    };

    topHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-top", e));
    bottomHandle.addEventListener("pointerdown", (e) => startPointerOp("resize-bottom", e));
    block.addEventListener("pointerdown", (e) => startPointerOp("move", e));
  }

  /* -------------------- 빈 타임라인 드래그 생성 & 카드 드롭 -------------------- */

  function bindTimelineCreationAndDrop() {
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
        const h = Math.max(22, minToY(curEndMin) - top);
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

    el.timelineScroll.addEventListener("dragover", (e) => {
      if (!activeHtmlDragPayload) return;
      e.preventDefault();
      const span = Math.max(15, activeHtmlDragPayload.durationMin || 30);
      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(snap(yToMin(y)), prefs.earlyCollapsed ? EARLY_END_MIN : 0, 1440 - span);
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

      const span = Math.max(15, payload.durationMin || 30);
      const y = e.clientY - el.timelineGrid.getBoundingClientRect().top;
      const dropStart = clamp(snap(yToMin(y)), prefs.earlyCollapsed ? EARLY_END_MIN : 0, 1440 - span);
      const dropEnd = payload.durationMin > 0 ? Math.min(1440, dropStart + payload.durationMin) : null;

      try {
        if (payload.kind === "untimed") {
          const item = schedules.find((s) => s.id === payload.id);
          if (item) await commitScheduleTimeChange(item, dropStart, dropEnd);
        } else if (payload.kind === "youtube") {
          await PlannerAPI.createSchedule({
            date: currentDate,
            start_at: PlannerAPI.kstMinutesToIso(currentDate, dropStart),
            end_at: PlannerAPI.kstMinutesToIso(currentDate, Math.min(1440, dropStart + (payload.durationMin || 30))),
            title: payload.title,
            type: "schedule",
            source: "app",
            memo: payload.url || ""
          });
          schedules = await PlannerAPI.fetchSchedules(currentDate);
          renderAll();
          showToast(`${minToTimeStr(dropStart)}에 유튜브 시청 일정을 등록했습니다.`);
        } else if (payload.kind === "preset") {
          await PlannerAPI.createSchedule({
            date: currentDate,
            start_at: PlannerAPI.kstMinutesToIso(currentDate, dropStart),
            end_at: dropEnd !== null ? PlannerAPI.kstMinutesToIso(currentDate, dropEnd) : null,
            title: payload.title,
            type: payload.type || "schedule",
            source: "app",
            memo: ""
          });
          schedules = await PlannerAPI.fetchSchedules(currentDate);
          renderAll();
        }
      } catch (err) {
        showToast(`배치 실패: ${err.message}`);
      }
    });
  }

  /* -------------------- 현재 시각 NOW Line & 배너 -------------------- */

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

    if (activeEv) {
      const activeEnd = activeEv.hasEndAt && activeEv.endMin !== null ? activeEv.endMin : activeEv.startMin + 30;
      const total = Math.max(1, activeEnd - activeEv.startMin);
      const elapsed = clamp(nowMin - activeEv.startMin, 0, total);
      const pct = Math.round((elapsed / total) * 100);
      const remain = Math.max(0, activeEnd - nowMin);

      el.nowBanner.classList.add("is-active");
      el.nowBannerLabel.textContent = activeEv.type === "reminder" ? "ALERT" : "NOW";
      el.nowEventTitle.textContent = activeEv.title;
      el.nowEventTime.textContent = activeEv.hasEndAt
        ? `${minToTimeStr(activeEv.startMin)} ~ ${minToTimeStr(activeEv.endMin)}`
        : `${minToTimeStr(activeEv.startMin)} 시작`;
      el.nowProgressBar.style.width = `${pct}%`;
      el.nowRemaining.textContent = `${remain}분 남음`;
      el.nowExtendBtn.classList.toggle("hidden", !activeEv.hasEndAt);
      el.nowDoneBtn.classList.remove("hidden");

      el.nowExtendBtn.onclick = () => handleQuickAction(activeEv.id, "plus15");
      el.nowDoneBtn.onclick = () => toggleScheduleDone(activeEv.id, true);
    } else {
      el.nowBanner.classList.remove("is-active");
      el.nowProgressBar.style.width = "0%";
      el.nowExtendBtn.classList.add("hidden");
      el.nowDoneBtn.classList.add("hidden");

      const nextEv = isToday
        ? schedules
            .filter((e) => e.hasStartAt && !e.done && e.startMin > nowMin)
            .sort((a, b) => a.startMin - b.startMin)[0]
        : null;

      if (nextEv) {
        el.nowBannerLabel.textContent = nextEv.type === "reminder" ? "NEXT 🔔" : "NEXT";
        el.nowEventTitle.textContent = nextEv.title;
        el.nowEventTime.textContent = `${minToTimeStr(nextEv.startMin)} 예정`;
        el.nowRemaining.textContent = `${nextEv.startMin - nowMin}분 뒤`;
      } else {
        el.nowBannerLabel.textContent = isToday ? "FREE" : currentDate;
        el.nowEventTitle.textContent = isToday
          ? "현재 시간에 진행 중인 일정이 없습니다"
          : `${currentDate} 일정을 보고 있습니다`;
        el.nowEventTime.textContent = "타임라인을 클릭하거나 '+ 새 일정'으로 추가하세요";
        el.nowRemaining.textContent = "";
      }
    }
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
          await PlannerAPI.createSchedule({
            date: currentDate,
            start_at: PlannerAPI.kstMinutesToIso(currentDate, startMin),
            end_at: PlannerAPI.kstMinutesToIso(currentDate, Math.min(1440, startMin + yt.durationMin)),
            title: `📺 ${yt.title}`,
            type: "schedule",
            source: "app",
            memo: yt.url || ""
          });
          schedules = await PlannerAPI.fetchSchedules(currentDate);
          renderAll();
          showToast(`${minToTimeStr(startMin)}에 유튜브 일정을 등록했습니다.`);
        } catch (err) {
          showToast(`등록 실패: ${err.message}`);
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
      el.editEnd.value = minToTimeStr(Math.min(1439, sMin + 30));
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
    el.eventModal.classList.remove("hidden");
    setTimeout(() => el.editTitle.focus(), 40);
  }

  function openEventModal(eventId) {
    const ev = schedules.find((e) => e.id === eventId);
    if (!ev) return;
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

  function renderPresetManager() {
    el.presetManageList.innerHTML = "";
    prefs.presets.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "preset-manage-item";
      const durLabel = p.durationMin > 0 ? `${p.durationMin}분` : "시작 시각만";
      row.innerHTML = `
        <span>${escapeHtml(p.icon)} <strong>${escapeHtml(p.title)}</strong> (${durLabel} · ${TYPE_META[p.type]?.label || p.type})</span>
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

    el.agentApiUrl.value = s.agentApiUrl || "";
    el.agentApiToken.value = s.agentApiToken || "";
    toggleProviderFields(s.mode);
    updateMuseSnippet();
    el.apiModal.classList.remove("hidden");
  }

  function toggleProviderFields(mode) {
    el.agentFields.classList.toggle("hidden", mode !== "agent");
  }

  function updateMuseSnippet() {
    const sample = {
      date: currentDate,
      start_at: `${currentDate}T13:00:00+09:00`,
      end_at: `${currentDate}T14:00:00+09:00`,
      title: "홈트 토요일 루틴",
      type: "schedule",
      source: "muse",
      memo: ""
    };
    el.musePayloadPreview.textContent = JSON.stringify(sample, null, 2);
  }

  /* -------------------- 이벤트 바인딩 -------------------- */

  function bindControls() {
    el.datePicker.addEventListener("change", (e) => {
      if (e.target.value) loadDay(e.target.value);
    });

    el.prevDayBtn.addEventListener("click", () => loadDay(PlannerAPI.shiftDateStr(currentDate, -1)));
    el.nextDayBtn.addEventListener("click", () => loadDay(PlannerAPI.shiftDateStr(currentDate, 1)));
    el.todayBtn.addEventListener("click", () => loadDay(PlannerAPI.todayKst()));

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

    el.themeToggleBtn.addEventListener("click", () => {
      prefs.theme = prefs.theme === "dark" ? "light" : "dark";
      PlannerAPI.savePrefs(prefs);
      applyPrefsToUI();
      showToast(prefs.theme === "light" ? "라이트 모드로 전환했습니다" : "다크 모드로 전환했습니다");
    });

    el.syncNowBtn.addEventListener("click", () => {
      loadDay(currentDate, false).then(() => showToast("일정을 새로고침했습니다."));
    });

    el.typeFilterBar.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTypeFilter = btn.dataset.type;
        el.typeFilterBar.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderEvents();
      });
    });

    el.addEventBtn.addEventListener("click", () => {
      const next = findNextAvailableSlot(60);
      openNewEventModal(next, Math.min(1440, next + 60));
    });

    // 좌측 시간 미정 추가
    el.addStagedForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = el.newStagedTitle.value.trim();
      if (!title) return;
      const type = el.newStagedType.value || "task";
      try {
        await PlannerAPI.createSchedule({
          date: currentDate,
          start_at: null,
          end_at: null,
          title,
          type,
          source: "app",
          memo: ""
        });
        el.newStagedTitle.value = "";
        schedules = await PlannerAPI.fetchSchedules(currentDate);
        renderAll();
        showToast("시간 미정 일정을 등록했습니다.");
      } catch (err) {
        showToast(`등록 실패: ${err.message}`);
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
        if (id) {
          await PlannerAPI.patchSchedule(id, payload, currentDate);
          showToast("일정을 수정했습니다.");
        } else {
          await PlannerAPI.createSchedule({
            ...payload,
            source: "app"
          });
          showToast("새 일정을 등록했습니다.");
        }
        el.eventModal.classList.add("hidden");
        await loadDay(dateVal === currentDate ? currentDate : dateVal, false);
      } catch (err) {
        showToast(`저장 실패: ${err.message}`);
      }
    });

    el.deleteEventModalBtn.addEventListener("click", async () => {
      const id = el.editEventId.value;
      if (!id) return;
      el.eventModal.classList.add("hidden");
      await deleteScheduleById(id);
    });

    // 프리셋 모달
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
        type: el.presetType.value || "schedule"
      });
      PlannerAPI.savePrefs(prefs);
      el.presetTitle.value = "";
      renderPresetManager();
      renderPresets();
    });

    // API 모달
    el.openApiModalBtn.addEventListener("click", openApiSettingsModal);
    el.apiSettingsForm.querySelectorAll('input[name="apiMode"]').forEach((radio) => {
      radio.addEventListener("change", () => toggleProviderFields(radio.value));
    });

    el.copyMusePromptBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el.musePayloadPreview.textContent);
        showToast("POST /v1/schedules 요청 예시를 복사했습니다.");
      } catch {
        showToast("복사에 실패했습니다.");
      }
    });

    el.seedTestDataBtn.addEventListener("click", async () => {
      try {
        const targetDate = "2026-11-14";
        const { insertedCount } = await PlannerAPI.seedTestSchedulesForDate(targetDate);
        el.apiModal.classList.add("hidden");
        await loadDay(targetDate);
        showToast(
          insertedCount > 0
            ? `${targetDate} 테스트 일정 ${insertedCount}건을 등록했습니다.`
            : `${targetDate} 테스트 일정 9건이 이미 모두 등록되어 있습니다.`
        );
      } catch (err) {
        showToast(`테스트 데이터 등록 실패: ${err.message}`);
      }
    });

    el.apiSettingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const mode = el.apiSettingsForm.querySelector('input[name="apiMode"]:checked')?.value || "local";
      PlannerAPI.saveSettings({
        mode,
        agentApiUrl: el.agentApiUrl.value.trim(),
        agentApiToken: el.agentApiToken.value.trim()
      });
      el.apiModal.classList.add("hidden");
      loadDay(currentDate).then(() => showToast("설정을 저장하고 일정을 불러왔습니다."));
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

      if (e.key === "Escape") {
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
  loadDay(currentDate);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncIfChanged(true);
  });
  window.addEventListener("focus", () => {
    syncIfChanged(true);
  });

  setInterval(() => {
    const curMin = getNowKstMinutes();
    if (curMin !== lastNowRenderMin) {
      renderEvents();
    }
    renderNowState();
    syncIfChanged(true);
  }, 15000);
})();
