import assert from "node:assert/strict";
import test from "node:test";
import { createModels } from "@earendil-works/pi-ai";
import {
  EXTERNAL_CATALOGUE_URL,
  PROVIDER_ID,
  SEEDED_FREE_MODELS,
  externalFreeModels,
  knownModels,
  resetExternalCatalogueCache,
  zenProvider,
} from "../src/provider.ts";

const SEED_IDS = [
  "exo-free",
  "fledge-alpha-free",
  "ling-3.1-flash-free",
  "longcat-2.5-preview-free",
  "space-bunny-free",
  "jev-1.13-free",
];

test("seeded models complete the list without a network call", () => {
  const ids = knownModels().map((m) => m.id);
  for (const id of SEED_IDS) assert.ok(ids.includes(id), id);
  for (const model of SEEDED_FREE_MODELS) {
    assert.equal(model.provider, PROVIDER_ID);
    assert.equal(model.baseUrl, "https://opencode.ai/zen/v1");
    assert.ok(Object.values(model.cost).every((rate) => rate === 0));
  }
  assert.equal(zenProvider().getModels().length, knownModels().length);
});

test("external catalogue contributes only free models with a registered api", () => {
  const models = externalFreeModels({
    opencode: { models: {
      "brand-new-free": { name: "Brand New Free", reasoning: true, cost: { input: 0, output: 0 }, limit: { context: 200000, output: 40960 }, modalities: { input: ["text", "image", "audio"] } },
      "brand-new-paid": { name: "Brand New Paid", cost: { input: 1, output: 2 }, limit: { context: 200000, output: 40960 } },
      "muse-spark-1.3-contributor-free": { name: "Muse Spark 1.3 Free", cost: { input: 0, output: 0 }, limit: { context: 1024, output: 128 } },
      "no-context": { name: "No Context", cost: { input: 0, output: 0 } },
      broken: "not-an-object",
    } },
  });
  const byId = new Map(models.map((m) => [m.id, m]));
  assert.deepEqual([...byId.keys()].sort(), ["brand-new-free", "muse-spark-1.3-contributor-free"]);
  const added = byId.get("brand-new-free")!;
  assert.equal(added.api, "openai-completions");
  assert.equal(added.provider, PROVIDER_ID);
  assert.deepEqual(added.input, ["text", "image"]);
  assert.equal(added.contextWindow, 200000);
  assert.equal(added.maxTokens, 40960);
  assert.deepEqual(added.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.equal(byId.get("muse-spark-1.3-contributor-free")!.api, "openai-responses");
  assert.deepEqual(externalFreeModels({ data: [] }), []);
  assert.deepEqual(externalFreeModels(undefined), []);
});

test("refresh keeps known models when the external catalogue is unreachable", async () => {
  resetExternalCatalogueCache();
  const provider = zenProvider();
  const models = createModels();
  models.setProvider(provider);
  const original = globalThis.fetch;
  let externalCalls = 0;
  try {
    globalThis.fetch = async (url) => {
      if (String(url) === EXTERNAL_CATALOGUE_URL) {
        externalCalls++;
        throw new Error("offline");
      }
      return Response.json({ data: [{ id: "muse-spark-1.3-contributor-free" }, { id: "exo-free" }, { id: "brand-new-free" }] });
    };
    assert.equal((await models.refresh()).errors.size, 0);
    assert.equal(externalCalls, 1);
    assert.deepEqual(provider.getModels().map((m) => m.id).sort(), ["exo-free", "muse-spark-1.3-contributor-free"]);
  } finally {
    globalThis.fetch = original;
    resetExternalCatalogueCache();
  }
});

test("refresh registers unknown live models when the external catalogue answers", async () => {
  resetExternalCatalogueCache();
  const provider = zenProvider();
  const models = createModels();
  models.setProvider(provider);
  const original = globalThis.fetch;
  let externalCalls = 0;
  try {
    globalThis.fetch = async (url) => {
      if (String(url) === EXTERNAL_CATALOGUE_URL) {
        externalCalls++;
        return Response.json({ opencode: { models: {
          "brand-new-free": { name: "Brand New Free", cost: { input: 0, output: 0 }, limit: { context: 123456, output: 2048 } },
          "brand-new-paid": { name: "Brand New Paid", cost: { input: 1, output: 2 }, limit: { context: 1000, output: 100 } },
        } } });
      }
      return Response.json({ data: [{ id: "brand-new-free" }, { id: "brand-new-paid" }, { id: "exo-free" }] });
    };
    assert.equal((await models.refresh()).errors.size, 0);
    const ids = provider.getModels().map((m) => m.id);
    assert.ok(ids.includes("brand-new-free"));
    assert.ok(!ids.includes("brand-new-paid"));
    assert.ok(ids.includes("exo-free"));
    const added = provider.getModels().find((m) => m.id === "brand-new-free")!;
    assert.equal(added.contextWindow, 123456);
    assert.equal(added.headers?.["x-opencode-client"], "cli");
    assert.equal((await models.refresh()).errors.size, 0);
    assert.equal(externalCalls, 1);
  } finally {
    globalThis.fetch = original;
    resetExternalCatalogueCache();
  }
});
