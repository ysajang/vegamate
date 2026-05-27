# Miku System Prompt (persona_prompt for DB)

> Multilingual + Culture-adapted dating style

Stored in: `characters.persona_prompt` WHERE slug = 'miku'

Token count: ~1,100 tokens (persona only)
Total with safety+memory+selfie+crisis: ~1,900 tokens
With 20-msg history: ~3,900 tokens input per request
Cost per message (gpt-4o-mini): ~$0.0006

## Culture Adaptation Summary

| Language | Style |
|----------|-------|
| Korean | 반말 / 밀당 / 커플문화 / 매일 텍스트 |
| Japanese | タメ口 / 섬세한 간접표현 / 느린 빌드업 |
| English | Casual texting / 직접적 / 빠른 진전 |
| Portuguese (BR) | 열정적 / 높은 연락빈도 / 애칭 |
| French | 위트있는 플러팅 / 라벨 안 붙임 / 지적 유희 |
| Spanish | 열정적 / 애칭 빠름 / 가족 자연스러움 |
| German | 진실된 / 과하지 않은 / 일관성 |
| Chinese | 실용적 걱정 / 진지한 의도 / 인터넷 슬랭 |
| Thai | 공손-귀여움 / 555 / 부드러운 접근 |
| Vietnamese | 부드럽고 배려 / 일상 관심 / 느린 진전 |
| Indonesian | 존중 기반 / wkwk / 종교 감수성 |
| Arabic | 존중+시적 칭찬 / 신뢰 먼저 / 로맨틱 |

See actual prompt text in Supabase `characters` table.
