import { buildApp } from "../server/app";
import type { VercelRequest, VercelResponse } from "@vercel/node";

let cachedApp: any = null;

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 1024
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!cachedApp) {
      cachedApp = buildApp({ logHttp: false });
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error("[Vercel Serverless Error]", err?.stack || err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Serverless bootstrap failed",
        details: err?.message || String(err)
      });
    }
  }
}
