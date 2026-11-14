import { basicSetup } from "codemirror";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { LIMITS } from "./core/limits";
import { EXAMPLE } from "./example";
import "./styles.css";

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Elemento ausente: ${id}`);
  return result as T;
}

const generateButton = element<HTMLButtonElement>("generate");
const cancelButton = element<HTMLButtonElement>("cancel");
const copyButton = element<HTMLButtonElement>("copy");
const copyInputButton = element<HTMLButtonElement>("copy-input");
const downloadButton = element<HTMLButtonElement>("download");
const themeButton = element<HTMLButtonElement>("theme");
const message = element("message");
const outputEmpty = element("output-empty");
const outputTag = element("output-tag");
const inputCount = element("input-count");
const outputCount = element("output-count");
const inputTheme = new Compartment();
const outputTheme = new Compartment();
const colors = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: "var(--code-key)" },
    { tag: tags.string, color: "var(--code-string)" },
    { tag: tags.number, color: "var(--code-number)" },
    { tag: [tags.bool, tags.null], color: "var(--code-bool)" },
    { tag: tags.punctuation, color: "var(--muted)" },
  ]),
);
let schema = "";
let current = false;
let revision = 0;
let worker: Worker | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
let dark = true;

try {
  const saved = localStorage.getItem("json-schema-theme");
  dark = saved
    ? saved === "dark"
    : !matchMedia("(prefers-color-scheme: light)").matches;
} catch {
  /* Storage may be disabled; the tool still works. */
}

function editorTheme() {
  return EditorView.theme(
    { "&": { backgroundColor: "var(--editor)" } },
    { dark },
  );
}

function applyTheme(): void {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeButton.setAttribute(
    "aria-label",
    dark ? "Ativar tema claro" : "Ativar tema escuro",
  );
  themeButton.setAttribute("aria-pressed", String(!dark));
}
applyTheme();

const input = new EditorView({
  parent: element("input-editor"),
  state: EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      json(),
      colors,
      inputTheme.of(editorTheme()),
      EditorView.contentAttributes.of({
        "aria-label": "JSON de entrada",
        spellcheck: "false",
      }),
      placeholder("Cole seu JSON aqui…"),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              generate();
              return true;
            },
          },
        ]),
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          revision++;
          const wasWorking = !!worker;
          stopWorker();
          current = false;
          updateActions();
          updateInputCount();
          if (schema) {
            outputTag.textContent = "Desatualizado";
            outputTag.classList.remove("generated");
            outputCount.textContent = "Gere novamente para atualizar";
            notify(
              "A entrada mudou. Gere novamente para copiar ou baixar o schema.",
            );
          } else if (wasWorking)
            notify("A entrada mudou. A geração foi interrompida.");
          else notify("Pronto para gerar. Seus dados permanecem no navegador.");
        }
      }),
    ],
  }),
});

const output = new EditorView({
  parent: element("output-editor"),
  extensions: [
    basicSetup,
    json(),
    colors,
    outputTheme.of(editorTheme()),
    EditorState.readOnly.of(true),
    EditorView.contentAttributes.of({
      "aria-label": "JSON Schema gerado",
      "aria-readonly": "true",
      spellcheck: "false",
    }),
  ],
});

function updateInputCount(): void {
  inputCount.textContent = `${input.state.doc.length.toLocaleString("pt-BR")} caracteres`;
  copyInputButton.disabled = input.state.doc.length === 0;
}
updateInputCount();

function notify(text: string, kind = "info"): void {
  message.dataset.kind = kind;
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = kind === "error" ? "!" : "✓";
  message.replaceChildren(icon, document.createTextNode(text));
}

function updateActions(): void {
  copyButton.disabled = downloadButton.disabled = !current || !!worker;
  generateButton.disabled = !!worker;
  generateButton.textContent = worker ? "Gerando…" : "Gerar Schema →";
  cancelButton.hidden = !worker;
  element("output-editor").setAttribute("aria-busy", String(!!worker));
}

function stopWorker(): void {
  if (timeout) clearTimeout(timeout);
  timeout = undefined;
  worker?.terminate();
  worker = undefined;
  updateActions();
}

function generate(): void {
  stopWorker();
  current = false;
  updateActions();
  const source = input.state.doc.toString();
  if (!source.trim()) {
    notify("Cole um JSON antes de gerar o schema.", "error");
    input.focus();
    return;
  }
  if (
    source.length > LIMITS.inputBytes ||
    new TextEncoder().encode(source).length > LIMITS.inputBytes
  ) {
    notify("O JSON excede o limite de entrada de 1 MiB.", "error");
    return;
  }
  const started = performance.now();
  const jobRevision = revision;
  try {
    const job = new Worker(
      new URL("./workers/generator.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker = job;
    updateActions();
    notify("Gerando o schema no seu navegador…");
    job.onmessage = (
      event: MessageEvent<{ ok: boolean; schema?: string; error?: string }>,
    ) => {
      if (worker !== job || revision !== jobRevision) return;
      stopWorker();
      if (!event.data.ok || !event.data.schema) {
        notify(event.data.error ?? "Não foi possível gerar o schema.", "error");
        return;
      }
      schema = event.data.schema;
      output.dispatch({
        changes: { from: 0, to: output.state.doc.length, insert: schema },
      });
      outputEmpty.hidden = true;
      outputTag.textContent = "schema.json";
      outputTag.classList.add("generated");
      outputCount.textContent = `${output.state.doc.lines.toLocaleString("pt-BR")} linhas · ${new TextEncoder().encode(schema).length.toLocaleString("pt-BR")} bytes`;
      current = true;
      updateActions();
      notify(
        `Schema gerado em ${Math.round(performance.now() - started)} ms.`,
        "success",
      );
    };
    job.onerror = (event) => {
      if (worker !== job) return;
      event.preventDefault();
      stopWorker();
      notify(
        "Não foi possível processar o JSON. Reduza a entrada e tente novamente.",
        "error",
      );
    };
    timeout = setTimeout(() => {
      if (worker !== job) return;
      stopWorker();
      notify(
        "A geração excedeu 5 segundos. Reduza o JSON e tente novamente.",
        "error",
      );
    }, LIMITS.timeoutMs);
    job.postMessage(source);
  } catch {
    stopWorker();
    notify(
      "Não foi possível iniciar o processamento local. Tente um navegador atualizado.",
      "error",
    );
  }
}

generateButton.addEventListener("click", generate);
cancelButton.addEventListener("click", () => {
  stopWorker();
  notify("Geração cancelada.");
});
element("example").addEventListener("click", () => {
  input.dispatch({
    changes: { from: 0, to: input.state.doc.length, insert: EXAMPLE },
  });
  input.focus();
  notify("Exemplo carregado. Clique em Gerar Schema.");
});
element("clear").addEventListener("click", () => {
  stopWorker();
  schema = "";
  current = false;
  input.dispatch({
    changes: { from: 0, to: input.state.doc.length, insert: "" },
  });
  output.dispatch({
    changes: { from: 0, to: output.state.doc.length, insert: "" },
  });
  outputEmpty.hidden = false;
  outputTag.textContent = "schema.json";
  outputTag.classList.remove("generated");
  outputCount.textContent = "Aguardando geração";
  updateActions();
  notify("Campos limpos. Cole um novo JSON para começar.");
  input.focus();
});
copyInputButton.addEventListener("click", async () => {
  const text = input.state.doc.toString();
  if (!text) return;
  const copiedRevision = revision;
  try {
    await navigator.clipboard.writeText(text);
    if (revision === copiedRevision)
      notify(
        "JSON de entrada copiado para a área de transferência.",
        "success",
      );
  } catch {
    if (revision === copiedRevision) {
      input.focus();
      input.dispatch({
        selection: { anchor: 0, head: input.state.doc.length },
      });
      notify(
        "O navegador bloqueou a cópia automática. O JSON está selecionado; use Ctrl+C ou ⌘C.",
        "error",
      );
    }
  }
});
copyButton.addEventListener("click", async () => {
  if (!current) return;
  const copiedRevision = revision;
  try {
    await navigator.clipboard.writeText(schema);
    if (revision === copiedRevision && current)
      notify("Schema copiado para a área de transferência.", "success");
  } catch {
    if (revision === copiedRevision && current) {
      output.focus();
      output.dispatch({
        selection: { anchor: 0, head: output.state.doc.length },
      });
      notify(
        "O navegador bloqueou a cópia automática. O schema está selecionado; use Ctrl+C ou ⌘C.",
        "error",
      );
    }
  }
});
downloadButton.addEventListener("click", () => {
  if (!current) return;
  const url = URL.createObjectURL(
    new Blob([schema], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "schema.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Download de schema.json iniciado.", "success");
});
themeButton.addEventListener("click", () => {
  dark = !dark;
  applyTheme();
  input.dispatch({ effects: inputTheme.reconfigure(editorTheme()) });
  output.dispatch({ effects: outputTheme.reconfigure(editorTheme()) });
  try {
    localStorage.setItem("json-schema-theme", dark ? "dark" : "light");
  } catch {
    /* Optional preference only. */
  }
});
window.addEventListener("beforeunload", () => stopWorker());
