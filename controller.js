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
export function createControllers({ pool }) {
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
