const extApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;

function captureTabCallback(windowId, callback) {
  try {
    const maybePromise = extApi.tabs.captureVisibleTab(
      windowId,
      { format: "png" },
      (dataUrl) => {
        const lastErr = extApi.runtime?.lastError;
        if (lastErr) {
          callback({ ok: false, error: lastErr.message });
          return;
        }
        if (!dataUrl) {
          callback({ ok: false, error: "Nie udało się wykonać zrzutu ekranu." });
          return;
        }
        callback({ ok: true, dataUrl });
      }
    );

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise
        .then((dataUrl) => {
          if (!dataUrl) {
            callback({ ok: false, error: "Nie udało się wykonać zrzutu ekranu." });
            return;
          }
          callback({ ok: true, dataUrl });
        })
        .catch((err) => {
          callback({ ok: false, error: err?.message || "Błąd zrzutu ekranu." });
        });
    }
  } catch (err) {
    callback({ ok: false, error: err?.message || "Wyjątek podczas zrzutu ekranu." });
  }
}

extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CAPTURE_VISIBLE_TAB") return;

  const windowId = sender?.tab?.windowId;
  captureTabCallback(windowId, (result) => {
    try {
      sendResponse(result);
    } catch (_) {}
  });

  return true;
});