import type { Page } from "@playwright/test";

// Where the page keeps whether it refuses changes of reviews, across reloads.
const refusing = "better-diff-e2e-refusing-review-changes";

// Has the page's connection to the daemon refuse each change of a review it sends the plugin's
// server, with the error the daemon answers a request it can't serve with, until it's allowed.
function refusal(key: string): string {
  return `(() => {
    const refuses = () => {
      try {
        return sessionStorage.getItem(${JSON.stringify(key)}) === "refusing";
      } catch {
        return false;
      }
    };

    try {
      if (sessionStorage.getItem(${JSON.stringify(key)}) === null) {
        sessionStorage.setItem(${JSON.stringify(key)}, "refusing");
      }
    } catch {
      return;
    }

    const send = WebSocket.prototype.send;

    WebSocket.prototype.send = function (data) {
      let request;

      try {
        request = typeof data === "string" ? JSON.parse(data).message : undefined;
      } catch {
        request = undefined;
      }

      if (
        refuses() &&
        request?.type === "plugin.rpc.invoke.request" &&
        request.method === "review.change"
      ) {
        const refused = JSON.stringify({
          type: "session",
          message: {
            type: "rpc_error",
            payload: { requestId: request.requestId, error: "The host can't be reached." },
          },
        });

        setTimeout(() => {
          this.dispatchEvent(new MessageEvent("message", { data: refused }));
        }, 0);

        return;
      }

      send.call(this, data);
    };
  })()`;
}

// Has the daemon refuse each change of a review the page sends the plugin's server, as where the
// host can't be reached, though the page reloads, until the function it gives is called, and lets
// those after through. Before the page connects. In the page itself, not by routing its
// connection, which Playwright passes through the test.
export async function refuseChanges(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(refusal(refusing));

  return async () => {
    await page.evaluate(`sessionStorage.setItem(${JSON.stringify(refusing)}, "allowed")`);
  };
}
