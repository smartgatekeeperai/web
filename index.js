// index.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { glob } from "glob";
import { registerRoutes } from "./routes.js";

dotenv.config();

// scan public/*.html
const htmlFiles = await glob("public/*.html");
console.log("[WEB] html files =", htmlFiles);

// cross-platform: keep only the filename
const webRoutes = htmlFiles.map((x) => path.basename(x));
console.log("[WEB] routes =", webRoutes);

const { Pool } = pkg;

// ----------------------------------------------------
// Postgres pool
// ----------------------------------------------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  ssl: process.env.DB_SSL === "true" || false,
});

const PORT = Number(process.env.PORT || 3000);
const WS_HEARTBEAT_MS = Number(process.env.WS_HEARTBEAT_MS || 10000);

// ----------------------------------------------------
// Express app
// ----------------------------------------------------
const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: "*",
    allowedHeaders: "*",
  }),
);

app.use(express.json());

// ----------------------------------------------------
// Public dir
// ----------------------------------------------------
const publicDir = path.join(process.cwd(), "public");

// ----------------------------------------------------
// Register all routes (web + API)
// ----------------------------------------------------
registerRoutes(app, { pool, webRoutes, publicDir });

// ----------------------------------------------------
// HTTP + WebSocket hub
// ----------------------------------------------------
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws",
});

const allClients = new Set();
const dashboardClients = new Set();
const fastapiClients = new Set();

function safeParseJson(raw) {
  try {
    return JSON.parse(String(raw || "{}"));
  } catch {
    return null;
  }
}

function safeSend(ws, payload) {
  try {
    if (!ws || ws.readyState !== ws.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("[WS] send failed:", err?.message || err);
    return false;
  }
}

function removeClient(ws) {
  allClients.delete(ws);
  dashboardClients.delete(ws);
  fastapiClients.delete(ws);
}

function broadcastToDashboards(payload) {
  let sent = 0;

  for (const ws of dashboardClients) {
    if (safeSend(ws, payload)) {
      sent += 1;
    }
  }

  return sent;
}

function makeRealtimePayload(type, data = {}) {
  return {
    type,
    data,
    ts: Date.now(),
  };
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.role = "unknown";
  ws.connectedAt = Date.now();
  ws.remoteAddress = req?.socket?.remoteAddress || "unknown";

  allClients.add(ws);

  console.log(`[WS] client connected from ${ws.remoteAddress}`);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    const msg = safeParseJson(raw);

    if (!msg || typeof msg !== "object") {
      console.warn("[WS] invalid JSON message ignored");
      return;
    }

    // --------------------------------------------
    // Handshake
    // --------------------------------------------
    if (msg.type === "hello") {
      const role = String(msg.role || "unknown").trim().toLowerCase();
      ws.role = role || "unknown";

      dashboardClients.delete(ws);
      fastapiClients.delete(ws);

      if (ws.role === "dashboard") {
        dashboardClients.add(ws);
      } else if (ws.role === "fastapi") {
        fastapiClients.add(ws);
      }

      console.log(`[WS] hello role=${ws.role} from ${ws.remoteAddress}`);

      safeSend(
        ws,
        makeRealtimePayload("hello-ack", {
          role: ws.role,
        }),
      );

      return;
    }

    // --------------------------------------------
    // FastAPI -> Node hub -> dashboards
    // --------------------------------------------
    if (ws.role === "fastapi") {
      if (msg.type === "gate-update") {
        const sent = broadcastToDashboards(
          makeRealtimePayload("gate-update", msg.data || {}),
        );

        console.log(`[WS] gate-update broadcast to ${sent} dashboard client(s)`);
        return;
      }

      if (msg.type === "video-frame") {
        const sent = broadcastToDashboards(
          makeRealtimePayload("video-frame", msg.data || {}),
        );

        console.log(`[WS] video-frame broadcast to ${sent} dashboard client(s)`);
        return;
      }

      console.warn(`[WS] unsupported fastapi message type: ${msg.type}`);
      return;
    }

    // --------------------------------------------
    // Browser messages (currently none required)
    // --------------------------------------------
    if (ws.role === "dashboard") {
      if (msg.type === "ping") {
        safeSend(ws, makeRealtimePayload("pong", {}));
        return;
      }

      console.log(`[WS] dashboard message ignored: ${msg.type}`);
      return;
    }

    console.warn("[WS] message received before valid hello/role handshake");
  });

  ws.on("close", () => {
    console.log(`[WS] client closed role=${ws.role} from ${ws.remoteAddress}`);
    removeClient(ws);
  });

  ws.on("error", (err) => {
    console.warn(`[WS] client error role=${ws.role}:`, err?.message || err);
    removeClient(ws);
  });
});

// heartbeat
setInterval(() => {
  for (const ws of allClients) {
    if (ws.isAlive === false) {
      console.warn(`[WS] terminating stale client role=${ws.role}`);
      try {
        ws.terminate();
      } catch {}
      removeClient(ws);
      continue;
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (err) {
      console.warn("[WS] ping failed:", err?.message || err);
      removeClient(ws);
      try {
        ws.terminate();
      } catch {}
    }
  }
}, WS_HEARTBEAT_MS);

// ----------------------------------------------------
// Local dev server (disabled on Vercel)
// ----------------------------------------------------
if (process.env.VERCEL !== "1") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Smart Gate Keeper web server running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 Smart Gate Keeper websocket hub running on ws://0.0.0.0:${PORT}/ws`);

    for (const file of webRoutes) {
      const name = file.replace(".html", "");
      if (name.includes("index")) {
        console.log(`dashboard: http://localhost:${PORT}/dashboard`);
      } else {
        console.log(`${name}: http://localhost:${PORT}/${name}`);
      }
    }

    console.log("[ENV] NODE_ENV =", process.env.NODE_ENV);
    console.log("[ENV] AI_SERVER_URL =", process.env.AI_SERVER_URL);
    console.log("[ENV] WS_HEARTBEAT_MS =", WS_HEARTBEAT_MS);
  });
}

// ----------------------------------------------------
// Vercel handler export
// ----------------------------------------------------
const handler = (req, res) => app(req, res);
export default handler;