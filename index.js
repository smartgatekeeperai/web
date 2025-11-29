// index.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { glob } from 'glob';
import { registerRoutes } from './routes.js';

// scan public/*.html
const htmlFiles = await glob('public/*.html');
console.log(htmlFiles);

const webRoutes = htmlFiles.map((x) => {
  return x.replace(`public\\`, '');
});

console.log(webRoutes);

dotenv.config();

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
registerRoutes(app, { pool, webRoutes, publicDir, upload });

// ----------------------------------------------------
// Local dev server (disabled on Vercel)
// ----------------------------------------------------
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Groq OCR server running on http://0.0.0.0:${PORT}`);
    for (const routes of webRoutes) {
      if (routes.includes('index')) {
        console.log(`dashboard: http://localhost:${PORT}/dashboard`);
      } else {
        console.log(
          `${routes.replace('.html', '')}: http://localhost:${PORT}/${routes.replace(
            '.html',
            ''
          )}`
        );
      }
    }
  });
}

// ----------------------------------------------------
// Vercel handler export
// ----------------------------------------------------
const handler = (req, res) => app(req, res);
export default handler;
