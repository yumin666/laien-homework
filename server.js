const http = require("http");
const fs = require("fs");
const path = require("path");
const { runAnalysis, parseImportedReviews } = require("./src/analysis/pipeline");
const { createStore } = require("./src/db/store");

loadDotEnv();

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, "public");
const SAMPLE_FILE = path.join(__dirname, "sample-data", "workout-for-women-us-reviews.json");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const store = createStore(process.env);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, {
        ok: true,
        database: store.kind,
        model: process.env.DEEPSEEK_API_KEY ? "deepseek" : "not-configured",
        collection: "Apple RSS customer reviews, US storefront"
      });
    }

    if (req.method === "GET" && url.pathname === "/api/sample") {
      return sendJson(res, JSON.parse(fs.readFileSync(SAMPLE_FILE, "utf8")));
    }

    if (req.method === "POST" && url.pathname === "/api/analysis") {
      const body = await readJson(req);
      const result = await runAnalysis({
        appUrl: body.appUrl,
        goal: body.goal,
        importedReviews: body.importedReviews,
        store,
        env: process.env
      });
      return sendJson(res, result);
    }

    if (req.method === "POST" && url.pathname === "/api/import") {
      const body = await readText(req);
      return sendJson(res, { reviews: parseImportedReviews(body) });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.replace("/api/runs/", ""));
      const run = await store.getRun(runId);
      if (!run) return sendJson(res, { error: "Run not found" }, 404);
      return sendJson(res, run);
    }

    if (req.method === "GET" && url.pathname === "/vendor/vue.global.prod.js") {
      const vuePath = path.join(__dirname, "node_modules", "vue", "dist", "vue.global.prod.js");
      if (!fs.existsSync(vuePath)) {
        return sendText(res, "Run npm install to install Vue 3.", 404);
      }
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      return fs.createReadStream(vuePath).pipe(res);
    }

    if (req.method === "GET" && url.pathname === "/vendor/element-plus/index.full.min.js") {
      return serveVendorFile(res, path.join(__dirname, "node_modules", "element-plus", "dist", "index.full.min.js"), "application/javascript; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/vendor/element-plus/index.css") {
      return serveVendorFile(res, path.join(__dirname, "node_modules", "element-plus", "dist", "index.css"), "text/css; charset=utf-8");
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    const message = error.message || "Unexpected server error";
    const status = /Invalid App Store URL|Unexpected token|CSV|JSON|No reviews|No usable reviews|Run not found/i.test(message) ? 400 : 500;
    return sendJson(res, { error: message }, status);
  }
});

server.listen(PORT, () => {
  console.log(`App Review Insights running at http://localhost:${PORT}`);
  console.log(`Storage: ${store.kind}`);
});

function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, "Forbidden", 403);
  fs.readFile(filePath, (error, data) => {
    if (error) return sendText(res, "Not found", 404);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function readJson(req) {
  return readText(req).then((raw) => raw ? JSON.parse(raw) : {});
}

function readText(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serveVendorFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    return sendText(res, "Run npm install to install frontend vendor assets.", 404);
  }
  res.writeHead(200, { "Content-Type": contentType });
  return fs.createReadStream(filePath).pipe(res);
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=");
  }
}
