import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = fileURLToPath(new URL(specifier.slice(2), root));
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(existsSync);
      if (!path) throw new Error(`Cannot resolve ${specifier}`);
      return nextResolve(pathToFileURL(path).href, context);
    }
    // Renderer modules import each other without extensions; Node's ESM
    // resolver needs them, TypeScript does not.
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL &&
      !context.parentURL.includes("/node_modules/")
    ) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      const path = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(existsSync);
      if (path) return nextResolve(pathToFileURL(path).href, context);
    }
    // Next's Node entry points also use extensionless imports internally.
    if (["next/server", "next/headers", "next/navigation"].includes(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url) && !url.includes("/node_modules/")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
          fileName: fileURLToPath(url),
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
