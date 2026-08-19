-- Collapse the appendTranscript SELECT+UPDATE into a single round-trip.
--
-- Before: two sequential queries per voice turn:
--   1. SELECT transcript, turn_count FROM voice_calls WHERE id = $1
--   2. UPDATE voice_calls SET transcript = $2, turn_count = $3 WHERE id = $1
--
-- After: one RPC that does the concatenation server-side.

CREATE OR REPLACE FUNCTION append_voice_transcript(
  p_voice_call_id uuid,
  p_line          text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE voice_calls
  SET
    transcript = CASE
                   WHEN transcript IS NULL OR transcript = '' THEN p_line
                   ELSE transcript || E'\n' || p_line
                 END,
    turn_count = COALESCE(turn_count, 0) + 1
  WHERE id = p_voice_call_id;
$$;

GRANT EXECUTE ON FUNCTION append_voice_transcript(uuid, text) TO service_role;
