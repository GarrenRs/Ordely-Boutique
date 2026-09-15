import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HealthCheckResponse } from "@workspace/api-zod";

const router = Router();

router.get("/healthz", (_req: IncomingMessage, res: ServerResponse) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
});

export default router;
