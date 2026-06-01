-- 010_message_edit_delete.sql
-- Message edit + soft-delete support.
--
-- Design:
--   * Soft delete only (deleted_at). Rows are NEVER hard-deleted so they remain
--     available for moderation / legal / safety review. They are hidden from the
--     UI and excluded from AI context.
--   * Edits keep an append-only edit_history so the original wording is preserved
--     (prevents using "edit" to scrub a crisis/abuse message from the record).
--   * Hearts are not refunded on delete (credits_consumed is left untouched).

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edited_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edit_history JSONB       DEFAULT '[]'::jsonb;

-- Active-message lookups (history / pagination) filter on
-- conversation_id + created_at WHERE deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_messages_active
  ON messages (conversation_id, created_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN messages.deleted_at IS
  'Soft-delete timestamp. Row retained for safety/audit; hidden from UI and AI context.';
COMMENT ON COLUMN messages.edited_at IS
  'Last edit timestamp (user messages only).';
COMMENT ON COLUMN messages.edit_history IS
  'Append-only prior versions: [{ "content": text, "edited_at": timestamptz }]. Preserves original wording for moderation/audit.';
