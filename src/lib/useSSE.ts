import { useEffect, useRef, useCallback } from 'react';

interface SSEEvent {
  type: string;
  userId: string;
  version?: number;
}

interface SSEHandlers {
  onProfileUpdated?: (event: SSEEvent) => void;
}

export function useSSE(handlers: SSEHandlers, enabled = true) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastVersionRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventRef = useRef<SSEEvent | null>(null);
  const maxReconnectDelay = 30000;
  const DEBOUNCE_MS = 250;

  const cleanup = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      pendingEventRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const flushPending = useCallback(() => {
    const event = pendingEventRef.current;
    pendingEventRef.current = null;
    debounceTimerRef.current = null;
    if (event && handlersRef.current.onProfileUpdated) {
      handlersRef.current.onProfileUpdated(event);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    cleanup();

    const token = localStorage.getItem('app_auth_token');
    if (!token) return;

    const es = new EventSource(`/api/sse/subscribe?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = es;

    es.addEventListener('message', (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        if (data.type !== 'profile.updated' || !handlersRef.current.onProfileUpdated) {
          return;
        }

        if (data.version !== undefined && data.version <= lastVersionRef.current) {
          return;
        }

        if (data.version !== undefined) {
          lastVersionRef.current = data.version;
        }

        pendingEventRef.current = data;

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
      } catch {
        // Ignore malformed events
      }
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      reconnectAttemptRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), maxReconnectDelay);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    es.onopen = () => {
      reconnectAttemptRef.current = 0;
    };
  }, [enabled, cleanup, flushPending]);

  useEffect(() => {
    connect();
    return () => {
      cleanup();
      reconnectAttemptRef.current = 0;
      lastVersionRef.current = 0;
    };
  }, [connect, cleanup]);
}
