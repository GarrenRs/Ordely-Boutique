import app from "../apps/api-server/dist/app.mjs";

export default function handler(req, res) {
  const rawPath = req.query?.__path;
  const apiPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;

  if (typeof apiPath === "string" && apiPath.length > 0) {
    const url = new URL(req.url ?? "/", "http://localhost");
    url.pathname = `/api/${apiPath}`;
    url.searchParams.delete("__path");
    req.url = `${url.pathname}${url.search}`;
  }

  return app(req, res);
}
