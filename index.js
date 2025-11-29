// index.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { imageSize } from 'image-size';
import pkg from 'pg';

// NEW: path + __dirname resolution for ESM
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// Concurrency config
// ----------------------------------------------------
let inFlightDetections = 0;
const MAX_CONCURRENT_DETECTIONS = 1; // you can bump this to 2–3 if needed

// Groq OCR model (recommended for OCR)
// You can change this to:
//  - 'llama-3.2-11b-vision-instruct'
//  - 'llava-v1.6-34b'
const OCR_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

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
// Utility: Buffer → base64 data URL
// ----------------------------------------------------
function encodeBytesToDataUrl(buffer, contentType) {
  const ct = contentType || 'image/jpeg';
  const b64 = buffer.toString('base64');
  return `data:${ct};base64,${b64}`;
}

// ----------------------------------------------------
// DB helper: get next active API key (auto-switch)
// - Uses a transaction + FOR UPDATE to safely pick the
//   key with the lowest "Usage".
// - Increments "Usage" atomically.
//   Table: dbo."APIKeyManagement" ("Email", "Name", "APIKey", "Usage", "Active")
// ----------------------------------------------------
async function getNextApiKeyFromDb() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const selectRes = await client.query(
      `
      SELECT "Email", "Name", "APIKey", "Usage"
      FROM dbo."APIKeyManagement"
      WHERE "Active" = true
      ORDER BY "Usage" ASC NULLS FIRST, "Email" ASC
      LIMIT 1
      FOR UPDATE
      `
    );

    if (selectRes.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new Error('No active API keys found in dbo."APIKeyManagement"');
    }

    const row = selectRes.rows[0];

    await client.query(
      `
      UPDATE dbo."APIKeyManagement"
      SET "Usage" = COALESCE("Usage", 0) + 1
      WHERE "Email" = $1 AND "APIKey" = $2
      `,
      [row.Email, row.APIKey]
    );

    await client.query('COMMIT');

    // row: { Email, Name, APIKey, Usage }
    return row;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------
// Groq Vision OCR + BBOX
// - Takes a Groq client (constructed with a DB key)
// - Returns:
//   {
//     plate_text: string,
//     ocr_conf: number,
//     nx1, ny1, nx2, ny2 (normalized 0..1)
//   }
//   or null on failure / UNKNOWN / rate-limit
// ----------------------------------------------------
async function groqPlateDetect(groqClient, imageBuffer, contentType) {
  const dataUrl = encodeBytesToDataUrl(imageBuffer, contentType);

  const prompt =
    'You are a strict OCR and localization engine for vehicle license plates.\n' +
    'Given an image, find the SINGLE most relevant vehicle license plate.\n' +
    'Return ONLY a JSON object and nothing else.\n' +
    'JSON schema:\n' +
    '{\n' +
    '  "plate_text": "string, exact plate text like NBC1234",\n' +
    '  "ocr_conf": number between 0 and 1,\n' +
    '  "nx1": number between 0 and 1,  // left x normalized\n' +
    '  "ny1": number between 0 and 1,  // top y normalized\n' +
    '  "nx2": number between 0 and 1,  // right x normalized\n' +
    '  "ny2": number between 0 and 1   // bottom y normalized\n' +
    '}\n' +
    'Coordinates are normalized relative to the full image width/height.\n' +
    'If you cannot see a plate, respond with:\n' +
    '{ "plate_text": "UNKNOWN", "ocr_conf": 0, "nx1": 0, "ny1": 0, "nx2": 0, "ny2": 0 }';

  try {
    const completion = await groqClient.chat.completions.create({
      model: OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      temperature: 0.0,
      max_completion_tokens: 128,
    });

    const choice = completion.choices?.[0];
    const message = choice?.message || {};
    const content = message.content;

    let text = '';

    if (Array.isArray(content)) {
      for (const c of content) {
        if ((c?.type === 'text' || c?.type === 'output_text') && typeof c.text === 'string') {
          text += c.text;
        }
      }
    } else if (typeof content === 'string') {
      text = content;
    }

    text = (text || '').trim();
    if (!text) {
      return null;
    }

    // Extract JSON object from the response
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.warn('[GroqPlateDetect] No JSON object in response:', text);
      return null;
    }

    const jsonStr = text.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn('[GroqPlateDetect] JSON parse error:', parseErr, 'raw:', jsonStr);
      return null;
    }

    const plate_text = String(parsed.plate_text || '').trim();
    const ocr_conf = Number(parsed.ocr_conf ?? 0);

    let nx1 = Number(parsed.nx1 ?? 0);
    let ny1 = Number(parsed.ny1 ?? 0);
    let nx2 = Number(parsed.nx2 ?? 0);
    let ny2 = Number(parsed.ny2 ?? 0);

    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    nx1 = clamp01(nx1);
    ny1 = clamp01(ny1);
    nx2 = clamp01(nx2);
    ny2 = clamp01(ny2);

    // Ensure nx2 >= nx1, ny2 >= ny1
    if (nx2 < nx1) [nx1, nx2] = [nx2, nx1];
    if (ny2 < ny1) [ny1, ny2] = [ny2, ny1];

    return {
      plate_text: plate_text || 'UNKNOWN',
      ocr_conf: isNaN(ocr_conf) ? 0 : ocr_conf,
      nx1,
      ny1,
      nx2,
      ny2,
    };
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const message = err?.message ?? String(err);

    const isRateLimit =
      status === 429 ||
      message.includes('rate_limit_exceeded') ||
      message.includes('Rate limit reached');

    if (isRateLimit) {
      console.warn('[GroqPlateDetect] Rate limit hit for this key; skipping this frame.');
      // IMPORTANT: no throw → /detect will just return no detections
      return null;
    }

    console.error('[GroqPlateDetect] Error:', err);
    return null;
  }
}

// ----------------------------------------------------
// Admin Dashboard Routes (HTML pages in /public)
// ----------------------------------------------------
const publicDir = path.join(__dirname, 'public');

// Root → redirect to /dashboard
app.get('/', (req, res) => {
  return res.redirect('/dashboard');
});

// Dashboard (main admin page, using index.html)
app.get('/dashboard', (req, res) => {
  return res.sendFile(path.join(publicDir, 'index.html'));
});

// Users page
app.get('/users', (req, res) => {
  return res.sendFile(path.join(publicDir, 'users.html'));
});

// Drivers page
app.get('/drivers', (req, res) => {
  return res.sendFile(path.join(publicDir, 'drivers.html'));
});

// ID Category page
app.get('/id-category', (req, res) => {
  return res.sendFile(path.join(publicDir, 'id-category.html'));
});

// Logs page
app.get('/logs', (req, res) => {
  return res.sendFile(path.join(publicDir, 'logs.html'));
});

// Role page
app.get('/role', (req, res) => {
  return res.sendFile(path.join(publicDir, 'role.html'));
});

// System Config page
app.get('/system-config', (req, res) => {
  return res.sendFile(path.join(publicDir, 'system-config.html'));
});

// (Optional) Camera page if you have public/camera.html
app.get('/camera', (req, res) => {
  return res.sendFile(path.join(publicDir, 'camera.html'));
});

// ----------------------------------------------------
// Static Web Server for /public assets (CSS, JS, etc.)
// ----------------------------------------------------
app.use(express.static(publicDir));
// Examples after this:
//   /css/dashboard.css       → public/css/dashboard.css
//   /scs/user.css            → public/scs/user.css
//   /js/users.js             → public/js/users.js

// ----------------------------------------------------
// Route: POST /detect
//   - field name: "frame"   (matches Ionic code)
//   - query param: stream_id
//   - returns: DetectResponse
// ----------------------------------------------------
app.post('/detect', upload.single('frame'), async (req, res) => {
  if (inFlightDetections >= MAX_CONCURRENT_DETECTIONS) {
    // Respond quickly; client can just treat as "no detections"
    return res.json({
      stream_id: req.query.stream_id || null,
      image_w: 0,
      image_h: 0,
      focus_plate: null,
      detections: [],
      busy: true,
    });
  }

  inFlightDetections++;

  try {
    const streamId = req.query.stream_id || null;

    if (!req.file) {
      return res.status(400).json({ detail: 'frame is required' });
    }

    const { mimetype, size, buffer } = req.file;

    if (!mimetype || !mimetype.startsWith('image/')) {
      return res.status(400).json({ detail: 'File must be an image' });
    }

    // Groq base64 limit ~4MB
    if (size > 4 * 1024 * 1024) {
      return res.status(400).json({ detail: 'Image too large (>4MB) for Groq' });
    }

    // Get image width & height for frontend mapping
    const dim = imageSize(buffer);
    const image_w = dim.width;
    const image_h = dim.height;

    if (!image_w || !image_h) {
      return res.status(400).json({ detail: 'Unable to read image dimensions' });
    }

    // ----- Get next API key from DB and construct Groq client -----
    let keyRow;
    try {
      keyRow = await getNextApiKeyFromDb();
    } catch (dbErr) {
      console.error('[Detect] Failed to fetch Groq API key from DB:', dbErr);
      return res.status(500).json({ detail: 'No active API key available' });
    }

    const groqClient = new Groq({ apiKey: keyRow.APIKey });

    // ----- Ask Groq for plate + bbox -----
    const detectionResult = await groqPlateDetect(groqClient, buffer, mimetype);

    if (
      !detectionResult ||
      !detectionResult.plate_text ||
      detectionResult.plate_text.toUpperCase() === 'UNKNOWN'
    ) {
      const response = {
        stream_id: streamId,
        image_w,
        image_h,
        focus_plate: null,
        detections: [],
      };
      return res.json(response);
    }

    const cleanPlate = detectionResult.plate_text.trim();
    const ocr_conf = detectionResult.ocr_conf ?? 0;

    // Normalized coords 0..1
    const nx1 = detectionResult.nx1;
    const ny1 = detectionResult.ny1;
    const nx2 = detectionResult.nx2;
    const ny2 = detectionResult.ny2;

    // Convert normalized → pixels
    const x1 = nx1 * image_w;
    const y1 = ny1 * image_h;
    const x2 = nx2 * image_w;
    const y2 = ny2 * image_h;

    const width = x2 - x1;
    const height = y2 - y1;
    const cx = x1 + width / 2;
    const cy = y1 + height / 2;

    const box = {
      x1,
      y1,
      x2,
      y2,
      width,
      height,
      cx,
      cy,
      nx1,
      ny1,
      nx2,
      ny2,
    };

    const detection = {
      plate_text: cleanPlate,
      detection_conf: ocr_conf || 1.0,
      ocr_conf: ocr_conf || 1.0,
      is_focus: true,
      box,
    };

    const response = {
      stream_id: streamId,
      image_w,
      image_h,
      focus_plate: cleanPlate,
      detections: [detection],
    };

    return res.json(response);
  } catch (err) {
    console.error('[Detect] Internal error:', err);
    return res.status(500).json({ detail: 'Internal server error' });
  } finally {
    inFlightDetections--;
  }
});

// ----------------------------------------------------
// Start server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Groq OCR server running on http://0.0.0.0:${PORT}`);
  console.log(`🔐 Admin dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`👤 Users:           http://localhost:${PORT}/users`);
  console.log(`🚗 Drivers:         http://localhost:${PORT}/drivers`);
  console.log(`🆔 ID Category:     http://localhost:${PORT}/id-category`);
  console.log(`📜 Logs:            http://localhost:${PORT}/logs`);
  console.log(`🛡️ Role:            http://localhost:${PORT}/role`);
  console.log(`⚙️ System Config:   http://localhost:${PORT}/system-config`);
});
