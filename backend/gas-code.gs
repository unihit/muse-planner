/**
 * Muse Elastic Planner - Google Apps Script (GAS) 통합 백엔드
 *
 * 기능:
 * 1) GET  : 구글 캘린더 오늘 확정 일정 + 구글 시트 커스텀 상태(완료체크/보류/유튜브리스트/메모) 병합 반환
 * 2) POST : 웹앱 상태 저장(syncDay) 및 Muse 에이전트의 직접 추가(upsertEvent, addStaged, addYoutube) 지원
 *
 * 배포 방법:
 * 1. Google Sheets를 하나 새로 만들고, 메뉴 [확장 프로그램] -> [Apps Script] 실행
 * 2. 이 파일 내용을 붙여넣고 API_TOKEN / TIMEZONE 확인
 * 3. [배포] -> [새 배포] -> 유형: [웹 앱]
 *    - 실행 주체: 나(Me)
 *    - 액세스 권한: 모든 사용자(Anyone)
 * 4. 발급된 Web App URL(/exec)을 웹앱 설정 모달 및 Muse에게 전달
 */

const CONFIG = {
  API_TOKEN: "", // 보안을 위해 원하는 비밀 문자열 설정 권장 (예: "my-muse-secret-2026")
  SHEET_NAME: "PlannerDays",
  TIMEZONE: "Asia/Seoul",
  CALENDAR_ID: "primary"
};

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateToken(token) {
  if (!CONFIG.API_TOKEN) return true;
  return token === CONFIG.API_TOKEN;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      "date",
      "events_json",
      "staged_json",
      "youtube_json",
      "memo",
      "updated_at"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getTodayStr() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function parseDateBounds(dateStr) {
  const parts = dateStr.split("-").map(Number);
  const start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const end = new Date(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0, 0);
  return { start, end };
}

function readSheetDayRow(sheet, dateStr) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const rowDate = values[i][0] instanceof Date
      ? Utilities.formatDate(values[i][0], CONFIG.TIMEZONE, "yyyy-MM-dd")
      : String(values[i][0]);
    if (rowDate === dateStr) {
      return {
        rowIndex: i + 1,
        events: safeJsonParse(values[i][1], []),
        staged: safeJsonParse(values[i][2], []),
        youtubeList: safeJsonParse(values[i][3], []),
        memo: String(values[i][4] || "")
      };
    }
  }
  return {
    rowIndex: -1,
    events: [],
    staged: [],
    youtubeList: [],
    memo: ""
  };
}

function writeSheetDayRow(sheet, dateStr, dayObj) {
  const existing = readSheetDayRow(sheet, dateStr);
  const rowValues = [
    dateStr,
    JSON.stringify(dayObj.events || []),
    JSON.stringify(dayObj.staged || []),
    JSON.stringify(dayObj.youtubeList || []),
    dayObj.memo || "",
    new Date().toISOString()
  ];
  if (existing.rowIndex > 0) {
    sheet.getRange(existing.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function guessCategory(title) {
  const t = String(title || "").toLowerCase();
  if (/미팅|회의|sync|call|meeting|면담/.test(t)) return "meeting";
  if (/유튜브|youtube|영상|강의/.test(t)) return "youtube";
  if (/점심|저녁|식사|휴식|이동|커피|산책/.test(t)) return "break";
  if (/운동|병원|개인|루틴|독서|청소/.test(t)) return "personal";
  return "focus";
}

function fetchGoogleCalendarEventsForDay(dateStr) {
  const cal = CONFIG.CALENDAR_ID === "primary"
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) return { timed: [], allDay: [] };

  const { start, end } = parseDateBounds(dateStr);
  const rawEvents = cal.getEvents(start, end);
  const timed = [];
  const allDay = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const ev = rawEvents[i];
    const rawId = ev.getId();
    if (ev.isAllDayEvent()) {
      allDay.push({
        id: "gcal_all_" + rawId,
        title: "[종일] " + ev.getTitle(),
        durationMin: 30,
        category: "personal",
        done: false,
        status: "todo",
        note: ev.getDescription() || ""
      });
      continue;
    }

    const sDate = ev.getStartTime();
    const eDate = ev.getEndTime();
    const startMin = Math.max(0, Math.round((sDate.getTime() - start.getTime()) / 60000));
    const endMin = Math.min(1440, Math.max(startMin + 15, Math.round((eDate.getTime() - start.getTime()) / 60000)));

    timed.push({
      id: "gcal_" + rawId,
      gcalId: rawId,
      title: ev.getTitle() || "(제목 없음)",
      startMin: startMin,
      endMin: endMin,
      category: guessCategory(ev.getTitle()),
      done: false,
      pinned: true,
      note: ev.getDescription() || "",
      source: "gcal",
      url: ""
    });
  }

  return { timed, allDay };
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!validateToken(params.token)) {
      return jsonResponse({ error: "Unauthorized: Invalid API token" });
    }

    const dateStr = params.date || getTodayStr();
    const sheet = getOrCreateSheet();
    const stored = readSheetDayRow(sheet, dateStr);
    const gcal = fetchGoogleCalendarEventsForDay(dateStr);

    // 시트에 저장된 상태 Map (gcal 이벤트의 done, pinned, 변경된 시간 보존)
    const storedMap = {};
    const customEvents = [];
    for (let i = 0; i < stored.events.length; i++) {
      const ev = stored.events[i];
      if (ev.source === "gcal" || String(ev.id).indexOf("gcal_") === 0) {
        storedMap[ev.id] = ev;
      } else {
        customEvents.push(ev);
      }
    }

    const mergedGcal = gcal.timed.map(function (ev) {
      const prev = storedMap[ev.id];
      if (!prev) return ev;
      return {
        id: ev.id,
        gcalId: ev.gcalId,
        title: prev.title || ev.title,
        startMin: typeof prev.startMin === "number" ? prev.startMin : ev.startMin,
        endMin: typeof prev.endMin === "number" ? prev.endMin : ev.endMin,
        category: prev.category || ev.category,
        done: Boolean(prev.done),
        pinned: typeof prev.pinned === "boolean" ? prev.pinned : ev.pinned,
        note: prev.note !== undefined ? prev.note : ev.note,
        source: "gcal",
        url: prev.url || ev.url
      };
    });

    // 종일 일정 중 아직 staged에 없는 것만 추가
    const stagedMap = {};
    stored.staged.forEach(function (s) { stagedMap[s.id] = true; });
    const mergedStaged = stored.staged.slice();
    gcal.allDay.forEach(function (a) {
      if (!stagedMap[a.id]) mergedStaged.push(a);
    });

    return jsonResponse({
      date: dateStr,
      events: mergedGcal.concat(customEvents),
      staged: mergedStaged,
      youtubeList: stored.youtubeList,
      memo: stored.memo
    });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!validateToken(body.token)) {
      return jsonResponse({ error: "Unauthorized: Invalid API token" });
    }

    const dateStr = body.date || getTodayStr();
    const action = body.action || "syncDay";
    const sheet = getOrCreateSheet();
    const dayObj = readSheetDayRow(sheet, dateStr);

    if (action === "syncDay") {
      writeSheetDayRow(sheet, dateStr, {
        events: body.events || [],
        staged: body.staged || [],
        youtubeList: body.youtubeList || [],
        memo: body.memo || ""
      });
      return jsonResponse({ ok: true, action: "syncDay", date: dateStr });
    }

    if (action === "upsertEvent" && body.event) {
      const ev = body.event;
      const newEv = {
        id: ev.id || ("muse_" + new Date().getTime()),
        title: ev.title || "(Muse 일정)",
        startMin: Number(ev.startMin || 540),
        endMin: Number(ev.endMin || 600),
        category: ev.category || guessCategory(ev.title),
        done: Boolean(ev.done),
        pinned: Boolean(ev.pinned),
        note: ev.note || "",
        url: ev.url || "",
        source: ev.source || "muse"
      };

      const idx = dayObj.events.findIndex(function (x) { return x.id === newEv.id; });
      if (idx >= 0) {
        dayObj.events[idx] = newEv;
      } else {
        dayObj.events.push(newEv);
      }

      // 선택 사항: 구글 캘린더에도 함께 등록
      if (body.syncToCalendar === true) {
        const { start } = parseDateBounds(dateStr);
        const sDt = new Date(start.getTime() + newEv.startMin * 60000);
        const eDt = new Date(start.getTime() + newEv.endMin * 60000);
        CalendarApp.getDefaultCalendar().createEvent(newEv.title, sDt, eDt, {
          description: newEv.note
        });
      }

      writeSheetDayRow(sheet, dateStr, dayObj);
      return jsonResponse({ ok: true, action: "upsertEvent", event: newEv });
    }

    if (action === "addStaged" && body.item) {
      const item = body.item;
      const newItem = {
        id: item.id || ("stg_" + new Date().getTime()),
        title: item.title || "(할 일)",
        durationMin: Number(item.durationMin || 30),
        category: item.category || guessCategory(item.title),
        done: false,
        status: item.status === "deferred" ? "deferred" : "todo",
        note: item.note || ""
      };
      dayObj.staged.unshift(newItem);
      writeSheetDayRow(sheet, dateStr, dayObj);
      return jsonResponse({ ok: true, action: "addStaged", item: newItem });
    }

    if (action === "addYoutube" && body.item) {
      const yt = body.item;
      const newYt = {
        id: yt.id || ("yt_" + new Date().getTime()),
        title: yt.title || "(유튜브 영상)",
        url: yt.url || "",
        durationMin: Number(yt.durationMin || 30),
        done: false,
        addedBy: yt.addedBy || "Muse"
      };
      dayObj.youtubeList.unshift(newYt);
      writeSheetDayRow(sheet, dateStr, dayObj);
      return jsonResponse({ ok: true, action: "addYoutube", item: newYt });
    }

    return jsonResponse({ error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}
