//controller.js
import Groq from "groq-sdk";
import { imageSize } from "image-size";
import camelcaseKeys from "camelcase-keys";
import NodeCache from "node-cache";

// ----------------------------------------------------
// Factory to create controllers with access to pool
// ----------------------------------------------------
export function createControllers({ pool, pusher }) {
  let gateState = {
    vehicleFound: false,
    plate: null,
    driver: null, //{ } database data
    vehicle: null, //{ } database data
    lastUpdate: null,
  };
  // ----------------------------------------------------
  // CRUD / DB HELPERS
  // ----------------------------------------------------
  async function dbQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  // ----------------------------------------------------
  // /detect handler (Groq)
  // ----------------------------------------------------
  async function detectHandler(req, res) {
    const {
         stream_id, 
         vehicles, //multiple/array of vehicles detected
         plates //multiple/array of plates detected
        } = req.body || {};

    if (!vehicles?.length && !plates?.length) {
      gateState = {
        vehicleFound: false,
        plate: null,
        driver: null,
        vehicle: null,
      };
      await pusher.trigger("gate-channel", "gate-update", gateState);
      return res.json({
        success: true,
        data: gateState,
      });
    }

    if (vehicles?.length > 0 && !plates?.length) {
      gateState = {
        vehicleFound: true,
        plate: null,
        driver: null,
        vehicle: null,
        lastUpdate: gateState.lastUpdate,
      };
      await pusher.trigger("gate-channel", "gate-update", gateState);
      return res.json({
        success: true,
        data: gateState,
      });
    }
    const timeSinceLastUpdate = Date.now() - (gateState.lastUpdate || 0);

    if (timeSinceLastUpdate > 5000) {
      await pusher.trigger("gate-channel", "gate-update", gateState);
      return res.json({
        success: true,
        data: gateState,
      });
    }

    try {
        const foundPlates = plates.map(x=>x.ocr?.text?.replace(/\s+/g, "").replace(/-/g, "").toLowerCase()); 
      const rows = await dbQuery(
        `
        SELECT v.*, p.cleaned_input
        FROM dbo."Vehicles" v
        CROSS JOIN UNNEST($1::text[]) AS p(cleaned_input)
        WHERE 
            LOWER(REPLACE(REPLACE(v."PlateNumber", ' ', ''), '-', '')) = p.cleaned_input
            AND v."Active" = true`,
        [foundPlates]
      );

      vehicleDetails = rows.length > 0 ? camelcaseKeys(rows[0]) : null;
      if(!vehicleDetails) {
        gateState = {
            vehicleFound: true,
            plate: null,
            driver: null,
            vehicle: null,
            lastUpdate: gateState.lastUpdate,
        };
      } else {
        gateState = {
            plate: foundPlate,
            driver: vehicleDetails?.driver,
            vehicle: {
                brand: vehicleDetails?.brand,
                model: vehicleDetails?.model,
                type: vehicleDetails?.type,
            },
            lastUpdate: Date.now(),
        };
      }

      await pusher.trigger("gate-channel", "gate-update", gateState);

      return res.json({ success: true, data: response });
    } catch (err) {
      console.error("[Detect] Internal error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    } finally {
    }
  }
}
