import { useEffect, useRef } from 'react';

/**
 * Subscribe to a server-sent-events endpoint and invoke the handler for the
 * given event names. Reconnects automatically (EventSource built-in).
 */
export function useSSE(url, eventNames, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const source = new EventSource(url);
    const listener = (event) => {
      let data = {};
      try { data = JSON.parse(event.data); } catch { /* keep {} */ }
      handlerRef.current(event.type, data);
    };
    for (const name of eventNames) source.addEventListener(name, listener);
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, eventNames.join(',')]);
}
