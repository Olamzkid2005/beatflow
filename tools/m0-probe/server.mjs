/**
 * Tiny localhost server for the M0 capability probe.
 *
 * It exists so the probe page can run in a secure context (`http://127.0.0.1` counts as one,
 * which WebCodecs requires) without starting the Next dev server, and so the rendered MP4 can be
 * handed back to Node and then fetched again with Range requests to prove Chrome can stream it.
 *
 * Local-only, test-only. Not part of the app.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
};

/**
 * @param {object} options
 * @param {number} options.port
 * @param {Record<string, string>} options.files Map of URL path to absolute file path.
 * @param {string} options.savePath Where `POST /save` writes the rendered MP4.
 * @param {(line: string) => void} [options.log]
 */
export async function startProbeServer({ port, files, savePath, log = () => {} }) {
  /** Every request the browser made, so the runner can report Range behaviour. */
  const requests = [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: request.method ?? "GET",
      path: url.pathname,
      range: request.headers.range ?? null,
    });

    if (request.method === "POST" && url.pathname === "/save") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      await writeFile(savePath, buffer);
      log(`saved ${buffer.length} bytes to ${savePath}`);
      response.writeHead(204).end();
      return;
    }

    const filePath = files[url.pathname];
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }

    let size;
    try {
      size = (await stat(filePath)).size;
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Missing file");
      return;
    }

    const contentType = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
    const range = request.headers.range;

    // Chrome's media stack seeks with Range requests, so the file must be served like a real host.
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

      if (!match || start >= size || start > end) {
        response
          .writeHead(416, { "Content-Range": `bytes */${size}` })
          .end();
        return;
      }

      response.writeHead(206, {
        "Content-Type": contentType,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      });
      createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
