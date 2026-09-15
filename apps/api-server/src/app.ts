import type { IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pinoHttp } from "pino-http";
import * as path from "node:path";
import { pool } from "@workspace/db";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (isProduction && !process.env.PROVIDER_EMAIL) {
  throw new Error("PROVIDER_EMAIL must be set in production");
}

if (isProduction && process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters in production");
}

if (isProduction && allowedOrigins.size === 0) {
  throw new Error("APP_ORIGIN or ALLOWED_ORIGINS must be set in production");
}

if (isProduction && !process.env.PROVIDER_PASSWORD_HASH) {
  throw new Error("PROVIDER_PASSWORD_HASH must be set in production");
}

const PgSessionStore = connectPgSimple(session);

const app = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage & { id?: unknown }) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res: ServerResponse) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (!isProduction || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");

app.use("/uploads", express.static(uploadDir));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: "order_os.sid",
    secret: process.env.SESSION_SECRET,
    store: isProduction || process.env.SESSION_STORE === "postgres"
      ? new PgSessionStore({
          pool,
          schemaName: "order_os",
          tableName: "sessions",
          createTableIfMissing: true,
        })
      : undefined,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

app.use((_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const errorHandler = (
  err: unknown,
  _req: IncomingMessage,
  res: ServerResponse,
  _next: (err?: unknown) => void,
) => {
  logger.error(err, "Unhandled error");
  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Internal server error" }));
};

app.use(errorHandler);

export default app;
