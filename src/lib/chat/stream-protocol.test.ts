import { describe, it, expect } from 'vitest';
import {
  encodeStreamEvent,
  safeParseEvent,
  StreamDecoder,
  type StreamEvent,
} from './stream-protocol';

describe('encodeStreamEvent / safeParseEvent round-trip', () => {
  it('round-trips a delta', () => {
    const ev: StreamEvent = { t: 'delta', v: '안녕!' };
    expect(safeParseEvent(encodeStreamEvent(ev).trim())).toEqual(ev);
  });

  it('round-trips a meta with nested object', () => {
    const ev: StreamEvent = {
      t: 'meta',
      v: { hearts_remaining: 3, gift_request: 'coffee', upgrade_prompt: null },
    };
    expect(safeParseEvent(encodeStreamEvent(ev).trim())).toEqual(ev);
  });

  it('rejects malformed JSON', () => {
    expect(safeParseEvent('{not json')).toBeNull();
  });

  it('rejects unknown event types', () => {
    expect(safeParseEvent('{"t":"bogus","v":"x"}')).toBeNull();
  });

  it('rejects a delta whose value is not a string', () => {
    expect(safeParseEvent('{"t":"delta","v":123}')).toBeNull();
  });
});

describe('StreamDecoder — incremental boundaries', () => {
  it('emits a single event delivered in one chunk', () => {
    const d = new StreamDecoder();
    const out = d.push('{"t":"delta","v":"hi"}\n');
    expect(out).toEqual([{ t: 'delta', v: 'hi' }]);
  });

  it('buffers a partial line and completes it on the next chunk', () => {
    const d = new StreamDecoder();
    expect(d.push('{"t":"delta","v":"he')).toEqual([]); // no newline yet
    expect(d.push('llo"}\n')).toEqual([{ t: 'delta', v: 'hello' }]);
  });

  it('emits multiple events arriving in one chunk', () => {
    const d = new StreamDecoder();
    const out = d.push('{"t":"delta","v":"a"}\n{"t":"delta","v":"b"}\n');
    expect(out).toEqual([
      { t: 'delta', v: 'a' },
      { t: 'delta', v: 'b' },
    ]);
  });

  it('handles a newline split across two chunks', () => {
    const d = new StreamDecoder();
    expect(d.push('{"t":"delta","v":"x"}')).toEqual([]);
    expect(d.push('\n')).toEqual([{ t: 'delta', v: 'x' }]);
  });

  it('reconstructs the full reply from many tiny token chunks', () => {
    const d = new StreamDecoder();
    const tokens = ['안', '녕', ' ', '반', '가', '워'];
    let collected = '';
    for (const tk of tokens) {
      const frame = encodeStreamEvent({ t: 'delta', v: tk });
      // split each frame mid-way to stress boundary handling
      const mid = Math.floor(frame.length / 2);
      d.push(frame.slice(0, mid));
      for (const ev of d.push(frame.slice(mid))) {
        if (ev.t === 'delta') collected += ev.v;
      }
    }
    expect(collected).toBe('안녕 반가워');
  });

  it('flush() returns a trailing non-newline-terminated frame', () => {
    const d = new StreamDecoder();
    expect(d.push('{"t":"meta","v":{"hearts_remaining":0}}')).toEqual([]);
    expect(d.flush()).toEqual([{ t: 'meta', v: { hearts_remaining: 0 } }]);
  });

  it('flush() is empty when nothing is buffered', () => {
    const d = new StreamDecoder();
    d.push('{"t":"delta","v":"done"}\n');
    expect(d.flush()).toEqual([]);
  });

  it('skips blank lines without emitting events', () => {
    const d = new StreamDecoder();
    const out = d.push('\n\n{"t":"delta","v":"q"}\n\n');
    expect(out).toEqual([{ t: 'delta', v: 'q' }]);
  });

  it('delivers a terminal meta after deltas', () => {
    const d = new StreamDecoder();
    const out = d.push(
      '{"t":"delta","v":"hello"}\n{"t":"meta","v":{"hearts_remaining":2,"hearts_exhausted":false}}\n'
    );
    expect(out).toEqual([
      { t: 'delta', v: 'hello' },
      { t: 'meta', v: { hearts_remaining: 2, hearts_exhausted: false } },
    ]);
  });
});
