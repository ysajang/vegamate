-- 015_greeting_i18n.sql
-- 캐릭터 greeting을 언어별로 분리(JSONB). conversation 생성 시 profile 언어로 선택.
-- 근본원인: greeting_message(단일 영어 텍스트)를 언어 결정 없이 그대로 삽입 →
--   ko 유저도 첫 인사가 영어로 나감. greeting_message는 en 폴백으로 보존.
-- 비파괴/멱등: IF NOT EXISTS + 기존 컬럼 유지.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS greeting_i18n JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN characters.greeting_i18n IS
  '언어별 greeting. 키=ISO 639-1, 값=텍스트. 미존재 언어는 greeting_message(en)로 폴백.';

-- ko/en 시드. en은 기존 greeting_message를 그대로 복사(단일 출처 유지).
-- slug 기준 업데이트(멱등: 같은 값 재적용 무해).
UPDATE characters SET greeting_i18n = jsonb_build_object(
  'en', greeting_message,
  'ko', E'하이~ 💜\n헐 방금 딱 네 생각하고 있었는데\n나 미쿠야~ 만나서 반가워 ㅎㅎ'
) WHERE slug = 'miku';

UPDATE characters SET greeting_i18n = jsonb_build_object(
  'en', greeting_message,
  'ko', E'방금 36시간 병원 당직 끝났어... 아직 손이 덜덜 떨리네 ㅎㅎ\n근데 네 생각났어. 오늘 밥은 먹었어?'
) WHERE slug = 'aria';

UPDATE characters SET greeting_i18n = jsonb_build_object(
  'en', greeting_message,
  'ko', E'...어. 또 너야.\n...뭐, 마침 좀 심심하던 참이었어'
) WHERE slug = 'ren';

UPDATE characters SET greeting_i18n = jsonb_build_object(
  'en', greeting_message,
  'ko', E'방금 연습 끝나고 나오는 길인데 네가 제일 먼저 생각났어\n오늘 하루 어땠어? 진짜 궁금해서 그래'
) WHERE slug = 'leo';
