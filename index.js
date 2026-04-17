// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import path from "path";
import { glob } from "glob";
import { registerRoutes } from "./routes.js";

dotenv.config();

// scan public/*.html
const htmlFiles = await glob("public/*.html");
console.log(htmlFiles);

// cross-platform: keep only the filename
const webRoutes = htmlFiles.map((x) => path.basename(x));
console.log(webRoutes);

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

const PORT = Number(process.env.PORT || 8000);

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
  })
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
// Local dev server (disabled on Vercel)
// ----------------------------------------------------
if (process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Smart Gate Keeper web server running on http://0.0.0.0:${PORT}`);

    for (const file of webRoutes) {
      const name = file.replace(".html", "");
      if (name.includes("index")) {
        console.log(`dashboard: http://localhost:${PORT}/dashboard`);
      } else {
        console.log(`${name}: http://localhost:${PORT}/${name}`);
      }
    }

    console.log("[ENV] NODE_ENV =", process.env.NODE_ENV);
    console.log("[ENV] USE_LOCAL_PUSHER =", process.env.USE_LOCAL_PUSHER);
    console.log("[ENV] PUSHER_HOST =", process.env.PUSHER_HOST);
    console.log("[ENV] PUSHER_PORT =", process.env.PUSHER_PORT);
  });
}

// ----------------------------------------------------
// Vercel handler export
// ----------------------------------------------------
const handler = (req, res) => app(req, res);
export default handler;