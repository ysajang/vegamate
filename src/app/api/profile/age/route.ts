import { NextRequest } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, withErrorHandler, AppError } from '@/lib/api-utils';

/**
 * POST /api/profile/age
 *
 * Age gate write path. The client submits a self-reported birth date; the
 * SERVER is the sole authority that decides adulthood and writes the cached
 * `age_verified_adult` flag. The client can never set that flag directly
 * (it is not in the /api/profile PATCH whitelist), so a forged client
 * request cannot bypass the gate — the worst it can do is lie about its DOB,
 * which is the same residual risk as any self-reported age gate.
 *
 * KR 기준: 만 19세 이상 = 성인 (청소년보호법 / 정보통신망법 성인 콘텐츠).
 * We compute 만 나이 (Western age) conservatively from the calendar date.
 */

const KR_ADULT_AGE = 19;

/** Compute 만 나이 (full years elapsed) as of `now`, in a fixed timezone-safe way. */
function computeAge(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = now.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

/**
 * Parse + validate a YYYY-MM-DD birth date string.
 * Rejects: bad format, non-existent calendar dates, future dates,
 * and unrealistic ages (> 120 years).
 */
function parseBirthDate(input: unknown): Date {
  if (typeof input !== 'string') {
    throw new AppError('생년월일을 입력해 주세요.');
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) {
    throw new AppError('생년월일 형식이 올바르지 않아요.');
  }
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]); // 1-31

  // Construct as UTC midnight and verify the components round-trip
  // (catches impossible dates like 2024-02-30 -> normalized away).
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError('존재하지 않는 날짜예요.');
  }

  const now = new Date();
  if (date.getTime() > now.getTime()) {
    throw new AppError('미래 날짜는 입력할 수 없어요.');
  }

  const age = computeAge(date, now);
  if (age > 120) {
    throw new AppError('생년월일을 다시 확인해 주세요.');
  }

  return date;
}

async function postHandler(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('Unauthorized', 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    throw new AppError('Invalid request body');
  }

  const birth = parseBirthDate((body as Record<string, unknown>).birth_date);
  const age = computeAge(birth, new Date());
  const isAdult = age >= KR_ADULT_AGE;

  // birth_date stored as YYYY-MM-DD (date column). PII minimization: we keep
  // only the DOB required for the legal age gate, nothing more granular.
  const birthDateStr = birth.toISOString().slice(0, 10);

  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient
    .from('profiles')
    .update({
      birth_date: birthDateStr,
      age_verified_adult: isAdult,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.error('[Profile/Age] Update error:', error);
    throw new AppError('연령 인증 처리에 실패했어요. 잠시 후 다시 시도해 주세요.', 500);
  }

  // We deliberately do NOT echo birth_date back to the client.
  return apiSuccess({ age_verified_adult: isAdult, is_minor: !isAdult });
}

export const POST = withErrorHandler(postHandler);
