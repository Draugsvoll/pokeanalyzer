import type { AddressInfo } from "node:net";
import { once } from "node:events";
import type { Express } from "express";

export async function requestFromTestServer(
  app: Express,
  path: string,
  init?: RequestInit,
) {
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
