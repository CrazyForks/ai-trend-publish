import { assertEquals } from "@std/assert";
import { TwitterScraper } from "@src/modules/scrapers/twitter.scraper.ts";
import {
  ConfigManager,
  ConfigurationError,
} from "@src/utils/config/config-manager.ts";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const originalFetch = globalThis.fetch;

function mockConfig(
  getValue: (key: string) => Promise<string>,
): () => void {
  const configManager = ConfigManager.getInstance();
  const originalGet = configManager.get;
  configManager.get =
    (<T>(key: string) => getValue(key) as Promise<T>) as ConfigManager["get"];

  return () => {
    configManager.get = originalGet;
  };
}

function getHeaderValue(init: RequestInit | undefined, key: string): string {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.[key] ?? "";
}

Deno.test("TwitterScraper - uses Xquik when only XQUIK_API_KEY is configured", async () => {
  const restoreConfig = mockConfig((key) => {
    if (key === "XQUIK_API_KEY") {
      return Promise.resolve("xquik_test_key");
    }
    return Promise.reject(
      new ConfigurationError(`Configuration key "${key}" not found`),
    );
  });
  const fetchCalls: FetchCall[] = [];

  globalThis.fetch = (input: URL | Request | string, init?: RequestInit) => {
    fetchCalls.push({
      url: input.toString(),
      init,
    });

    return Promise.resolve(
      new Response(
        JSON.stringify({
          tweets: [
            {
              id: "123",
              text: "Xquik fallback works",
              createdAt: "2026-05-16T12:00:00Z",
              url: "https://x.com/xquikcom/status/123",
              media: [
                {
                  mediaUrl: "https://pbs.twimg.com/media/example.jpg",
                  type: "photo",
                },
              ],
            },
          ],
          has_next_page: false,
          next_cursor: "",
        }),
        { status: 200 },
      ),
    );
  };

  try {
    const scraper = new TwitterScraper();
    const result = await scraper.scrape("https://x.com/xquikcom", {
      limit: 1,
    });

    assertEquals(fetchCalls.length, 1);
    const requestUrl = new URL(fetchCalls[0].url);
    assertEquals(requestUrl.origin, "https://xquik.com");
    assertEquals(requestUrl.pathname, "/api/v1/x/tweets/search");
    assertEquals(
      requestUrl.searchParams.get("q"),
      "from:xquikcom -filter:replies within_time:24h",
    );
    assertEquals(requestUrl.searchParams.get("queryType"), "Top");
    assertEquals(requestUrl.searchParams.get("limit"), "1");
    assertEquals(
      getHeaderValue(fetchCalls[0].init, "x-api-key"),
      "xquik_test_key",
    );
    assertEquals(
      getHeaderValue(fetchCalls[0].init, "xquik-api-contract"),
      "2026-04-29",
    );
    assertEquals(result.length, 1);
    assertEquals(result[0].id, "123");
    assertEquals(
      result[0].media?.[0].url,
      "https://pbs.twimg.com/media/example.jpg",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreConfig();
  }
});

Deno.test("TwitterScraper - falls back to Xquik after TwitterAPI.io fails", async () => {
  const restoreConfig = mockConfig((key) => {
    if (key === "X_API_BEARER_TOKEN") {
      return Promise.resolve("twitterapi_test_key");
    }
    if (key === "XQUIK_API_KEY") {
      return Promise.resolve("xquik_test_key");
    }
    return Promise.reject(
      new ConfigurationError(`Configuration key "${key}" not found`),
    );
  });
  const fetchCalls: FetchCall[] = [];

  globalThis.fetch = (input: URL | Request | string, init?: RequestInit) => {
    fetchCalls.push({
      url: input.toString(),
      init,
    });

    if (input.toString().startsWith("https://api.twitterapi.io/")) {
      return Promise.resolve(new Response("error", { status: 500 }));
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          tweets: [
            {
              id: "456",
              text: "Fallback result",
              createdAt: "2026-05-16T12:00:00Z",
              url: "https://x.com/xquikcom/status/456",
            },
          ],
          has_next_page: false,
          next_cursor: "",
        }),
        { status: 200 },
      ),
    );
  };

  try {
    const scraper = new TwitterScraper();
    const result = await scraper.scrape("https://x.com/xquikcom", {
      limit: 1,
    });

    assertEquals(fetchCalls.length, 2);
    assertEquals(
      fetchCalls[0].url.startsWith("https://api.twitterapi.io/"),
      true,
    );
    assertEquals(fetchCalls[1].url.startsWith("https://xquik.com/"), true);
    assertEquals(result.length, 1);
    assertEquals(result[0].content, "Fallback result");
  } finally {
    globalThis.fetch = originalFetch;
    restoreConfig();
  }
});
