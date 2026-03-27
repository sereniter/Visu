/**
 * Minimal static HTTP server for assets/sounds during recording.
 * Serves WAV files so the page can play click.wav, keyboard.wav, page_load.wav via URL.
 */

import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SoundsServerResult {
  baseUrl: string;
  close: () => Promise<void>;
}

export function startSoundsServer(soundsDir: string): Promise<SoundsServerResult> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const pathname = req.url?.split("?")[0] ?? "/";
      const name = pathname === "/" || pathname === "" ? "index" : pathname.replace(/^\//, "");
      const safeName = name.replace(/\.\./g, "").replace(/\/.*/g, "");
      if (!safeName.endsWith(".wav")) {
        res.writeHead(404);
        res.end();
        return;
      }
      const filePath = join(soundsDir, safeName);
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        const buf = readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": String(buf.length),
        });
        res.end(buf);
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null && "port" in addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          }),
      });
    });
    server.on("error", reject);
  });
}
