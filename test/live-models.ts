/** Opt-in: one tiny free-tier request per registered model, through the real provider path. */
import { createModels, type Context } from "@earendil-works/pi-ai";
import { zenProvider } from "../src/provider.ts";

const models = createModels();
const provider = zenProvider();
models.setProvider(provider);
const refreshed = await models.refresh();
console.log(JSON.stringify({
  refreshErrors: [...refreshed.errors.values()].map(String),
  registered: provider.getModels().map((m) => m.id),
}));

for (const model of provider.getModels()) {
  const context: Context = {
    messages: [{ role: "user", timestamp: Date.now(), content: "Reply with the single word ok." }],
  };
  try {
    const stream = models.streamSimple(model, context, { maxRetries: 0 });
    const result = await stream.result();
    console.log(JSON.stringify({ id: model.id, stopReason: result.stopReason, error: result.errorMessage ?? null }));
  } catch (error) {
    console.log(JSON.stringify({ id: model.id, thrown: error instanceof Error ? error.message : String(error) }));
  }
}
