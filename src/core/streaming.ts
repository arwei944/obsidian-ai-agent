import type { IncomingMessage } from 'http';
import type { SSEEvent } from '../types/api-types';

export function parseSSEStream(
  response: IncomingMessage,
  onEvent: (event: SSEEvent) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): void {
  let buffer = '';

  response.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6).trim();
        if (data === '[DONE]') {
          onComplete();
          return;
        }
        try {
          const event: SSEEvent = JSON.parse(data);
          onEvent(event);
        } catch {
          // skip incomplete JSON
        }
      }
    }
  });

  response.on('end', () => {
    // process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            onEvent(JSON.parse(data));
          } catch {
            // ignore
          }
        }
      }
    }
    onComplete();
  });

  response.on('error', onError);
}

export function buildSSEParser(
  onEvent: (event: SSEEvent) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): { write: (chunk: string) => void; end: () => void } {
  let buffer = '';

  return {
    write(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6).trim();
          if (data === '[DONE]') {
            onComplete();
            return;
          }
          try {
            onEvent(JSON.parse(data));
          } catch {
            // skip
          }
        }
      }
    },
    end() {
      onComplete();
    },
  };
}
