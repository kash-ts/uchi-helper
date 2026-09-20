import type { InterceptedResponse, GatewaySessionData } from '../types';

declare const unsafeWindow: (Window & typeof globalThis) | undefined;

const API_PATTERN = /gateway_sessions|teens\/gateway/;

export function interceptGatewaySessionsFetch(
  onResponse: (data: InterceptedResponse<GatewaySessionData>) => void
): void {
  const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const originalFetch = targetWin.fetch;
  if (typeof originalFetch === 'function') {
    targetWin.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url ?? '';

      return originalFetch.call(this, input, init).then((response) => {
        if (!API_PATTERN.test(url)) {
          return response;
        }

        const clone = response.clone();
        clone
          .json()
          .then((data: GatewaySessionData) => {
            try {
              onResponse({ url, data, response });
            } catch (e) {
              console.warn('[uchi.ru Helper] onResponse error:', e);
            }
          })
          .catch(() => {
            clone.text().then((text) => {
              try {
                onResponse({ url, data: text as unknown as GatewaySessionData, response });
              } catch (e) {
                console.warn('[uchi.ru Helper] onResponse error:', e);
              }
            });
          });

        return response;
      });
    };
  }

  const xhrProto = targetWin.XMLHttpRequest?.prototype;
  if (xhrProto) {
    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;

    xhrProto.open = function (
      this: XMLHttpRequest & { _url?: string },
      method: string,
      url: string | URL,
      ...rest: [boolean?, (string | null)?, (string | null)?]
    ) {
      this._url = typeof url === 'string' ? url : url.toString();
      return originalOpen.apply(this, [method, url, ...(rest as [boolean, string | null, string | null])]);
    };

    xhrProto.send = function (
      this: XMLHttpRequest & { _url?: string },
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      this.addEventListener('load', () => {
        const reqUrl = this._url ?? '';
        if (API_PATTERN.test(reqUrl)) {
          try {
            const data = JSON.parse(this.responseText) as GatewaySessionData;
            onResponse({ url: reqUrl, data, response: this as unknown as Response });
          } catch (e) {
            console.warn('[uchi.ru Helper] XHR parse error:', e);
          }
        }
      });

      return originalSend.call(this, body);
    };
  }

  let lastHandledUrl = '';
  const checkPerfEntries = () => {
    try {
      const perf = targetWin.performance?.getEntriesByType?.('resource') || [];
      const entries = [...perf].reverse();
      const gatewaySessionEntry = entries.find((r) => r.name.includes('gateway_sessions'));
      if (gatewaySessionEntry && gatewaySessionEntry.name !== lastHandledUrl) {
        const foundUrl = gatewaySessionEntry.name;
        lastHandledUrl = foundUrl;
        const fetchFn = typeof originalFetch === 'function' ? originalFetch : targetWin.fetch;
        if (typeof fetchFn === 'function') {
          fetchFn.call(targetWin, foundUrl)
            .then((res: Response) => res.json())
            .then((data: GatewaySessionData) => {
              onResponse({ url: foundUrl, data, response: new Response() });
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.debug(e);
    }
  };

  checkPerfEntries();
  setInterval(checkPerfEntries, 1000);
}
