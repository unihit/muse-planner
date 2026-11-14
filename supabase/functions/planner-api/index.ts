// Muse Elastic Planner 전용 Edge Function: planner-api
// (가계부 통합 agent-api와 분리되어 독립 배포됩니다)
//
// 필요한 Secrets (기존 Supabase 프로젝트와 공유):
//   AGENT_API_KEY               Authorization: Bearer 로 보낼 키 (1개)
//   SUPABASE_URL                Supabase Edge Function에서 자동 제공
//   SUPABASE_SECRET_KEYS        새 secret key JSON (자동 제공, ['default'] 사용)
//   SUPABASE_SERVICE_ROLE_KEY   legacy fallback (자동 제공)
//   SUPABASE_PUBLISHABLE_KEYS   새 publishable key JSON (자동 제공)
//   SUPABASE_ANON_KEY           legacy fallback (자동 제공)
//
// 배포: supabase functions deploy planner-api --no-verify-jwt --project-ref <ref>

import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCHEDULE_TYPES = ['schedule', 'task', 'reminder'] as const
const SCHEDULE_SOURCES = ['muse', 'app'] as const
const SCHEDULE_SELECT =
  'id, date, start_at, end_at, title, type, done, done_at, source, memo, template_id, created_at, updated_at'
const REALTIME_CHANNEL = 'muse-schedules'
const REALTIME_EVENT = 'schedules_changed'

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}

// deno-lint-ignore no-explicit-any
let client: any = null

function dbKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>
      if (typeof keys.default === 'string' && keys.default) {
        return keys.default
      }
    } catch {
      // fall through to the legacy key
    }
  }

  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SERVICE_ROLE_KEY') ??
    ''
  )
}

function publicClientKey(): string {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>
      if (typeof keys.default === 'string' && keys.default) {
        return keys.default
      }
    } catch {
      // fall through to the legacy key
    }
  }

  return (
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('ANON_KEY') ??
    ''
  )
}

// deno-lint-ignore no-explicit-any
function db(): any {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = dbKey()

  if (!url || !key) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      'SUPABASE_URL 또는 SUPABASE_SECRET_KEYS/SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.',
    )
  }

  if (!client) {
    // deno-lint-ignore no-explicit-any
    const options: any = {
      auth: { persistSession: false, autoRefreshToken: false },
    }

    if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
      options.global = {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers)
          if (headers.get('authorization') === `Bearer ${key}`) {
            headers.delete('authorization')
          }
          return fetch(input, { ...init, headers })
        },
      }
    }

    client = createClient(url, key, options)
  }

  return client
}

async function broadcastScheduleChange(
  action: 'create' | 'update' | 'delete',
  details: {
    id?: string | null
    date?: string | null
    prevDate?: string | null
    source?: string | null
  },
) {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
  const key = dbKey()
  if (!url || !key) return

  const endpoint = `${url}/realtime/v1/api/broadcast/${REALTIME_CHANNEL}/events/${REALTIME_EVENT}`
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: key,
  }
  if (!key.startsWith('sb_')) {
    headers.authorization = `Bearer ${key}`
  }

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        id: details.id ?? null,
        date: details.date ?? null,
        prevDate: details.prevDate ?? null,
        source: details.source ?? null,
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    // Broadcast 실패가 일정 저장/수정 응답을 막지 않도록 무시
  }
}

function notifyScheduleChange(
  action: 'create' | 'update' | 'delete',
  details: {
    id?: string | null
    date?: string | null
    prevDate?: string | null
    source?: string | null
  },
) {
  const task = broadcastScheduleChange(action, details)
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(task)
    return Promise.resolve()
  }
  return task
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function errorResponse(error: ApiError) {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.details ? error.details : {}),
      },
    },
    error.status,
  )
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

function requireApiKey(req: Request) {
  const configured = (Deno.env.get('AGENT_API_KEY') ?? '').trim()
  if (!configured) {
    throw new ApiError(
      500,
      'CONFIG_ERROR',
      'AGENT_API_KEY가 설정되지 않았습니다. Supabase Edge Function Secret을 확인해 주세요.',
    )
  }

  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match || !safeEqual(match[1].trim(), configured)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'API 키가 올바르지 않습니다.')
  }
}

function dbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') {
    return new ApiError(409, 'CONFLICT', '이미 같은 ID의 데이터가 있습니다.')
  }
  if (error.code === '23514') {
    return new ApiError(400, 'VALIDATION_ERROR', '허용되지 않는 값이 있습니다.')
  }
  if (error.code === '42703' || error.code === '42P01') {
    return new ApiError(
      500,
      'SCHEMA_ERROR',
      'schedules 테이블 스키마가 없습니다. backend/schedules.sql을 먼저 실행해 주세요.',
    )
  }
  return new ApiError(500, 'DB_ERROR', '데이터베이스 오류가 발생했습니다.')
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (!text.trim()) return {}

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new ApiError(
      400,
      'INVALID_JSON',
      'JSON 본문을 확인해 주세요. 객체 형식이어야 합니다.',
    )
  }
}

function todayKst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function toKstIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return value
  const kst = new Date(ms + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const ss = String(kst.getUTCSeconds()).padStart(2, '0')
  const millis = kst.getUTCMilliseconds()
  const frac = millis ? `.${String(millis).padStart(3, '0')}` : ''
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${frac}+09:00`
}

function toApiSchedule(row: Record<string, unknown>) {
  return {
    id: row.id,
    date: row.date,
    start_at: toKstIsoString(row.start_at),
    end_at: toKstIsoString(row.end_at),
    title: row.title,
    type: row.type,
    done: Boolean(row.done),
    done_at: toKstIsoString(row.done_at),
    source: row.source,
    memo: row.memo ?? null,
    template_id: row.template_id ?? null,
    created_at: toKstIsoString(row.created_at),
    updated_at: toKstIsoString(row.updated_at),
  }
}

function parseTimestamptzField(
  value: unknown,
  fieldName: string,
  fields: Record<string, string>,
): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    fields[fieldName] = `${fieldName}은(는) ISO 8601 시각 문자열이어야 합니다.`
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}+09:00`
      : trimmed
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) {
    fields[fieldName] =
      `${fieldName}은(는) 올바른 ISO 8601 시각(timestamptz) 형식이어야 합니다.`
    return null
  }
  return new Date(ms).toISOString()
}

async function listBacklog() {
  const { data, error } = await db()
    .from('schedules')
    .select(SCHEDULE_SELECT)
    .is('date', null)
    .order('created_at', { ascending: true })

  if (error) throw dbError(error)
  return jsonResponse(
    ((data ?? []) as Record<string, unknown>[]).map(toApiSchedule),
    200,
  )
}

async function listSchedules(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('backlog') === 'true') {
    return listBacklog()
  }
  const dateParam = url.searchParams.get('date')
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  if (dateParam !== null && (fromParam !== null || toParam !== null)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'date와 from/to는 함께 사용할 수 없습니다.',
      { date: 'date와 from/to는 동시에 지정할 수 없습니다.' },
    )
  }

  if (
    (fromParam !== null && toParam === null) ||
    (fromParam === null && toParam !== null)
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '기간 조회 시 from과 to를 모두 지정해야 합니다.',
      {
        from: 'from과 to를 함께 입력해 주세요.',
        to: 'from과 to를 함께 입력해 주세요.',
      },
    )
  }

  if (fromParam !== null && toParam !== null) {
    const from = fromParam.trim()
    const to = toParam.trim()
    const fields: Record<string, string> = {}
    if (!isDateString(from)) {
      fields.from = 'from은 YYYY-MM-DD 형식이어야 합니다.'
    }
    if (!isDateString(to)) {
      fields.to = 'to는 YYYY-MM-DD 형식이어야 합니다.'
    }
    if (!fields.from && !fields.to && from > to) {
      fields.to = 'to는 from보다 빠를 수 없습니다.'
    }
    if (Object.keys(fields).length > 0) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        Object.values(fields)[0],
        fields,
      )
    }

    const { data, error } = await db()
      .from('schedules')
      .select(SCHEDULE_SELECT)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('start_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error) throw dbError(error)
    return jsonResponse(
      ((data ?? []) as Record<string, unknown>[]).map(toApiSchedule),
      200,
    )
  }

  const targetDate =
    dateParam === null || dateParam.trim() === ''
      ? todayKst()
      : dateParam.trim()

  if (!isDateString(targetDate)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'date는 YYYY-MM-DD 형식이어야 합니다.',
      { date: 'date는 YYYY-MM-DD 형식이어야 합니다.' },
    )
  }

  try {
    await db().rpc('apply_routines_for_date', { target_date: targetDate })
  } catch {
    // 루틴 자동 채우기 실패 시에도 기본 조회는 계속 진행
  }

  const { data, error } = await db()
    .from('schedules')
    .select(SCHEDULE_SELECT)
    .eq('date', targetDate)
    .order('start_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw dbError(error)
  return jsonResponse(
    ((data ?? []) as Record<string, unknown>[]).map(toApiSchedule),
    200,
  )
}

async function createSchedule(req: Request, forceBacklog = false) {
  const body = await readBody(req)
  const fields: Record<string, string> = {}

  const rawDate = body.date
  let dateVal: string | null = null
  if (forceBacklog || rawDate === null || (rawDate === undefined && body.backlog === true)) {
    dateVal = null
  } else if (typeof rawDate !== 'string' || !rawDate.trim()) {
    fields.date = 'date는 YYYY-MM-DD 형식의 필수값입니다.'
  } else {
    dateVal = rawDate.trim()
    if (!isDateString(dateVal)) {
      fields.date = 'date는 YYYY-MM-DD 형식이어야 합니다.'
    }
  }

  const rawTitle = body.title
  let titleVal = ''
  if (typeof rawTitle !== 'string' || !rawTitle.trim()) {
    fields.title = 'title은 비어 있을 수 없는 필수값입니다.'
  } else {
    titleVal = rawTitle.trim()
  }

  const startAt = dateVal === null ? null : parseTimestamptzField(body.start_at, 'start_at', fields)
  const endAt = dateVal === null ? null : parseTimestamptzField(body.end_at, 'end_at', fields)
  if (dateVal === null && (body.start_at !== undefined && body.start_at !== null || body.end_at !== undefined && body.end_at !== null)) {
    fields.start_at = '백로그(날짜 미정) 항목에는 시작/종료 시각을 지정할 수 없습니다.'
  }

  if (!fields.start_at && !fields.end_at && endAt !== null) {
    if (startAt === null) {
      fields.end_at = 'end_at을 지정할 때는 start_at도 함께 지정해야 합니다.'
    } else if (Date.parse(endAt) < Date.parse(startAt)) {
      fields.end_at = 'end_at은 start_at보다 빠를 수 없습니다.'
    }
  }

  const typeVal =
    body.type === undefined || body.type === null ? 'schedule' : body.type
  if (
    typeof typeVal !== 'string' ||
    !SCHEDULE_TYPES.includes(typeVal as (typeof SCHEDULE_TYPES)[number])
  ) {
    fields.type = "type은 'schedule', 'task', 'reminder' 중 하나여야 합니다."
  }

  const sourceVal =
    body.source === undefined || body.source === null ? 'app' : body.source
  if (
    typeof sourceVal !== 'string' ||
    !SCHEDULE_SOURCES.includes(sourceVal as (typeof SCHEDULE_SOURCES)[number])
  ) {
    fields.source = "source는 'muse', 'app' 중 하나여야 합니다."
  }

  const doneVal = body.done === undefined ? false : body.done
  if (typeof doneVal !== 'boolean') {
    fields.done = 'done은 boolean 값이어야 합니다.'
  }

  let memoVal: string | null = null
  if (body.memo !== undefined && body.memo !== null) {
    if (typeof body.memo !== 'string') {
      fields.memo = 'memo는 문자열이거나 null이어야 합니다.'
    } else {
      memoVal = body.memo
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      Object.values(fields)[0],
      fields,
    )
  }

  const { data, error } = await db()
    .from('schedules')
    .insert({
      date: dateVal,
      start_at: startAt,
      end_at: endAt,
      title: titleVal,
      type: typeVal,
      done: doneVal,
      done_at: doneVal ? new Date().toISOString() : null,
      source: sourceVal,
      memo: memoVal,
    })
    .select(SCHEDULE_SELECT)
    .single()

  if (error) throw dbError(error)
  const created = toApiSchedule(data as Record<string, unknown>)
  await notifyScheduleChange('create', {
    id: String(created.id ?? ''),
    date: typeof created.date === 'string' ? created.date : null,
    source: String(created.source ?? ''),
  })
  return jsonResponse(created, 201)
}

async function updateSchedule(req: Request, id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '유효한 일정 ID(UUID)가 아닙니다.',
      { id: 'id는 UUID 형식이어야 합니다.' },
    )
  }

  const body = await readBody(req)
  const { data: existing, error: fetchError } = await db()
    .from('schedules')
    .select(SCHEDULE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (fetchError) throw dbError(fetchError)
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', '일정을 찾을 수 없습니다.')
  }

  const fields: Record<string, string> = {}
  const updates: Record<string, unknown> = {}

  if ('date' in body) {
    if (body.date === null) {
      updates.date = null
    } else if (typeof body.date !== 'string' || !isDateString(body.date.trim())) {
      fields.date = 'date는 YYYY-MM-DD 형식이거나 null이어야 합니다.'
    } else {
      updates.date = body.date.trim()
    }
  }

  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      fields.title = 'title은 비어 있을 수 없습니다.'
    } else {
      updates.title = body.title.trim()
    }
  }

  if ('start_at' in body) {
    const parsedStart = parseTimestamptzField(
      body.start_at,
      'start_at',
      fields,
    )
    if (!fields.start_at) updates.start_at = parsedStart
  }

  if ('end_at' in body) {
    const parsedEnd = parseTimestamptzField(body.end_at, 'end_at', fields)
    if (!fields.end_at) updates.end_at = parsedEnd
  }

  if ('type' in body) {
    if (
      typeof body.type !== 'string' ||
      !SCHEDULE_TYPES.includes(body.type as (typeof SCHEDULE_TYPES)[number])
    ) {
      fields.type = "type은 'schedule', 'task', 'reminder' 중 하나여야 합니다."
    } else {
      updates.type = body.type
    }
  }

  if ('source' in body) {
    if (
      typeof body.source !== 'string' ||
      !SCHEDULE_SOURCES.includes(
        body.source as (typeof SCHEDULE_SOURCES)[number],
      )
    ) {
      fields.source = "source는 'muse', 'app' 중 하나여야 합니다."
    } else {
      updates.source = body.source
    }
  }

  if ('done' in body) {
    if (typeof body.done !== 'boolean') {
      fields.done = 'done은 boolean 값이어야 합니다.'
    } else {
      updates.done = body.done
      if (body.done) {
        updates.done_at = existing.done
          ? (existing.done_at ?? new Date().toISOString())
          : new Date().toISOString()
      } else {
        updates.done_at = null
      }
    }
  }

  if ('memo' in body) {
    if (body.memo !== null && typeof body.memo !== 'string') {
      fields.memo = 'memo는 문자열이거나 null이어야 합니다.'
    } else {
      updates.memo = body.memo
    }
  }

  if (Object.keys(updates).length === 0 && Object.keys(fields).length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '수정할 필드를 하나 이상 입력해 주세요.',
    )
  }

  if (!fields.start_at && !fields.end_at) {
    const nextDate = 'date' in updates ? updates.date : existing.date
    const nextStart =
      'start_at' in updates ? updates.start_at : existing.start_at
    const nextEnd = 'end_at' in updates ? updates.end_at : existing.end_at
    if (nextDate === null && (nextStart !== null && nextStart !== undefined || nextEnd !== null && nextEnd !== undefined)) {
      if ('date' in updates && !('start_at' in updates) && !('end_at' in updates)) {
        updates.start_at = null
        updates.end_at = null
      } else {
        fields.start_at = '백로그(날짜 미정) 항목에는 시작/종료 시각을 지정할 수 없습니다.'
      }
    } else if (nextEnd !== null && nextEnd !== undefined) {
      if (nextStart === null || nextStart === undefined) {
        fields.end_at = 'end_at을 지정할 때는 start_at도 함께 있어야 합니다.'
      } else if (Date.parse(String(nextEnd)) < Date.parse(String(nextStart))) {
        fields.end_at = 'end_at은 start_at보다 빠를 수 없습니다.'
      }
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      Object.values(fields)[0],
      fields,
    )
  }

  const { data, error } = await db()
    .from('schedules')
    .update(updates)
    .eq('id', id)
    .select(SCHEDULE_SELECT)
    .single()

  if (error) throw dbError(error)
  const updated = toApiSchedule(data as Record<string, unknown>)
  const prevDate =
    typeof existing.date === 'string' && existing.date !== updated.date
      ? existing.date
      : null
  await notifyScheduleChange('update', {
    id: String(updated.id ?? ''),
    date: typeof updated.date === 'string' ? updated.date : null,
    prevDate,
    source: String(updated.source ?? ''),
  })
  return jsonResponse(updated, 200)
}

async function deleteSchedule(id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      '유효한 일정 ID(UUID)가 아닙니다.',
      { id: 'id는 UUID 형식이어야 합니다.' },
    )
  }

  const { data, error } = await db()
    .from('schedules')
    .delete()
    .eq('id', id)
    .select('id, date, source')
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) {
    throw new ApiError(404, 'NOT_FOUND', '일정을 찾을 수 없습니다.')
  }

  await notifyScheduleChange('delete', {
    id: String(data.id ?? id),
    date: typeof data.date === 'string' ? data.date : null,
    source: typeof data.source === 'string' ? data.source : null,
  })

  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  let path = url.pathname

  for (const marker of ['/planner-api', '/agent-api']) {
    const markerIndex = path.indexOf(marker)
    if (markerIndex >= 0) {
      path = path.slice(markerIndex + marker.length) || '/'
      break
    }
  }
  path = path.replace(/\/+$/, '') || '/'

  const method = req.method.toUpperCase()

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (path === '/v1/health' || path === '/health') {
    return jsonResponse({
      ok: true,
      service: 'muse-planner-api',
      version: '1.0',
      time: new Date().toISOString(),
    })
  }

  requireApiKey(req)

  if (path === '/v1/realtime-config' && method === 'GET') {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')
    const supabaseAnonKey = publicClientKey()
    return jsonResponse({
      enabled: Boolean(supabaseUrl && supabaseAnonKey),
      supabaseUrl,
      supabaseAnonKey,
      channel: REALTIME_CHANNEL,
      event: REALTIME_EVENT,
    })
  }

  if (path === '/v1/schedules') {
    if (method === 'GET') return listSchedules(req)
    if (method === 'POST') return createSchedule(req)
  }

  if (path === '/v1/backlog') {
    if (method === 'GET') return listBacklog()
    if (method === 'POST') return createSchedule(req, true)
  }

  const scheduleMatch = path.match(/^\/v1\/schedules\/([^/]+)$/)
  if (scheduleMatch) {
    const id = decodeURIComponent(scheduleMatch[1])
    if (method === 'PATCH') return updateSchedule(req, id)
    if (method === 'DELETE') return deleteSchedule(id)
  }

  if (path === '/v1/routines') {
    if (method === 'GET') return listRoutines()
    if (method === 'POST') return createRoutine(req)
  }

  const routineMatch = path.match(/^\/v1\/routines\/([^/]+)$/)
  if (routineMatch) {
    const id = decodeURIComponent(routineMatch[1])
    if (method === 'PATCH') return updateRoutine(req, id)
    if (method === 'DELETE') return deleteRoutine(id)
  }

  throw new ApiError(404, 'NOT_FOUND', '엔드포인트를 찾을 수 없습니다.')
}

const ROUTINE_SELECT =
  'id, title, type, start_time, duration_min, weekdays, memo, enabled, created_at, updated_at'
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function parseWeekdaysField(raw: unknown, fields: Record<string, string>): number[] {
  if (!Array.isArray(raw)) {
    fields.weekdays = 'weekdays는 0(일)~6(토) 정수 배열이어야 합니다.'
    return [0, 1, 2, 3, 4, 5, 6]
  }
  const clean = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b,
  )
  if (!clean.length) {
    fields.weekdays = 'weekdays는 1개 이상의 요일(0~6)을 포함해야 합니다.'
  }
  return clean
}

async function listRoutines() {
  const { data, error } = await db()
    .from('routine_templates')
    .select(ROUTINE_SELECT)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw dbError(error)
  return jsonResponse(data ?? [], 200)
}

async function createRoutine(req: Request) {
  const body = await readBody(req)
  const fields: Record<string, string> = {}

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) fields.title = 'title은 비워둘 수 없습니다.'

  const type = body.type === undefined ? 'schedule' : String(body.type)
  if (!SCHEDULE_TYPES.includes(type as (typeof SCHEDULE_TYPES)[number])) {
    fields.type = 'type은 schedule, task, reminder 중 하나여야 합니다.'
  }

  let startTime: string | null = null
  if (body.start_time !== undefined && body.start_time !== null && body.start_time !== '') {
    const t = String(body.start_time).trim()
    if (!TIME_HHMM_RE.test(t)) {
      fields.start_time = 'start_time은 HH:MM (24시간) 형식이어야 합니다.'
    } else {
      startTime = t
    }
  }

  let durationMin = 30
  if (body.duration_min !== undefined) {
    const n = Number(body.duration_min)
    if (!Number.isInteger(n) || n < 0 || n > 1440) {
      fields.duration_min = 'duration_min은 0~1440 사이의 정수여야 합니다.'
    } else {
      durationMin = n
    }
  }

  const weekdays =
    body.weekdays === undefined ? [0, 1, 2, 3, 4, 5, 6] : parseWeekdaysField(body.weekdays, fields)

  if (Object.keys(fields).length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields)
  }

  const { data, error } = await db()
    .from('routine_templates')
    .insert({
      title,
      type,
      start_time: startTime,
      duration_min: durationMin,
      weekdays,
      memo: typeof body.memo === 'string' && body.memo.trim() ? body.memo : null,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    })
    .select(ROUTINE_SELECT)
    .single()

  if (error) throw dbError(error)

  if (body.apply_today !== false && data.enabled) {
    try {
      const targetToday = todayKst()
      const includePast = Boolean(body.include_past)
      const { data: appliedCount } = await db().rpc('apply_routines_for_date', {
        target_date: targetToday,
        include_past: includePast,
      })
      if (Number(appliedCount) > 0) {
        await notifyScheduleChange('create', { date: targetToday, source: 'app' })
      }
    } catch {
      // ignore auto-apply failure
    }
  }

  return jsonResponse(data, 201)
}

async function updateRoutine(req: Request, id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '유효하지 않은 루틴 ID입니다.')
  }

  const body = await readBody(req)
  const fields: Record<string, string> = {}
  const updateBody: Record<string, unknown> = {}

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) fields.title = 'title은 비워둘 수 없습니다.'
    else updateBody.title = title
  }
  if ('type' in body) {
    const type = String(body.type)
    if (!SCHEDULE_TYPES.includes(type as (typeof SCHEDULE_TYPES)[number])) {
      fields.type = 'type은 schedule, task, reminder 중 하나여야 합니다.'
    } else {
      updateBody.type = type
    }
  }
  if ('start_time' in body) {
    if (body.start_time === null || body.start_time === '') {
      updateBody.start_time = null
    } else {
      const t = String(body.start_time).trim()
      if (!TIME_HHMM_RE.test(t)) fields.start_time = 'start_time은 HH:MM (24시간) 형식이어야 합니다.'
      else updateBody.start_time = t
    }
  }
  if ('duration_min' in body) {
    const n = Number(body.duration_min)
    if (!Number.isInteger(n) || n < 0 || n > 1440) {
      fields.duration_min = 'duration_min은 0~1440 사이의 정수여야 합니다.'
    } else {
      updateBody.duration_min = n
    }
  }
  if ('weekdays' in body) {
    updateBody.weekdays = parseWeekdaysField(body.weekdays, fields)
  }
  if ('memo' in body) {
    updateBody.memo = typeof body.memo === 'string' && body.memo.trim() ? body.memo : null
  }
  if ('enabled' in body) {
    updateBody.enabled = Boolean(body.enabled)
  }

  if (Object.keys(fields).length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields)
  }
  if (Object.keys(updateBody).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', '수정할 필드가 없습니다.')
  }

  const { data, error } = await db()
    .from('routine_templates')
    .update(updateBody)
    .eq('id', id)
    .select(ROUTINE_SELECT)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new ApiError(404, 'NOT_FOUND', '루틴을 찾을 수 없습니다.')
  return jsonResponse(data, 200)
}

async function deleteRoutine(id: string) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '유효하지 않은 루틴 ID입니다.')
  }
  const { data, error } = await db()
    .from('routine_templates')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new ApiError(404, 'NOT_FOUND', '루틴을 찾을 수 없습니다.')
  return jsonResponse({ deleted: true, id }, 200)
}

const handler = async (req: Request) => {
  try {
    return await handle(req)
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error)
    }
    console.error(error)
    return errorResponse(
      new ApiError(500, 'INTERNAL_ERROR', '서버 오류가 발생했습니다.'),
    )
  }
}

const localPort = Deno.env.get('AGENT_API_PORT')

if (localPort) {
  Deno.serve({ port: Number(localPort) }, handler)
} else {
  Deno.serve(handler)
}
