import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import expected from "../fixtures/example.schema.json" with { type: "json" };

const input = (page: Page) =>
  page.getByRole("textbox", { name: "JSON de entrada", exact: true });
const output = (page: Page) =>
  page.getByRole("textbox", { name: "JSON Schema gerado", exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(input(page)).toBeVisible();
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
});

test("generates the exact example, downloads it, marks stale results, and clears", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Copiar Schema" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("Schema gerado em");
  await expect(output(page)).toContainText('"$schema"');
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("schema.json");
  const path = await download.path();
  expect(await readFile(path!, "utf8")).toBe(JSON.stringify(expected, null, 2));
  await input(page).fill('{"changed":true}');
  await expect(
    page.getByRole("button", { name: "Copiar Schema" }),
  ).toBeDisabled();
  await expect(page.getByText("Desatualizado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(page.locator("#input-count")).toHaveText("0 caracteres");
  await expect(input(page).locator(".cm-placeholder")).toBeVisible();
  await expect(output(page)).toHaveText("");
  await expect(
    page.getByRole("button", { name: "Baixar JSON" }),
  ).toBeDisabled();
});

test("validates input and recovers with the example", async ({
  page,
  isMobile,
}) => {
  await input(page).fill('{"a":1,}');
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("linha 1, coluna");
  await expect(
    page.getByRole("button", { name: "Copiar Schema" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
  // Android virtual keyboards route Enter through composition events.
  if (isMobile)
    await page.getByRole("button", { name: "Gerar Schema" }).click();
  else await input(page).press("ControlOrMeta+Enter");
  await expect(page.getByRole("status")).toContainText("Schema gerado em");
});

test("falls back to manual selection when clipboard access is denied", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await page.getByRole("button", { name: "Copiar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("cópia automática");
  const selected = await page.evaluate(() => getSelection()?.toString());
  expect(selected?.replace(/\r\n/g, "\n")).toBe(
    JSON.stringify(expected, null, 2),
  );
});

test("cancels a stalled worker and enforces the processing deadline", async ({
  page,
}) => {
  await page.route(/generator\.worker-.*\.js$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "self.onmessage = () => {};",
    }),
  );
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Geração cancelada");
  await expect(
    page.getByRole("button", { name: "Gerar Schema" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("excedeu 5 segundos", {
    timeout: 10000,
  });
  await expect(
    page.getByRole("button", { name: "Copiar Schema" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeHidden();
});

test("keeps hostile strings as data and never sends response JSON over the network", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173/") &&
      !request.url().startsWith("blob:")
    )
      externalRequests.push(request.url());
  });
  await input(page).fill(
    '{"<img src=x onerror=alert(1)>":"<script>alert(1)</script>","__proto__":true}',
  );
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("Schema gerado em");
  expect(await page.locator("img").count()).toBe(0);
  expect(externalRequests).toEqual([]);
});

test("copies the generated JSON", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await page.getByRole("button", { name: "Copiar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("Schema copiado");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.replace(/\r\n/g, "\n")).toBe(
    JSON.stringify(expected, null, 2),
  );
});

test("persists theme only and fits the viewport", async ({ page }) => {
  const theme = page.getByRole("button", { name: /Ativar tema/ });
  const previous = await theme.getAttribute("aria-label");
  await theme.click();
  await expect(theme).not.toHaveAttribute("aria-label", previous!);
  const next = await theme.getAttribute("aria-label");
  await page.reload();
  await expect(theme).toHaveAttribute("aria-label", next!);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    "json-schema-theme",
  ]);
});

test("blocks empty and oversized input", async ({ page }) => {
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("Cole um JSON");
  await input(page).fill('"' + "x".repeat(1024 * 1024) + '"');
  await page.getByRole("button", { name: "Gerar Schema" }).click();
  await expect(page.getByRole("status")).toContainText("1 MiB");
});
