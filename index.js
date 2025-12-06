// index.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { glob } from 'glob';
import { registerRoutes } from './routes.js';
import Pusher from "pusher";

// scan public/*.html
const htmlFiles = await glob('public/*.html');
console.log(htmlFiles);

// ✅ cross-platform: just keep the filename (drivers.html, vehicles.html, ...)
const webRoutes = htmlFiles.map((x) => path.basename(x));

console.log(webRoutes);

dotenv.config();

// ----------------------------------------------------
// Pusher config (production cloud + optional local mode)
// ----------------------------------------------------
const isLocalEnv = process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';

// Default: Pusher Cloud (works on localhost & Vercel as long as internet)
const pusherOptions = {
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER ?? "ap1",
  useTLS: true, // Cloud API uses HTTPS by default
};

// Optional: explicit local mode for Soketi/other Pusher-compatible server
// Only activated if:
//   - running in local env (not Vercel / not production)
//   - USE_LOCAL_PUSHER = 'true'
//   - PUSHER_HOST is set (e.g. 127.0.0.1)
//   - PUSHER_PORT is set (e.g. 6001)
if (
  isLocalEnv &&
  process.env.USE_LOCAL_PUSHER === 'true' &&
  process.env.PUSHER_HOST
) {
  console.log(
    `[Pusher] Using LOCAL server at ${process.env.PUSHER_HOST}:${
      process.env.PUSHER_PORT || 6001
    }`
  );
  pusherOptions.host = process.env.PUSHER_HOST;
  pusherOptions.port = Number(process.env.PUSHER_PORT || 6001);
  pusherOptions.useTLS = false; // local HTTP
} else {
  console.log(
    `[Pusher] Using CLOUD (cluster=${pusherOptions.cluster}, TLS=${pusherOptions.useTLS})`
  );
}

const pusher = new Pusher(pusherOptions);

const { Pool } = pkg;

// ----------------------------------------------------
// Postgres pool (APIKeyManagement table)
// ----------------------------------------------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  ssl: process.env.DB_SSL === 'true' || false,
});

// Optional: set PORT in .env (e.g. 3000)
const PORT = process.env.PORT || 8000;

// ----------------------------------------------------
// Express app
// ----------------------------------------------------
const app = express();

app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: '*',
    allowedHeaders: '*',
  })
);

app.use(express.json());

// ----------------------------------------------------
// Multer: keep uploaded image in memory as Buffer
// ----------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
});

// ----------------------------------------------------
// Public dir
// ----------------------------------------------------
const publicDir = path.join(process.cwd(), 'public');

// ----------------------------------------------------
// Register all routes (web + API)
// ----------------------------------------------------
registerRoutes(app, { pool, webRoutes, publicDir, upload, pusher });

// ----------------------------------------------------
// Local dev server (disabled on Vercel)
// ----------------------------------------------------
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Groq OCR server running on http://0.0.0.0:${PORT}`);
    for (const file of webRoutes) {
      const name = file.replace('.html', '');
      if (name.includes('index')) {
        console.log(`dashboard: http://localhost:${PORT}/dashboard`);
      } else {
        console.log(`${name}: http://localhost:${PORT}/${name}`);
      }
    }
  });
}

// ----------------------------------------------------
// Vercel handler export
// ----------------------------------------------------
const handler = (req, res) => app(req, res);
export default handler;
