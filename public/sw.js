// Arrival Desk service worker: shows "your guest has arrived" notifications.
//
// Sound: browsers don't allow a custom sound on a notification. On a computer,
// if Arrival Desk is visible on screen, that tab plays our chime and the popup
// stays silent. Everywhere else (phones, hidden tabs, closed browser) the popup
// uses the device's normal sound, so it shows as a proper heads-up alert.

const VERSION = "3";
const VIBRATE = [120, 80, 120, 80, 320]; // Android: short-short-long

// Phones only show a heads-up banner for non-silent notifications.
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(self.navigator.userAgent);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Arrival Desk", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(showArrival(data));
});

async function showArrival(data) {
  const title = data.title || "Arrival Desk";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png", // small white glyph for the Android status bar
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: !IS_MOBILE,
    timestamp: Date.now(),
    data: { url: data.url || "/floor", v: VERSION },
  };

  let playedChime = false;
  if (!IS_MOBILE) {
    // Only a tab the person can actually see may replace the system sound.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = windows.filter((c) => c.url.startsWith(self.location.origin) && c.visibilityState === "visible");
    playedChime = await askTabsToPlay(visible);
  }

  // Browsers reject a notification that is both silent and vibrating.
  if (playedChime) options.silent = true;
  else options.vibrate = VIBRATE;

  try {
    await self.registration.showNotification(title, options);
  } catch (error) {
    // Never lose the alert over an unsupported option: retry with the basics.
    console.error("showNotification failed, retrying plain", error);
    await self.registration.showNotification(title, { body: options.body, icon: options.icon, data: options.data });
  }
}

function askTabsToPlay(clients) {
  if (clients.length === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    let answered = 0;
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    setTimeout(() => finish(false), 500);
    for (const client of clients) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        answered += 1;
        if (event.data === "played") finish(true);
        else if (answered === clients.length) finish(false);
      };
      client.postMessage({ type: "arrival-chime" }, [channel.port2]);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/floor", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
