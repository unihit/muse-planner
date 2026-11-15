(function () {
  const api = window.PlannerAPI;
  const $ = (id) => document.getElementById(id);
  const today = api.todayKst();
  const prefs = api.getPrefs();
  const validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '') && value >= '1900-01' && value <= '9999-12';
  const requestedMonth = new URLSearchParams(location.search).get('month');
  let month = validMonth(requestedMonth) ? requestedMonth : today.slice(0, 7);
  let selected = month === today.slice(0, 7) ? today : `${month}-01`;
  let items = [];
  let requestId = 0;
  const eligible = (item) => item.type === 'task' || (item.type === 'schedule' && prefs.trackScheduleDone !== false);
  const statistics = (rows) => {
    const targets = rows.filter(eligible);
    const done = targets.filter((item) => item.done);
    const duration = (item) => item.start_at && item.end_at ? Math.max(0, (Date.parse(item.end_at) - Date.parse(item.start_at)) / 60000) || 0 : 0;
    return { total: targets.length, done: done.length, rate: targets.length ? Math.round(done.length / targets.length * 100) : null,
      planned: rows.reduce((sum, item) => sum + duration(item), 0), completed: done.reduce((sum, item) => sum + duration(item), 0) };
  };
  const hours = (minutes) => `${(minutes / 60).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}시간`;
  const lastDay = (value) => `${value}-${new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5)), 0)).getUTCDate()}`;
  const rowsOn = (date) => items.filter((item) => item.date === date);
  function text(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function progress(rate) {
    const node = document.createElement('span');
    node.style.width = `${rate || 0}%`;
    return node;
  }
  function renderDetail() {
    const rows = rowsOn(selected);
    const stats = statistics(rows);
    $('detailTitle').textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${selected}T12:00:00+09:00`)) + (selected === today ? ' · 오늘' : '');
    $('detailSummary').textContent = selected > today ? `예정된 항목 ${rows.length}개 · 완료율 집계 전` : stats.total ? `${stats.done} / ${stats.total}개 완료` : '완료율 집계 대상 없음';
    $('detailProgress').replaceChildren(progress(selected > today ? 0 : stats.rate));
    $('detailList').replaceChildren();
    rows.forEach((item) => {
      const li = document.createElement('li');
      li.append(text('span', eligible(item) ? item.done ? '✓' : '○' : item.type === 'reminder' ? '♧' : '—', eligible(item) && item.done ? 'done-mark' : 'type-mark'));
      li.append(text('span', item.title, 'item-title'));
      const time = item.hasStartAt ? api.minutesToHhmm(item.startMin) + (item.hasEndAt ? `–${api.minutesToHhmm(item.endMin)}` : '') : '시간 미정';
      li.append(text('span', time, 'item-time'));
      li.setAttribute('aria-label', `${item.title}, ${time}, ${eligible(item) ? item.done ? '완료' : '미완료' : '완료 추적 제외'}`);
      $('detailList').append(li);
    });
    if (!rows.length) $('detailList').append(text('li', '이 날짜에 등록된 항목이 없습니다.', 'empty'));
    $('openDay').href = `./index.html?date=${selected}`;
  }
  function selectDay(date) {
    selected = date;
    $('calendar').querySelectorAll('button').forEach((button) => {
      const active = button.dataset.date === date;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderDetail();
  }
  function render() {
    const first = `${month}-01`;
    const firstDate = new Date(`${first}T12:00:00Z`);
    const offset = firstDate.getUTCDay();
    const last = lastDay(month);
    const days = Number(last.slice(-2));
    const past = items.filter((item) => item.date <= today && item.type !== 'reminder');
    const stats = statistics(past);
    $('itemCount').textContent = `${past.length}개`;
    const future = items.filter((item) => item.date > today && item.type !== 'reminder').length;
    $('itemNote').textContent = `${month >= today.slice(0, 7) ? '오늘까지 배치된 일정·할 일' : '월 전체 일정·할 일'}${future ? ` · 미래 ${future}개 별도` : ''}`;
    $('completionRate').textContent = stats.rate === null ? '—' : `${stats.rate}%`;
    $('completionNote').textContent = stats.total ? `${stats.done} / ${stats.total}개 완료` : '집계할 항목 없음';
    $('plannedTime').textContent = hours(stats.planned);
    $('completedTime').textContent = hours(stats.completed);
    $('calendar').replaceChildren();
    for (let i = 0; i < offset; i++) $('calendar').append(text('div', '', 'blank'));
    for (let day = 1; day <= days; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const rows = rowsOn(date);
      const stat = statistics(rows);
      const dow = (offset + day - 1) % 7;
      const button = document.createElement('button');
      button.className = `${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${date > today ? 'future' : ''} ${date === today ? 'today' : ''}`;
      button.dataset.date = date;
      button.append(text('span', day, 'day-number'));
      const ratio = date > today ? rows.length ? `예정 ${rows.length}` : '—' : stat.total ? `${stat.done}/${stat.total}` : rows.length ? '대상 없음' : '—';
      button.append(text('span', ratio, 'day-ratio'));
      if (date <= today && stat.total) {
        const bar = text('div', '', 'progress');
        const fill = progress(stat.rate);
        fill.style.background = stat.rate === 100 ? 'var(--green)' : stat.rate >= 60 ? '#14b8a6' : 'var(--amber)';
        bar.append(fill);button.append(bar);
      }
      button.setAttribute('aria-label', `${date}, ${date > today ? `예정 ${rows.length}개` : stat.total ? `${stat.total}개 중 ${stat.done}개 완료` : '완료 대상 없음'}`);
      if (date === today) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => selectDay(date));
      $('calendar').append(button);
    }
    const trailing = (7 - (offset + days) % 7) % 7;
    for (let i = 0; i < trailing; i++) $('calendar').append(text('div', '', 'blank'));
    selectDay(selected);
    const weeks = [];
    for (let start = 1; start <= days; ) {
      const finish = Math.min(days, start + (start === 1 ? 6 - offset : 6));
      const from = `${month}-${String(start).padStart(2, '0')}`;
      const to = `${month}-${String(finish).padStart(2, '0')}`;
      if (from <= today) weeks.push({ from, to, stats: statistics(past.filter((item) => item.date >= from && item.date <= to)) });
      start = finish + 1;
    }
    $('weeklyChart').replaceChildren();
    const max = Math.max(1, ...weeks.map((week) => week.stats.total));
    weeks.forEach((week, index) => {
      const col = text('div', '', 'week-column');
      col.append(text('span', `${week.stats.total}개`));
      const stack = text('div', '', 'week-stack');
      const pending = text('div', week.stats.total - week.stats.done || '', 'week-pending');
      pending.style.height = `${(week.stats.total - week.stats.done) / max * 170}px`;
      const done = text('div', week.stats.done || '', 'week-done');
      done.style.height = `${week.stats.done / max * 170}px`;
      stack.append(pending, done);col.append(stack);
      const label = text('div', `${index + 1}주${week.from <= today && week.to >= today ? ' · 진행 중' : ''}`, 'week-label');
      label.append(text('small', `${Number(week.from.slice(-2))}–${Number(week.to.slice(-2))}일`));col.append(label);
      col.setAttribute('aria-label', `${index + 1}주: 완료 ${week.stats.done}개, 미완료 ${week.stats.total - week.stats.done}개`);
      $('weeklyChart').append(col);
    });
    if (!weeks.length || !stats.total) $('weeklyChart').replaceChildren(text('p', '집계할 완료 대상이 없습니다.', 'empty'));
    const overdue = past.filter((item) => item.date < today && eligible(item) && !item.done).sort((a, b) => a.date.localeCompare(b.date));
    $('overdueSummary').textContent = overdue.length ? `총 ${overdue.length}개 · 날짜를 눌러 플래너로 이동하세요.` : '지난 날짜에 남아 있는 완료 대상이 없습니다.';
    $('overdueList').replaceChildren();
    overdue.forEach((item) => {
      const li = document.createElement('li');const link = document.createElement('a');
      link.href = `./index.html?date=${item.date}`;
      link.append(text('span', item.date.slice(5).replace('-', '.'), 'date-chip'), text('span', item.title, 'item-title'), text('span', '→', 'arrow'));
      li.append(link);$('overdueList').append(li);
    });
    $('reportStatus').textContent = `${month.replace('-', '년 ')}월 · ${month === today.slice(0, 7) ? `${Number(today.slice(-2))}일까지의 기록` : month > today.slice(0, 7) ? '미래 일정 미리보기' : '월 전체 기록'} · KST`;
  }
  async function load() {
    const id = ++requestId;
    $('reportMonth').value = month;
    $('prevMonth').disabled = month === '1900-01';$('nextMonth').disabled = month === '9999-12';
    $('reportContent').hidden = true;$('reportError').hidden = true;
    $('reportStatus').textContent = '월간 기록을 불러오는 중…';
    const url = new URL(location.href);url.searchParams.set('month', month);history.replaceState(null, '', url);
    try {
      const mode = api.getSettings().mode;
      $('dataMode').textContent = mode === 'local' ? '로컬 기록' : '계정 기록';
      // A single month never exceeds the local adapter's 31-day range limit.
      const last = lastDay(month);
      const result = await api.fetchSchedulesRange(`${month}-01`, last);
      if (id !== requestId) return;
      items = result;render();$('reportContent').hidden = false;
    } catch (error) {
      if (id !== requestId) return;
      $('reportStatus').textContent = '';
      $('errorText').textContent = `기록을 불러오지 못했습니다. ${error.message || '연결 상태를 확인해 주세요.'}`;
      $('reportError').hidden = false;
    }
  }
  function change(value) { if (!validMonth(value)) { $('reportMonth').value = month;return; } month = value;selected = month === today.slice(0, 7) ? today : `${month}-01`;void load(); }
  $('reportMonth').addEventListener('change', (event) => change(event.target.value));
  $('prevMonth').addEventListener('click', () => change(api.shiftDateStr(`${month}-01`, -1).slice(0, 7)));
  $('nextMonth').addEventListener('click', () => change(api.shiftDateStr(`${month}-28`, 4).slice(0, 7)));
  $('thisMonth').addEventListener('click', () => change(today.slice(0, 7)));
  $('retry').addEventListener('click', () => void load());
  void load();
})();
