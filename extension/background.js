const isFirefox = typeof browser !== "undefined" && Boolean(browser.runtime);
const extApi = isFirefox ? browser : chrome;

console.log("[Prawdowid BG] Wystartował. isFirefox =", isFirefox);

async function captureVisibleTabSafe(windowId) {
  if (isFirefox) {
    const dataUrl =
      typeof windowId === "number"
        ? await extApi.tabs.captureVisibleTab(windowId, { format: "png" })
        : await extApi.tabs.captureVisibleTab({ format: "png" });

    if (!dataUrl) {
      throw new Error("Nie udało się wykonać zrzutu ekranu.");
    }
    return { ok: true, dataUrl };
  }

  return new Promise((resolve) => {
    try {
      const maybePromise = extApi.tabs.captureVisibleTab(
        windowId,
        { format: "png" },
        (dataUrl) => {
          const lastErr = extApi.runtime?.lastError;
          if (lastErr) {
            resolve({ ok: false, error: lastErr.message });
            return;
          }
          if (!dataUrl) {
            resolve({ ok: false, error: "Nie udało się wykonać zrzutu ekranu." });
            return;
          }
          resolve({ ok: true, dataUrl });
        }
      );

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then((dataUrl) => {
            if (!dataUrl) {
              resolve({ ok: false, error: "Nie udało się wykonać zrzutu ekranu." });
              return;
            }
            resolve({ ok: true, dataUrl });
          })
          .catch((err) => {
            resolve({ ok: false, error: err?.message || "Błąd zrzutu ekranu." });
          });
      }
    } catch (err) {
      resolve({ ok: false, error: err?.message || "Wyjątek podczas zrzutu ekranu." });
    }
  });
}

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "PING") {
    if (isFirefox) {
      return Promise.resolve({ ok: true, pong: true, from: "background.js" });
    }
    sendResponse({ ok: true, pong: true, from: "background.js" });
    return true;
  }

  if (message.type !== "CAPTURE_VISIBLE_TAB") return;

  const windowId = sender?.tab?.windowId;

  if (isFirefox) {
    return captureVisibleTabSafe(windowId).catch((err) => ({
      ok: false,
      error: err?.message || "Błąd zrzutu ekranu."
    }));
  }

  captureVisibleTabSafe(windowId).then((result) => {
    try {
      sendResponse(result);
    } catch (_) {}
  });

  return true;
});