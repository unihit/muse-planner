/**
 * 개발/테스트 전용 시드 유틸리티 (프로덕션 번들 index.html에서는 로드하지 않습니다)
 */
(function (global) {
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

  function buildSeedSchedules(dateStr) {
    const api = global.PlannerAPI;
    if (!api) return [];
    return TEST_SEED_2026_11_14.map((item, idx) => {
      const startMin = api.hhmmToMinutes(item.start);
      const endMin = item.end ? api.hhmmToMinutes(item.end) : null;
      return api.normalizeScheduleRecord(
        {
          id: api.uid(`seed${idx}`),
          date: dateStr,
          start_at: api.kstMinutesToIso(dateStr, startMin),
          end_at: endMin !== null ? api.kstMinutesToIso(dateStr, endMin) : null,
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

  async function seedTestSchedulesForDate(dateStr = "2026-11-14") {
    const api = global.PlannerAPI;
    if (!api) throw new Error("PlannerAPI가 로드되지 않았습니다.");
    const existing = await api.fetchSchedules(dateStr);
    const existingSignatures = new Set(
      existing.map((ev) => `${ev.title}|${ev.hasStartAt ? api.minutesToHhmm(ev.startMin) : "none"}`)
    );
    let insertedCount = 0;

    for (const item of TEST_SEED_2026_11_14) {
      const sig = `${item.title}|${item.start}`;
      if (existingSignatures.has(sig)) continue;
      const startMin = api.hhmmToMinutes(item.start);
      const endMin = item.end ? api.hhmmToMinutes(item.end) : null;
      await api.createSchedule({
        date: dateStr,
        start_at: api.kstMinutesToIso(dateStr, startMin),
        end_at: endMin !== null ? api.kstMinutesToIso(dateStr, endMin) : null,
        title: item.title,
        type: item.type,
        source: item.source,
        memo: item.memo
      });
      insertedCount += 1;
    }

    return { insertedCount, items: await api.fetchSchedules(dateStr) };
  }

  global.PlannerDevSeed = {
    TEST_SEED_2026_11_14,
    buildSeedSchedules,
    seedTestSchedulesForDate
  };
})(typeof window !== "undefined" ? window : globalThis);
