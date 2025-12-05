//controller.js
import Groq from "groq-sdk";
import { imageSize } from "image-size";
import camelcaseKeys from "camelcase-keys";
import NodeCache from "node-cache";

// Groq OCR model (recommended for OCR)
const OCR_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Simple in-memory cache for CRUD
// stdTTL = 60s, tweak as you like
const crudCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
});

// Cache keys
const CACHE_KEYS = {
  vehicleBrands: "vehicleBrands",
  identificationTypes: "identificationTypes",
  roleTypes: "roleTypes",
  drivers: "drivers",
  users: "users",
  vehicles: "vehicles",
};

// Helper: invalidate all cache entries that share a prefix
function invalidateCachePrefix(prefix) {
  const keys = crudCache.keys();
  const toDelete = keys.filter(
    (k) => k === prefix || k.startsWith(prefix + ":")
  );
  if (toDelete.length > 0) {
    crudCache.del(toDelete);
  }
}

// ----------------------------------------------------
// Factory to create controllers with access to pool
// ----------------------------------------------------
export function createControllers({ pool, pusher }) {
  let plateSensorStarted = false;
  const latestFrames = new Map();

  let gateState = {
    sensor: "NO",
    plate: null,
    registered: false,
    lastUpdate: null,
    image_w: 0,
    image_h: 0,
    detections: [],
  };

  // ----------------------------------------------------
  // Utility: Buffer → base64 data URL  (Groq)
  // ----------------------------------------------------
  function encodeBytesToDataUrl(buffer, contentType) {
    const ct = contentType || "image/jpeg";
    const b64 = buffer.toString("base64");
    return `data:${ct};base64,${b64}`;
  }

  // ----------------------------------------------------
  // CRUD / DB HELPERS
  // ----------------------------------------------------
  async function dbQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  // Same as dbQuery but uses a specific client (for transactions)
  async function dbTxQuery(client, sql, params = []) {
    const { rows } = await client.query(sql, params);
    return rows;
  }

  // Generic transaction wrapper: handles BEGIN / COMMIT / ROLLBACK
  async function withTransaction(workFn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await workFn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        // ignore rollback errors
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------
  // DB helper: get next active API key (auto-switch)
  // ----------------------------------------------------
  async function getNextApiKeyFromDb() {
    return withTransaction(async (client) => {
      const rows = await dbTxQuery(
        client,
        `
        SELECT "Email", "Name", "APIKey", "Usage"
        FROM dbo."APIKeyManagement"
        WHERE "Active" = true
        ORDER BY "Usage" ASC NULLS FIRST, "Email" ASC
        LIMIT 1
        FOR UPDATE
        `
      );

      if (rows.length === 0) {
        throw new Error('No active API keys found in dbo."APIKeyManagement"');
      }

      const row = rows[0]; // { Email, Name, APIKey, Usage }

      await dbTxQuery(
        client,
        `
        UPDATE dbo."APIKeyManagement"
        SET "Usage" = COALESCE("Usage", 0) + 1
        WHERE "Email" = $1 AND "APIKey" = $2
        `,
        [row.Email, row.APIKey]
      );

      return row;
    });
  }

  // ----------------------------------------------------
  // Groq Vision OCR + BBOX
  // ----------------------------------------------------
  async function groqPlateDetect(groqClient, imageBuffer, contentType) {
    const dataUrl = encodeBytesToDataUrl(imageBuffer, contentType);

    const prompt =
      "You are a strict OCR and localization engine for vehicle license plates.\n" +
      "Given an image, find the SINGLE most relevant vehicle license plate.\n" +
      "Return ONLY a JSON object and nothing else.\n" +
      "JSON schema:\n" +
      "{\n" +
      '  "plate_text": "string, exact plate text like NBC1234",\n' +
      '  "ocr_conf": number between 0 and 1,\n' +
      '  "nx1": number between 0 and 1,  // left x normalized\n' +
      '  "ny1": number between 0 and 1,  // top y normalized\n' +
      '  "nx2": number between 0 and 1,  // right x normalized\n' +
      '  "ny2": number between 0 and 1   // bottom y normalized\n' +
      "}\n" +
      "Coordinates are normalized relative to the full image width/height.\n" +
      "If you cannot see a plate, respond with:\n" +
      '{ "plate_text": "UNKNOWN", "ocr_conf": 0, "nx1": 0, "ny1": 0, "nx2": 0, "ny2": 0 }';

    try {
      const completion = await groqClient.chat.completions.create({
        model: OCR_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
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

      let text = "";

      if (Array.isArray(content)) {
        for (const c of content) {
          if (
            (c?.type === "text" || c?.type === "output_text") &&
            typeof c.text === "string"
          ) {
            text += c.text;
          }
        }
      } else if (typeof content === "string") {
        text = content;
      }

      text = (text || "").trim();
      if (!text) {
        return null;
      }

      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        console.warn("[GroqPlateDetect] No JSON object in response:", text);
        return null;
      }

      const jsonStr = text.slice(firstBrace, lastBrace + 1);

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.warn(
          "[GroqPlateDetect] JSON parse error:",
          parseErr,
          "raw:",
          jsonStr
        );
        return null;
      }

      const plate_text = String(parsed.plate_text || "").trim();
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

      if (nx2 < nx1) [nx1, nx2] = [nx2, nx1];
      if (ny2 < ny1) [ny1, ny2] = [ny2, ny1];

      return {
        plate_text: plate_text || "UNKNOWN",
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
        message.includes("rate_limit_exceeded") ||
        message.includes("Rate limit reached");

      if (isRateLimit) {
        console.warn(
          "[GroqPlateDetect] Rate limit hit for this key; skipping this frame."
        );
        return null;
      }

      console.error("[GroqPlateDetect] Error:", err);
      return null;
    }
  }

  // ----------------------------------------------------
  // /detect handler (Groq)
  // ----------------------------------------------------
  async function detectHandler(req, res) {
    const streamId = req.query?.stream_id || null;

    //--------------------------------------------------
    // EARLY EXIT: No vehicle detected by sensor
    //--------------------------------------------------
    if (gateState.sensor === "NO") {
      plateSensorStarted = false;
      return res.json({
        success: true,
        data: {
          stream_id: streamId,
          image_w: 0,
          image_h: 0,
          focus_plate: null,
          detections: [],
        },
      });
    }

    if (plateSensorStarted) {
      return res.json({
        success: true,
        data: {
          stream_id: req.query.stream_id || null,
          image_w: gateState.image_w,
          image_h: gateState.image_h,
          focus_plate: gateState?.plate,
          detections: gateState.detections,
          busy: true,
        },
      });
    }

    if (gateState.sensor === "YES" && gateState.plate && gateState.registered) {
      return res.json({
        success: true,
        data: {
          stream_id: streamId,
          image_w: gateState.image_w,
          image_h: gateState.image_h,
          focus_plate: gateState.plate,
          detections: gateState.detections,
        },
      });
    }

    plateSensorStarted = true;

    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "frame is required" });
      }

      const { mimetype, size, buffer } = req.file;

      if (!mimetype || !mimetype.startsWith("image/")) {
        return res
          .status(400)
          .json({ success: false, message: "File must be an image" });
      }

      if (size > 4 * 1024 * 1024) {
        return res
          .status(400)
          .json({ success: false, message: "Image too large (>4MB) for Groq" });
      }

      const dim = imageSize(buffer);
      const image_w = dim.width;
      const image_h = dim.height;

      if (!image_w || !image_h) {
        return res
          .status(400)
          .json({ success: false, message: "Unable to read image dimensions" });
      }

      // ------------------------------------------------
      // NEW: up to 3 attempts:
      // getNextApiKeyFromDb() -> Groq client -> groqPlateDetect()
      // If groqPlateDetect() returns null, retry with a NEW key.
      // After 3rd failure, detectionResult stays null.
      // ------------------------------------------------
      let detectionResult = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        let keyRow;
        try {
          keyRow = await getNextApiKeyFromDb();
        } catch (dbErr) {
          console.error(
            "[Detect] Failed to fetch Groq API key from DB:",
            dbErr
          );
          plateSensorStarted = false;
          return res
            .status(500)
            .json({ success: false, message: "No active API key available" });
        }

        const groqClient = new Groq({ apiKey: keyRow.APIKey });

        detectionResult = await groqPlateDetect(groqClient, buffer, mimetype);

        if (detectionResult !== null) {
          // Got a non-null result (even if plate_text is UNKNOWN),
          // stop retrying and proceed.
          break;
        }

        console.warn(
          `[Detect] groqPlateDetect returned null (attempt ${attempt}). ` +
            (attempt < 3
              ? "Retrying with a new API key..."
              : "Reached max attempts; will return null result.")
        );
      }

      // After up to 3 attempts, if detectionResult is still null
      // or plate_text is UNKNOWN, behave as "no detection"
      if (
        !detectionResult ||
        !detectionResult.plate_text ||
        detectionResult.plate_text.toUpperCase() === "UNKNOWN"
      ) {
        const response = {
          stream_id: streamId,
          image_w,
          image_h,
          focus_plate: null,
          detections: [],
        };
        return res.json({ success: true, data: response });
      }

      const cleanPlate = detectionResult.plate_text.trim();
      const ocr_conf = detectionResult.ocr_conf ?? 0;

      const nx1 = detectionResult.nx1;
      const ny1 = detectionResult.ny1;
      const nx2 = detectionResult.nx2;
      const ny2 = detectionResult.ny2;

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
        detections: [detection], // kept original typo
      };

      // --- NEW: combine with sensor and broadcast gate state ---
      let foundPlate = cleanPlate || null;
      let vehicleDetails = null;

      if (foundPlate) {
        const rows = await dbQuery(
          `SELECT * FROM dbo."Vehicles" WHERE LOWER("PlateNumber") = LOWER($1) AND "Active" = true`,
          [foundPlate]
        );

        vehicleDetails = rows.length > 0 ? camelcaseKeys(rows[0]) : null;
      }

      gateState = {
        sensor: gateState.sensor,
        plate: foundPlate,
        registered: vehicleDetails ? true : false,
        image_w,
        image_h,
        detections: response.detections,
        brand: vehicleDetails?.brand,
        model: vehicleDetails?.model,
        type: vehicleDetails?.type,
        driver: vehicleDetails?.driver?.fullName,
        lastUpdate: Date.now(),

      };

      await pusher.trigger("gate-channel", "gate-update", gateState);

      return res.json({ success: true, data: response });
    } catch (err) {
      console.error("[Detect] Internal error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    } finally {
      plateSensorStarted = false;
    }
  }

  // ----------------------------------------------------
  // /sensor handler (mobile → server frame upload)
  // ----------------------------------------------------
  async function streamFrameHandler(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "frame is required" });
      }

      const { buffer, mimetype } = req.file;
      const streamId = req.body.stream_id || "mobile-1";
      const ct = mimetype || "image/jpeg";

      const ts = Date.now();

      // 1) Store latest frame in memory (per streamId)
      latestFrames.set(streamId, {
        buffer,
        mimetype: ct,
        ts,
      });

      // 2) Notify listeners via Pusher with ONLY metadata (small payload)
      await pusher.trigger("video-channel", "frame", {
        stream_id: streamId,
        ts,
      });

      return res.json({ success: true });
    } catch (err) {
      console.error("[streamFrameHandler] error:", err);
      return res.status(500).json({ success: false, message: "stream failed" });
    }
  }

  // ----------------------------------------------------
  // /stream/latest-frame handler (web → server)
  // ----------------------------------------------------
  async function getLatestFrameHandler(req, res) {
    try {
      const streamId = (req.query.stream_id || "mobile-1").toString();
      const frame = latestFrames.get(streamId);

      if (!frame) {
        return res.status(404).send("No frame yet");
      }

      res.setHeader("Content-Type", frame.mimetype || "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      // Optional: allow cross-origin if dashboard is on a different origin
      // res.setHeader("Access-Control-Allow-Origin", "*");

      return res.send(frame.buffer);
    } catch (err) {
      console.error("[getLatestFrameHandler] error:", err);
      return res.status(500).send("Failed to fetch frame");
    }
  }

  // ----------------------------------------------------
  // /sensor handler (vehicle presence YES/NO from ESP)
  // ----------------------------------------------------
  async function sensorHandler(req, res) {
    const { state } = req.body || {};

    if (!state || !["YES", "NO"].includes(state)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid sensor state" });
    }
    const timeSinceLastUpdate = Date.now() - (gateState.lastUpdate || 0);
    if (
      (gateState.sensor === "YES" &&
        state === "NO" &&
        timeSinceLastUpdate > 5000) ||
      (gateState.sensor === "NO" && state === "YES" && !plateSensorStarted) ||
      (gateState.sensor === "NO" && state === "NO" && !plateSensorStarted)
    ) {
      gateState.plate = null;
      gateState.registered = false;
      gateState.sensor = state;
      gateState.image_h = 0;
      gateState.image_w = 0;
      gateState.detections = [];
      gateState.lastUpdate = Date.now();
    }


    // Push update to UI
    await pusher.trigger("gate-channel", "gate-update", {
      plate: gateState.plate,
      registered: gateState.registered,
      sensor: gateState.sensor,
      lastUpdate: gateState.lastUpdate,
    });

    return res.json({
      success: true,
      data: {
        plate: gateState.plate,
        registered: gateState.registered,
        sensor: gateState.sensor,
        lastUpdate: gateState.lastUpdate,
      },
    });
  }

  // ------------ Vehicle Brand and Model (no cache) ------------
  async function getVehicleBrands(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.vehicleBrands);
      if (cached) {
        return res.json({ success: true, data: cached });
      }
      const resp = await fetch(
        "https://apisearch.topgear.com.ph/topgear/v1/buyers-guide/makes/",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://www.topgear.com.ph",
          },
        }
      );

      if (!resp.ok) {
        throw new Error(`Failed to load vehicle brands`);
      }
      const data = await resp.json();
      crudCache.set(
        CACHE_KEYS.vehicleBrands,
        data?.map((x) => x.name)
      );
      return res.json({ success: true, data: data?.map((x) => x.name) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch vehicle brands",
      });
    }
  }

  // ------------ IdentificationType ------------
  async function getIdentificationTypes(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.identificationTypes);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."IdentificationType" WHERE "Active" = true ORDER BY "Id" ASC`
      );
      const data = camelcaseKeys(rows);
      crudCache.set(CACHE_KEYS.identificationTypes, data);
      return res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch IdentificationType",
      });
    }
  }

  async function upsertIdentificationType(req, res) {
    const { id, name } = req.body || {};
    try {
      let rows;
      if (id) {
        rows = await dbQuery(
          `SELECT * FROM dbo."IdentificationType" WHERE "Active" = true AND "Id" = $1`,
          [id]
        );

        if (!rows.length) {
          return res
            .status(500)
            .json({ success: false, message: "Identification Type not found" });
        }
        rows = await dbQuery(
          `UPDATE dbo."IdentificationType" SET "Name" = $1, "UpdatedAt" = NOW() WHERE "Id" = $2 RETURNING *`,
          [name, id]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."IdentificationType" ("Name") VALUES ($1) RETURNING *`,
          [name]
        );
      }

      invalidateCachePrefix(CACHE_KEYS.identificationTypes);

      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      console.error(err);
      if (err?.message?.includes("duplicate")) {
        return res.status(400).json({
          success: false,
          message: "IdentificationType already exists",
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to upsert IdentificationType",
        });
      }
    }
  }

  async function deleteIdentificationType(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."IdentificationType" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING * `,
        [id]
      );
      if (!camelcaseKeys(rows[0])) {
        return res.status(404).json({ success: false, message: "Not found" });
      }

      invalidateCachePrefix(CACHE_KEYS.identificationTypes);

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete IdentificationType",
      });
    }
  }

  // ------------ RoleType ------------
  async function getRoleTypes(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.roleTypes);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."RoleType" WHERE "Active" = true ORDER BY "RoleType" ASC`
      );
      const data = camelcaseKeys(rows);
      crudCache.set(CACHE_KEYS.roleTypes, data);

      return res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch RoleType",
      });
    }
  }

  async function upsertRoleType(req, res) {
    const { id, name } = req.body || {};
    try {
      let rows;
      if (id) {
        rows = await dbQuery(
          `UPDATE dbo."RoleType" SET "Name" = $1, "UpdatedAt" = NOW() WHERE "Id" = $2 RETURNING *`,
          [name, id]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."RoleType" ("Name") VALUES ($1) RETURNING *`,
          [name]
        );
      }

      invalidateCachePrefix(CACHE_KEYS.roleTypes);

      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      console.error(err);
      if (err?.message?.includes("duplicate")) {
        return res
          .status(400)
          .json({ success: false, message: "RoleType already exists" });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to upsert RoleType",
        });
      }
    }
  }

  async function deleteRoleType(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."RoleType" SET "Active", "UpdatedAt" = NOW() = false WHERE "Id" = $1 RETURNING *`,
        [id]
      );
      if (!camelcaseKeys(rows[0])) {
        return res.status(404).json({ success: false, message: "Not found" });
      }

      invalidateCachePrefix(CACHE_KEYS.roleTypes);

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete RoleType",
      });
    }
  }

  // ------------ Drivers ------------
  async function getDrivers(req, res) {
    try {
      // Read limit/offset from query
      let { limit, offset, driver } = req.query;

      limit = parseInt(limit, 10);
      offset = parseInt(offset, 10);

      const cacheKey = `${CACHE_KEYS.drivers}:${limit}:${offset}:${driver}`;
      const cached = crudCache.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: cached.data,
          total: cached.total,
        });
      }

      // Query only the current page + total count
      const [rows, totalRows] = await Promise.all([
        dbQuery(
          `SELECT * FROM dbo."Drivers" 
               WHERE "Active" = true 
               ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
               LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
        dbQuery(`SELECT COUNT(*) AS "total" 
               FROM dbo."Vehicles" 
               WHERE "Active" = true`),
      ]);

      const data = camelcaseKeys(rows);
      const total = Number(totalRows?.[0]?.total ?? 0);

      const payload = { data, total };

      // Cache this page
      crudCache.set(cacheKey, payload);

      return res.json({
        success: true,
        data,
        total,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Drivers",
      });
    }
  }

  async function upsertDriver(req, res) {
    const {
      id,
      fullName,
      gender,
      contactNumber,
      roleType,
      identificationType,
      identificationNumber,
      plateNumber,
      type,
      model,
      brand,
    } = req.body || {};

    try {
      let rows;

      // Basic validation (no transaction needed)
      if (
        !gender ||
        !["male", "female"].some((x) => x === gender.toLowerCase())
      ) {
        return res.status(500).json({
          success: false,
          message: `Invalid gender value '${gender}'`,
        });
      }

      if (roleType) {
        rows = await dbQuery(
          `SELECT * FROM dbo."RoleType" WHERE "Active" = true AND LOWER("Name") = LOWER($1)`,
          [roleType]
        );
        if (!rows.length) {
          return res.status(500).json({
            success: false,
            message: `Role type '${roleType}' not found`,
          });
        }
      }

      if (identificationType) {
        rows = await dbQuery(
          `SELECT * FROM dbo."IdentificationType" WHERE "Active" = true AND LOWER("Name") = LOWER($1)`,
          [identificationType]
        );

        if (!rows.length) {
          return res.status(500).json({
            success: false,
            message: `Identification Type '${identificationType}' not found`,
          });
        }
      }

      // UPDATE existing driver: single UPDATE, transaction optional
      if (id) {
        rows = await dbQuery(
          `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
          [id]
        );

        if (!rows.length) {
          return res
            .status(500)
            .json({ success: false, message: "Driver not found" });
        }
        rows = await dbQuery(
          `UPDATE dbo."Drivers" 
           SET "FullName" = $1, "Gender" = $2, "ContactNumber" = $3, 
               "RoleType" = $4, "IdentificationType" = $5, "IdentificationNumber" = $6, "UpdatedAt" = NOW()
           WHERE "Id" = $7 
           RETURNING *`,
          [
            fullName,
            gender,
            contactNumber ?? null,
            roleType,
            identificationType,
            identificationNumber,
            id,
          ]
        );

        invalidateCachePrefix(CACHE_KEYS.drivers);
        return res.json({ success: true, data: camelcaseKeys(rows[0]) });
      }

      // CREATE new driver + vehicle + update Vehicles[] in a transaction
      const result = await withTransaction(async (client) => {
        // 1) Insert driver
        const driverRows = await dbTxQuery(
          client,
          `INSERT INTO dbo."Drivers" 
           ("FullName", "Gender", "ContactNumber", "RoleType", "IdentificationType", "IdentificationNumber") 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING *`,
          [
            fullName,
            gender,
            contactNumber ?? null,
            roleType,
            identificationType,
            identificationNumber,
          ]
        );

        const driver = camelcaseKeys(driverRows[0]);

        if (!(plateNumber && type && model && brand)) {
          // Throw to rollback the new driver insert
          throw new Error(`Vehicle information is required`);
        }

        // 2) Insert vehicle
        const vehicleRes = await dbTxQuery(
          client,
          `INSERT INTO dbo."Vehicles" 
           ("PlateNumber", "Driver", "Type", "Model", "Brand") 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING *`,
          [plateNumber, JSON.stringify(driver), type, model, brand]
        );

        const vehicle = camelcaseKeys(vehicleRes[0]);
        const vehicles = [{ id: vehicle?.id, plateNumber, type, model, brand }];

        // 3) Update driver's Vehicles array
        const updatedDriverRows = await dbTxQuery(
          client,
          `UPDATE dbo."Drivers" 
           SET "Vehicles" = $1, "UpdatedAt" = NOW()
           WHERE "Id" = $2 
           RETURNING *`,
          [JSON.stringify(vehicles), driver.id]
        );

        return camelcaseKeys(updatedDriverRows[0]);
      });

      // Invalidate caches on successful transaction
      invalidateCachePrefix(CACHE_KEYS.drivers);
      invalidateCachePrefix(CACHE_KEYS.vehicles);

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error(err);
      if (
        err?.message?.includes("duplicate") &&
        err?.message?.toLowerCase().includes("driver")
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Driver already exists" });
      } else if (
        err?.message?.includes("duplicate") &&
        err?.message?.toLowerCase().includes("vehicle")
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle already exists" });
      } else if (
        err?.message?.toLowerCase()?.includes("driver") ||
        err?.message?.toLowerCase()?.includes("vehicle")
      ) {
        return res.status(400).json({
          success: false,
          message: err?.message,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to upsert Driver",
        });
      }
    }
  }

  async function deleteDriver(req, res) {
    const { id } = req.params;
    try {
      let driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
        [id]
      );
      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Driver not found" });
      }
      const driver = camelcaseKeys(driverRes[0]);

      const result = await withTransaction(async (client) => {
        const vehiclesToDelete = Array.isArray(driver.vehicles)
          ? driver.vehicles
              .map((v) => Number(v.id))
              .filter((n) => Number.isFinite(n))
          : [];

        if (vehiclesToDelete.length > 0) {
          await dbTxQuery(
            client,
            `UPDATE dbo."Vehicles" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = ANY($1::bigint[])`,
            [vehiclesToDelete]
          );
        }

        const rows = await dbTxQuery(
          client,
          `UPDATE dbo."Drivers" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING *`,
          [id]
        );

        return camelcaseKeys(rows[0]);
      });
      invalidateCachePrefix(CACHE_KEYS.drivers);
      invalidateCachePrefix(CACHE_KEYS.vehicles);

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete Driver",
      });
    }
  }

  // ------------ User ------------
  async function getUsers(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.users);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT "UserId", "Name", "Username", "Active" FROM dbo."User" WHERE "Active" = true ORDER BY "UserId" ASC`
      );
      const data = camelcaseKeys(rows);
      crudCache.set(CACHE_KEYS.users, data);

      return res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Users",
      });
    }
  }

  async function upsertUser(req, res) {
    const { userId, name, username, password } = req.body || {};
    try {
      let rows;
      if (userId) {
        rows = await dbQuery(
          `UPDATE dbo."User" 
           SET "Name" = $1, "Username" = $2, "Password" = $3, "UpdatedAt" = NOW()
           WHERE "UserId" = $4 
           RETURNING "UserId", "Name", "Username", "Active" `,
          [name, username, password, userId]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."User" ("Name", "Username", "Password") 
           VALUES ($1, $2, $3) 
           RETURNING "UserId", "Name", "Username", "Active"`,
          [name, username, password]
        );
      }

      invalidateCachePrefix(CACHE_KEYS.users);

      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      console.error(err);
      if (err?.message?.includes("duplicate")) {
        return res
          .status(400)
          .json({ success: false, message: "User already exists" });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to upsert User",
        });
      }
    }
  }

  async function deleteUser(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."User" 
         SET "Active" = false, "UpdatedAt" = NOW() 
         WHERE "UserId" = $1 
         RETURNING "UserId", "Name", "Username", "Active" `,
        [id]
      );
      if (!camelcaseKeys(rows[0])) {
        return res.status(404).json({ success: false, message: "Not found" });
      }

      invalidateCachePrefix(CACHE_KEYS.users);

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete User",
      });
    }
  }

  // ------------ Vehicles ------------
  async function getVehicles(req, res) {
    try {
      // Read limit/offset from query
      let { limit, offset, driver } = req.query;

      driver = !isNaN(Number(driver)) ? Number(driver) : null;

      limit = parseInt(limit, 10);
      offset = parseInt(offset, 10);

      if (Number.isNaN(offset) || offset < 0) offset = 0;

      // Per-page cache key (limit + offset)
      const cacheKey = driver
        ? `${CACHE_KEYS.vehicles}:${limit}:${offset}:${driver}`
        : `${CACHE_KEYS.vehicles}:${limit}:${offset}`;

      const cached = crudCache.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: cached.data,
          total: cached.total,
        });
      }

      // Query only the current page + total count
      const [rows, totalRows] = await Promise.all([
        dbQuery(
          driver
            ? `
            SELECT * FROM dbo."Vehicles" 
            WHERE "Active" = true AND "Driver"->>'id' = $3 
            ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
            LIMIT $1 OFFSET $2`
            : `SELECT * FROM dbo."Vehicles" 
               WHERE "Active" = true 
               ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
               LIMIT $1 OFFSET $2`,
          driver ? [limit, offset, driver] : [limit, offset]
        ),
        dbQuery(
          driver
            ? `SELECT COUNT(*) AS "total" 
               FROM dbo."Vehicles" 
               WHERE "Active" = true AND "Driver"->>'id' = $1`
            : `SELECT COUNT(*) AS "total" 
               FROM dbo."Vehicles" 
               WHERE "Active" = true`,
          driver ? [driver] : []
        ),
      ]);

      const data = camelcaseKeys(rows);
      const total = Number(totalRows?.[0]?.total ?? 0);

      const payload = { data, total };

      // Cache this page
      crudCache.set(cacheKey, payload);

      return res.json({
        success: true,
        data,
        total,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Vehicles",
      });
    }
  }

  async function upsertVehicle(req, res) {
    const { id, plateNumber, type, model, brand, driverId } = req.body || {};
    try {
      if (!driverId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing driver Id" });
      }

      // Fetch driver (no transaction needed here)
      const driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
        [driverId]
      );
      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle driver not found" });
      }
      const driver = camelcaseKeys(driverRes[0]);

      // Multi-step write in one transaction
      const savedVehicle = await withTransaction(async (client) => {
        if (id) {
          // 1) Update Vehicle
          const vehicleRows = await dbTxQuery(
            client,
            `UPDATE dbo."Vehicles" 
             SET "PlateNumber" = $1, "Type" = $2, "Model" = $3, "Brand" = $4, "UpdatedAt" = NOW() 
             WHERE "Id" = $5 
             RETURNING *`,
            [plateNumber, type, model, brand, id]
          );

          const updatedVehicle = camelcaseKeys(vehicleRows[0]);

          // 2) Sync Driver.Vehicles[]
          const driverVehicles = driver?.vehicles ?? [];
          const vehicleIndex = driverVehicles.findIndex((v) => v.id === id);
          if (vehicleIndex !== -1) {
            driverVehicles[vehicleIndex] = {
              id,
              plateNumber: updatedVehicle.plateNumber,
              type: updatedVehicle.type,
              model: updatedVehicle.model,
              brand: updatedVehicle.brand,
            };
          }

          await dbTxQuery(
            client,
            `UPDATE dbo."Drivers" 
             SET "Vehicles" = $1, "UpdatedAt" = NOW()
             WHERE "Id" = $2`,
            [JSON.stringify(driverVehicles), driverId]
          );

          return updatedVehicle;
        } else {
          // 1) Insert new Vehicle
          const vehicleRows = await dbTxQuery(
            client,
            `INSERT INTO dbo."Vehicles" 
             ("PlateNumber", "Driver", "Type", "Model", "Brand") 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [plateNumber, JSON.stringify(driver), type, model, brand]
          );

          const vehicle = camelcaseKeys(vehicleRows[0]);

          // 2) Append to Driver.Vehicles[]
          const driverVehicles = driver?.vehicles ?? [];
          driverVehicles.push({
            id: vehicle?.id,
            plateNumber: vehicle?.plateNumber,
            type: vehicle?.type,
            model: vehicle?.model,
            brand: vehicle?.brand,
          });

          await dbTxQuery(
            client,
            `UPDATE dbo."Drivers" 
             SET "Vehicles" = $1, "UpdatedAt" = NOW() 
             WHERE "Id" = $2`,
            [JSON.stringify(driverVehicles), driverId]
          );

          return vehicle;
        }
      });

      invalidateCachePrefix(CACHE_KEYS.vehicles);
      invalidateCachePrefix(CACHE_KEYS.drivers);

      return res.json({ success: true, data: savedVehicle });
    } catch (err) {
      console.error(err);
      if (err?.message?.includes("duplicate")) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle already exists" });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to upsert Vehicle",
        });
      }
    }
  }

  async function deleteVehicle(req, res) {
    const { id } = req.params;
    try {
      // Fetch driver
      let driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("Vehicles") AS v(obj)
          WHERE v.obj->>'id' = $1
        )`,
        [id]
      );
      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle driver not found" });
      }
      const driver = camelcaseKeys(driverRes[0]);
      const result = await withTransaction(async (client) => {
        const rows = await dbTxQuery(
          client,
          `UPDATE dbo."Vehicles" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING * `,
          [id]
        );

        const driverVehicles = driver.vehicles?.filter(
          (x) => x.id.toString() !== id.toString()
        );
        driverRes = await dbTxQuery(
          client,
          `UPDATE dbo."Drivers" 
            SET "Vehicles" = $1, "UpdatedAt" = NOW() 
            WHERE "Id" = $2`,
          [JSON.stringify(driverVehicles), driver?.id]
        );
        return camelcaseKeys(rows[0]);
      });

      invalidateCachePrefix(CACHE_KEYS.vehicles);
      invalidateCachePrefix(CACHE_KEYS.drivers);

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete Vehicle",
      });
    }
  }

  // expose everything to routes.js
  return {
    detectHandler,
    streamFrameHandler,
    getLatestFrameHandler,
    sensorHandler,
    getVehicleBrands,
    getIdentificationTypes,
    upsertIdentificationType,
    deleteIdentificationType,
    getRoleTypes,
    upsertRoleType,
    deleteRoleType,
    getDrivers,
    upsertDriver,
    deleteDriver,
    getUsers,
    upsertUser,
    deleteUser,
    getVehicles,
    upsertVehicle,
    deleteVehicle,
  };
}
