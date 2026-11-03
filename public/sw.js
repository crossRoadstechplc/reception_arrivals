// Arrival Desk service worker: shows "your guest has arrived" notifications.
//
// Sound: browsers don't allow a custom sound on a notification. So when an
// Arrival Desk tab is open, we ask it to play our own chime and keep the
// notification silent. When no tab is open, the device's normal sound plays.

const VIBRATE = [120, 80, 120, 80, 320]; // Android only: short-short-long

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Arrival Desk", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Arrival Desk";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const appWindows = windows.filter((client) => client.url.startsWith(self.location.origin));

      // Ask open tabs to play the chime. Any tab that has sound on replies "played".
      const played = await askTabsToPlay(appWindows);

      const options = {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: data.tag,
        renotify: Boolean(data.tag),
        requireInteraction: true,
        data: { url: data.url || "/floor" },
      };
      // Browsers reject a notification that is both silent and vibrating,
      // so only one of the two is ever set.
      if (played) options.silent = true;
      else options.vibrate = VIBRATE;

      try {
        await self.registration.showNotification(title, options);
      } catch (error) {
        // Never lose the popup over an unsupported option: retry with the basics.
        console.error("showNotification failed, retrying plain", error);
        await self.registration.showNotification(title, { body: options.body, icon: options.icon, data: options.data });
      }
    })(),
  );
});

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
    // Don't hold the notification back for long.
    setTimeout(() => finish(false), 700);
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
