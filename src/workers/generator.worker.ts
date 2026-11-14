import { generateSchema } from "../core/generate";

self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ ok: true, schema: generateSchema(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o schema.",
    });
  }
};
