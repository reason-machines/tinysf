// Builds index.html, the one file that is both the walkable world and the film.
//
//   bun build.ts
//
// It joins src/*.js in name order into src/shell.html and writes the two
// fonts and the Reason mark in as base64, so the result needs no network.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const b64 = (file: string) => readFileSync(join(here, "assets", file)).toString("base64");
const parts = readdirSync(join(here, "src")).filter((f) => f.endsWith(".js")).sort();
const code = parts.map((f) => readFileSync(join(here, "src", f), "utf8").trimEnd()).join("\n\n");

let html = readFileSync(join(here, "src", "shell.html"), "utf8");
const put = (token: string, value: string) => {
  if (html.split(token).length !== 2) throw new Error(`shell.html must hold ${token} exactly once`);
  html = html.replace(token, () => value);
};
put("__INTER__", b64("inter.woff2"));
put("__MONO__", b64("jetbrains-mono.woff2"));
put("__MARK__", b64("reason-mark.png"));
put("__CODE__", code);
writeFileSync(join(here, "index.html"), html);
console.log(`index.html: ${parts.length} parts, ${(html.length / 1024).toFixed(0)} KB`);
