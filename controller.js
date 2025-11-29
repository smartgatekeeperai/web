// controller.js
import Groq from "groq-sdk";
import { imageSize } from "image-size";
import camelcaseKeys from "camelcase-keys";

// Groq OCR model (recommended for OCR)
const OCR_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Concurrency config (same as before)
const MAX_CONCURRENT_DETECTIONS = 1;

// ----------------------------------------------------
// Factory to create controllers with access to pool
// ----------------------------------------------------
export function createControllers({ pool }) {
  let inFlightDetections = 0;

  // ----------------------------------------------------
  // Utility: Buffer → base64 data URL
  // (same function, just moved here)
  // ----------------------------------------------------
  function encodeBytesToDataUrl(buffer, contentType) {
    const ct = contentType || "image/jpeg";
    const b64 = buffer.toString("base64");
    return `data:${ct};base64,${b64}`;
  }

  // ----------------------------------------------------
  // DB helper: get next active API key (auto-switch)
  // (same logic, using pool from closure)
  // ----------------------------------------------------
  async function getNextApiKeyFromDb() {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

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
        await client.query("ROLLBACK");
        throw new Error('No active API keys found in dbo."APIKeyManagement"');
      }

      const row = selectRes[0];

      await client.query(
        `
        UPDATE dbo."APIKeyManagement"
        SET "Usage" = COALESCE("Usage", 0) + 1
        WHERE "Email" = $1 AND "APIKey" = $2
        `,
        [row.Email, row.APIKey]
      );

      await client.query("COMMIT");

      return row; // { Email, Name, APIKey, Usage }
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
  // Groq Vision OCR + BBOX
  // (same as your original function)
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
  // /detect handler (same logic as your route body)
  // ----------------------------------------------------
  async function detectHandler(req, res) {
    if (inFlightDetections >= MAX_CONCURRENT_DETECTIONS) {
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

      let keyRow;
      try {
        keyRow = await getNextApiKeyFromDb();
      } catch (dbErr) {
        console.error("[Detect] Failed to fetch Groq API key from DB:", dbErr);
        return res
          .status(500)
          .json({ success: false, message: "No active API key available" });
      }

      const groqClient = new Groq({ apiKey: keyRow.APIKey });

      const detectionResult = await groqPlateDetect(
        groqClient,
        buffer,
        mimetype
      );

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
        return res.json(response);
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
        etections: [detection], // NOTE: kept your original typo "etections" to avoid changing behavior
      };

      return res.json(response);
    } catch (err) {
      console.error("[Detect] Internal error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    } finally {
      inFlightDetections--;
    }
  }

  // ----------------------------------------------------
  // CRUD HELPERS
  // ----------------------------------------------------
  async function dbQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  // ------------ IdentificationType ------------
  async function getIdentificationTypes(req, res) {
    try {
      const rows = await dbQuery(
        `SELECT * FROM dbo."IdentificationType" WHERE "Active" = true ORDER BY "Id" ASC`
      );
      return res.json({ success: true, data: camelcaseKeys(rows) });
    } catch (err) {
      res
        .status(500)
        .json({
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
          `UPDATE dbo."IdentificationType" SET "Name" = $1 WHERE "Id" = $2 RETURNING *`,
          [name, id]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."IdentificationType" ("Name") VALUES ($1) RETURNING *`,
          [name]
        );
      }
      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      if (err?.message?.includes("duplicate")) {
        res
          .status(400)
          .json({
            success: false,
            message: "IdentificationType already exists",
          });
      } else {
        res
          .status(500)
          .json({
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
        `UPDATE dbo."IdentificationType" SET "Active" = false WHERE "Id" = $1 RETURNING * `,
        [id]
      );
      if (!camelcaseKeys(rows[0]))
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json({
          success: false,
          message: "Failed to delete IdentificationType",
        });
    }
  }

  // ------------ RoleType ------------
  async function getRoleTypes(req, res) {
    try {
      const rows = await dbQuery(
        `SELECT * FROM dbo."RoleType" WHERE "Active" = true ORDER BY "RoleType" ASC`
      );
      return res.json({ success: true, data: camelcaseKeys(rows) });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch RoleType" });
    }
  }

  async function upsertRoleType(req, res) {
    const { id, name } = req.body || {};
    try {
      let rows;
      if (id) {
        rows = await dbQuery(
          `UPDATE dbo."RoleType" SET "Name" = $1 WHERE "Id" = $2 RETURNING *`,
          [name, id]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."RoleType" ("Name") VALUES ($1) RETURNING *`,
          [name]
        );
      }
      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      if (err?.message?.includes("duplicate")) {
        res
          .status(400)
          .json({ success: false, message: "RoleType already exists" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to upsert RoleType" });
      }
    }
  }

  async function deleteRoleType(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."RoleType" SET "Active" = false WHERE "Id" = $1 RETURNING *`,
        [id]
      );
      if (!camelcaseKeys(rows[0]))
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to delete RoleType" });
    }
  }

  // ------------ Drivers ------------
  async function getDrivers(req, res) {
    try {
      const rows = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true ORDER BY "Id" ASC`
      );
      return res.json({ success: true, data: camelcaseKeys(rows) });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch Drivers" });
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
    } = req.body || {};

    try {
      let rows;
      if (
        !gender ||
        !["male", "female"].some((x) => x === gender.toLowerCase())
      ) {
        return res
          .status(500)
          .json({
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
          return res
            .status(500)
            .json({
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
          return res
            .status(500)
            .json({
              success: false,
              message: `Identification Type '${identificationType}' not found`,
            });
        }
      }
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
          `UPDATE dbo."Drivers" SET "FullName" = $1, "Gender" = $2, "ContactNumber" = $3, "RoleType" = $4, "IdentificationType" = $5, "IdentificationNumber" = $6 WHERE "Id" = $7 RETURNING *`,
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
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."Drivers" ("FullName", "Gender", "ContactNumber", "RoleType", "IdentificationType", "IdentificationNumber") VALUES ($1, $2, $3, $4, $5, $6) RETURNING * `,
          [
            fullName,
            gender,
            contactNumber ?? null,
            roleType,
            identificationType,
            identificationNumber,
          ]
        );
      }
      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      if (err?.message?.includes("duplicate")) {
        res
          .status(400)
          .json({ success: false, message: "Driver already exists" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to upsert Driver" });
      }
    }
  }

  async function deleteDriver(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."Drivers" SET "Active" = false WHERE "Id" = $1 RETURNING *`,
        [id]
      );
      if (!camelcaseKeys(rows[0]))
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to delete Driver" });
    }
  }

  // ------------ User ------------
  async function getUsers(req, res) {
    try {
      const rows = await dbQuery(
        `SELECT "UserId", "Name", "Username", "Active" FROM dbo."User" WHERE "Active" = true ORDER BY "UserId" ASC`
      );
      return res.json({ success: true, data: camelcaseKeys(rows) });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch Users" });
    }
  }

  async function upsertUser(req, res) {
    const { userId, name, username, password } = req.body || {};
    try {
      let rows;
      if (userId) {
        rows = await dbQuery(
          `UPDATE dbo."User" SET "Name" = $1, "Username" = $2, "Password" = $3 WHERE "UserId" = $4 RETURNING "UserId", "Name", "Username", "Active" `,
          [name, username, password, userId]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."User" ("Name", "Username", "Password") VALUES ($1, $2, $3) RETURNING "UserId", "Name", "Username", "Active"`,
          [name, username, password]
        );
      }
      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      if (err?.message?.includes("duplicate")) {
        res
          .status(400)
          .json({ success: false, message: "User already exists" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to upsert User" });
      }
    }
  }

  async function deleteUser(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."User" SET "Active" = false WHERE "UserId" = $1 RETURNING "UserId", "Name", "Username", "Active" `,
        [id]
      );
      if (!camelcaseKeys(rows[0]))
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to delete User" });
    }
  }

  // ------------ Vehicles ------------
  async function getVehicles(req, res) {
    try {
      const rows = await dbQuery(
        `SELECT * FROM dbo."Vehicles" WHERE "Active" = true ORDER BY "Id" ASC`
      );
      return res.json({ success: true, data: camelcaseKeys(rows) });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch Vehicles" });
    }
  }

  async function upsertVehicle(req, res) {
    const { id, plateNumber, model, brand } = req.body || {};
    try {
      let rows;
      if (id) {
        rows = await dbQuery(
          `UPDATE dbo."Vehicles" SET "PlateNumber" = $1, "Model" = $2, "Brand" = $3) WHERE "Id" = $4 RETURNING * `,
          [plateNumber, model, brand, id]
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."Vehicles" ("PlateNumber", "Model", "Brand") VALUES ($1, $2, $3) RETURNING * `,
          [plateNumber, model, brand]
        );
      }
      return res.json({ success: true, data: camelcaseKeys(rows[0]) });
    } catch (err) {
      if (err?.message?.includes("duplicate")) {
        res
          .status(400)
          .json({ success: false, message: "Vehicle already exists" });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to upsert Vehicle" });
      }
    }
  }

  async function deleteVehicle(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."Vehicles" SET "Active" = false WHERE "Id" = $1 RETURNING * `,
        [id]
      );
      if (!camelcaseKeys(rows[0]))
        return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Failed to delete Vehicle" });
    }
  }

  // expose everything to routes.js
  return {
    detectHandler,
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
