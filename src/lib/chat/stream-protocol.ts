/**
 * Minimal SSE (Server-Sent Events) framing for the chat stream.
 *
 * The chat route streams two event kinds:
 *   - `delta` : an incremental chunk of the assistant's reply text.
 *   - `meta`  : a single terminal payload with all business data
 *               (saved messages, hearts, gift, exhausted flag, upgrade prompt).
 *
 * We hand-roll the framing (rather than pull a dep) and keep the parser a pure,
 * tested function so the streaming client logic can't silently corrupt message
 * boundaries. Frames are newline-delimited JSON, one event per line:
 *
 *     {"t":"delta","v":"안녕"}\n
 *     {"t":"delta","v":"!"}\n
 *     {"t":"meta","v":{...}}\n
 *
 * NDJSON (newline-delimited JSON) is used instead of classic `data:` SSE because
 * it's trivial to parse incrementally and carries no field-name overhead.
 */

export type StreamEvent =
  | { t: 'delta'; v: string }
  | { t: 'meta'; v: unknown }
  | { t: 'error'; v: string };

/** Serialize one event to a single NDJSON line (including the trailing \n). */
export function encodeStreamEvent(ev: StreamEvent): string {
  return JSON.stringify(ev) + '\n';
}

/**
 * Stateful incremental decoder. Feed it raw string chunks as they arrive off
 * the network; it returns whatever COMPLETE events are now available and
 * retains any partial trailing line for the next call.
 */
export class StreamDecoder {
  private buffer = '';

  /** Push a raw chunk; get back any newly-completed events. */
  push(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];

    let nlIndex = this.buffer.indexOf('\n');
    while (nlIndex !== -1) {
      const line = this.buffer.slice(0, nlIndex);
      this.buffer = this.buffer.slice(nlIndex + 1);

      const trimmed = line.trim();
      if (trimmed.length > 0) {
        const ev = safeParseEvent(trimmed);
        if (ev) events.push(ev);
      }

      nlIndex = this.buffer.indexOf('\n');
    }

    return events;
  }

  /**
   * Flush any final buffered line at stream end (in case the last event wasn't
   * newline-terminated). Returns the event if the remainder is a valid frame.
   */
  flush(): StreamEvent[] {
    const trimmed = this.buffer.trim();
    this.buffer = '';
    if (trimmed.length === 0) return [];
    const ev = safeParseEvent(trimmed);
    return ev ? [ev] : [];
  }
}

/** Parse a single NDJSON line into a StreamEvent, or null if malformed. */
export function safeParseEvent(line: string): StreamEvent | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;

  if (rec.t === 'delta' && typeof rec.v === 'string') {
    return { t: 'delta', v: rec.v };
  }
  if (rec.t === 'meta') {
    return { t: 'meta', v: rec.v };
  }
  if (rec.t === 'error' && typeof rec.v === 'string') {
    return { t: 'error', v: rec.v };
  }
  return null;
}
