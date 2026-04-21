// controller.js
import camelcaseKeys from "camelcase-keys";
import NodeCache from "node-cache";
import bcrypt from "bcryptjs";

// Simple in-memory cache for CRUD
const crudCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
});

const CACHE_KEYS = {
  vehicleBrands: "vehicleBrands",
  identificationTypes: "identificationTypes",
  roleTypes: "roleTypes",
  drivers: "drivers",
  users: "users",
  vehicles: "vehicles",
};

function invalidateCachePrefix(prefix) {
  const keys = crudCache.keys();
  const toDelete = keys.filter(
    (k) => k === prefix || k.startsWith(prefix + ":"),
  );
  if (toDelete.length > 0) {
    crudCache.del(toDelete);
  }
}

export function createControllers({ pool }) {
  async function dbQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  async function dbTxQuery(client, sql, params = []) {
    const { rows } = await client.query(sql, params);
    return rows;
  }

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
      } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }

  async function hashPassword(plain) {
    const bcryptRounds = !isNaN(Number(process.env.BCRYPT_SALT_ROUNDS))
      ? Number(process.env.BCRYPT_SALT_ROUNDS)
      : 10;
    const salt = await bcrypt.genSalt(bcryptRounds);
    return bcrypt.hash(plain, salt);
  }

  function compare(storedHash, plain) {
    return bcrypt.compare(plain, storedHash);
  }

  // ------------ Public Safe Config ------------
  async function getPublicConfig(req, res) {
    try {
      const rawNames = req.query.names;
      const names = String(rawNames || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      if (!names.length) {
        return res.status(400).json({
          success: false,
          message: "Missing config names",
        });
      }

      const allowed = {
        pusher: () => {
          const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
          const vercel = process.env.VERCEL === "1";

          const pusherKey = String(process.env.PUSHER_KEY || "").trim();
          const pusherHost = String(process.env.PUSHER_HOST || "").trim();
          const pusherPort = Number(process.env.PUSHER_PORT || 6001);
          const useLocalRequested =
            String(process.env.USE_LOCAL_PUSHER || "false").toLowerCase() ===
            "true";

          const isProduction = nodeEnv === "production" || vercel;
          const useLocal = useLocalRequested && !isProduction;

          if (useLocal) {
            const payload = {
              mode: "local",
              key: pusherKey,
              cluster: String(process.env.PUSHER_CLUSTER || "ap1").trim(),
              wsHost: pusherHost || req.hostname,
              wsPort: pusherPort,
              forceTLS: false,
              enabledTransports: ["ws"],
              disableStats: true,
            };

            console.log("[public-config] local pusher config =", payload);
            return payload;
          }

          const payload = {
            mode: "cloud",
            key: pusherKey,
            cluster: String(process.env.PUSHER_CLUSTER || "ap1").trim(),
            forceTLS: true,
          };

          console.log("[public-config] cloud pusher config =", payload);
          return payload;
        },
        ai: () => {
          const baseUrl = String(process.env.AI_SERVER_URL || "")
            .trim()
            .replace(/\/+$/, "");

          return {
            logThumbnail: baseUrl ? `${baseUrl}/images/` : "",
          };
        }
      };

      const data = {};

      for (const name of names) {
        if (!allowed[name]) continue;
        data[name] = allowed[name]();
      }

      return res.json({
        success: true,
        data,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to load public config",
      });
    }
  }

  // ------------ Vehicle Brand and Model ------------
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
        },
      );

      if (!resp.ok) {
        throw new Error("Failed to load vehicle brands");
      }

      const data = await resp.json();
      const brands = data?.map((x) => x.name) || [];
      crudCache.set(CACHE_KEYS.vehicleBrands, brands);

      return res.json({ success: true, data: brands });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch vehicle brands",
      });
    }
  }

  async function getIdentificationTypes(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.identificationTypes);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."IdentificationType" WHERE "Active" = true ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC`,
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
          [id],
        );

        if (!rows.length) {
          return res
            .status(500)
            .json({ success: false, message: "Identification Type not found" });
        }

        rows = await dbQuery(
          `UPDATE dbo."IdentificationType" SET "Name" = $1, "UpdatedAt" = NOW() WHERE "Id" = $2 RETURNING *`,
          [name, id],
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."IdentificationType" ("Name") VALUES ($1) RETURNING *`,
          [name],
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
      }
      return res.status(500).json({
        success: false,
        message: "Failed to upsert IdentificationType",
      });
    }
  }

  async function deleteIdentificationType(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."IdentificationType" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING *`,
        [id],
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

  async function getRoleTypes(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.roleTypes);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."RoleType" WHERE "Active" = true ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC`,
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
          [name, id],
        );
      } else {
        rows = await dbQuery(
          `INSERT INTO dbo."RoleType" ("Name") VALUES ($1) RETURNING *`,
          [name],
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
      }
      return res.status(500).json({
        success: false,
        message: "Failed to upsert RoleType",
      });
    }
  }

  async function deleteRoleType(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."RoleType" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING *`,
        [id],
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

  async function getDrivers(req, res) {
    try {
      let { limit, offset } = req.query;
      limit = parseInt(limit, 10);
      offset = parseInt(offset, 10);

      const cacheKey = `${CACHE_KEYS.drivers}:${limit}:${offset}`;
      const cached = crudCache.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: cached.data,
          total: cached.total,
        });
      }

      const [rows, totalRows] = await Promise.all([
        dbQuery(
          `SELECT * FROM dbo."Drivers"
           WHERE "Active" = true
           ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        dbQuery(
          `SELECT COUNT(*) AS "total"
           FROM dbo."Vehicles"
           WHERE "Active" = true`,
        ),
      ]);

      const data = camelcaseKeys(rows);
      const total = Number(totalRows?.[0]?.total ?? 0);

      const payload = { data, total };
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

      if (!gender || !["male", "female"].includes(gender.toLowerCase())) {
        return res.status(500).json({
          success: false,
          message: `Invalid gender value '${gender}'`,
        });
      }

      if (roleType) {
        rows = await dbQuery(
          `SELECT * FROM dbo."RoleType" WHERE "Active" = true AND LOWER("Name") = LOWER($1)`,
          [roleType],
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
          [identificationType],
        );
        if (!rows.length) {
          return res.status(500).json({
            success: false,
            message: `Identification Type '${identificationType}' not found`,
          });
        }
      }

      if (id) {
        rows = await dbQuery(
          `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
          [id],
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
          ],
        );

        invalidateCachePrefix(CACHE_KEYS.drivers);
        return res.json({ success: true, data: camelcaseKeys(rows[0]) });
      }

      const result = await withTransaction(async (client) => {
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
          ],
        );

        const driver = camelcaseKeys(driverRows[0]);

        if (!(plateNumber && type && model && brand)) {
          throw new Error("Vehicle information is required");
        }

        const vehicleRes = await dbTxQuery(
          client,
          `INSERT INTO dbo."Vehicles"
           ("PlateNumber", "Driver", "Type", "Model", "Brand")
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [plateNumber, JSON.stringify(driver), type, model, brand],
        );

        const vehicle = camelcaseKeys(vehicleRes[0]);
        const vehicles = [{ id: vehicle?.id, plateNumber, type, model, brand }];

        const updatedDriverRows = await dbTxQuery(
          client,
          `UPDATE dbo."Drivers"
           SET "Vehicles" = $1, "UpdatedAt" = NOW()
           WHERE "Id" = $2
           RETURNING *`,
          [JSON.stringify(vehicles), driver.id],
        );

        return camelcaseKeys(updatedDriverRows[0]);
      });

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
      }

      return res.status(500).json({
        success: false,
        message: "Failed to upsert Driver",
      });
    }
  }

  async function deleteDriver(req, res) {
    const { id } = req.params;
    try {
      let driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
        [id],
      );

      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Driver not found" });
      }

      const driver = camelcaseKeys(driverRes[0]);

      await withTransaction(async (client) => {
        const vehiclesToDelete = Array.isArray(driver.vehicles)
          ? driver.vehicles
              .map((v) => Number(v.id))
              .filter((n) => Number.isFinite(n))
          : [];

        if (vehiclesToDelete.length > 0) {
          await dbTxQuery(
            client,
            `UPDATE dbo."Vehicles" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = ANY($1::bigint[])`,
            [vehiclesToDelete],
          );
        }

        await dbTxQuery(
          client,
          `UPDATE dbo."Drivers" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING *`,
          [id],
        );
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

  async function getUsers(req, res) {
    try {
      const cached = crudCache.get(CACHE_KEYS.users);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."User" WHERE "Active" = true ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC`,
      );
      const data = camelcaseKeys(rows);
      crudCache.set(CACHE_KEYS.users, data);

      return res.json({
        success: true,
        data: data.map((x) => {
          delete x?.password;
          return x;
        }),
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Users",
      });
    }
  }

  async function loginUser(req, res) {
    const { username, password } = req.body || {};
    try {
      if (!username) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Username should not be null or empty",
          });
      }

      if (!password) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Password should not be null or empty",
          });
      }

      const rows = await dbQuery(
        `SELECT * FROM dbo."User" WHERE "Username" = $1 AND "Active" = true`,
        [username],
      );

      if (!rows.length) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }

      const user = camelcaseKeys(rows[0]);
      const isMatch = await compare(user.password, password);

      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, message: "Password incorrect" });
      }

      delete user.password;
      return res.json({ success: true, data: user });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to login User",
      });
    }
  }

  async function upsertUser(req, res) {
    const { id, name, username, password } = req.body || {};
    try {
      if (!username) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Username should not be null or empty",
          });
      }

      if (!name) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Name should not be null or empty",
          });
      }

      let rows;
      if (id) {
        rows = await dbQuery(
          `UPDATE dbo."User"
           SET "Name" = $1, "Username" = $2, "UpdatedAt" = NOW()
           WHERE "Id" = $3
           RETURNING *`,
          [name, username, id],
        );
      } else {
        if (!password) {
          return res
            .status(401)
            .json({
              success: false,
              message: "Password should not be null or empty",
            });
        }

        const passwordHash = await hashPassword(password);
        rows = await dbQuery(
          `INSERT INTO dbo."User" ("Name", "Username", "Password")
           VALUES ($1, $2, $3)
           RETURNING *`,
          [name, username, passwordHash],
        );
      }

      invalidateCachePrefix(CACHE_KEYS.users);

      const user = camelcaseKeys(rows[0]);
      delete user?.password;

      return res.json({ success: true, data: user });
    } catch (err) {
      console.error(err);
      if (err?.message?.includes("duplicate")) {
        return res
          .status(400)
          .json({ success: false, message: "User already exists" });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to upsert User",
      });
    }
  }

  async function updateUserPassword(req, res) {
    const { id } = req.params;
    const { password } = req.body || {};
    try {
      if (!id) {
        return res
          .status(401)
          .json({
            success: false,
            message: "User id should not be null or empty",
          });
      }

      if (!password) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Password should not be null or empty",
          });
      }

      const passwordHash = await hashPassword(password);
      const rows = await dbQuery(
        `UPDATE dbo."User"
         SET "Password" = $1, "UpdatedAt" = NOW()
         WHERE "Id" = $2
         RETURNING *`,
        [passwordHash, id],
      );

      invalidateCachePrefix(CACHE_KEYS.users);

      const user = camelcaseKeys(rows[0]);
      delete user?.password;

      return res.json({ success: true, data: user });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to update user password",
      });
    }
  }

  async function changeUserPassword(req, res) {
    const { id } = req.params;
    const { oldPassword, password } = req.body || {};
    try {
      if (!id) {
        return res
          .status(401)
          .json({
            success: false,
            message: "User id should not be null or empty",
          });
      }

      if (!oldPassword) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Old password should not be null or empty",
          });
      }

      if (!password) {
        return res
          .status(401)
          .json({
            success: false,
            message: "Password should not be null or empty",
          });
      }

      let rows = await dbQuery(
        `SELECT * FROM dbo."User" WHERE "Id" = $1 AND "Active" = true`,
        [id],
      );

      if (!rows.length) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }

      let user = camelcaseKeys(rows[0]);
      const isMatch = await compare(user.password, oldPassword);

      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, message: "Old password incorrect" });
      }

      const passwordHash = await hashPassword(password);
      rows = await dbQuery(
        `UPDATE dbo."User"
         SET "Password" = $1, "UpdatedAt" = NOW()
         WHERE "Id" = $2
         RETURNING *`,
        [passwordHash, id],
      );

      invalidateCachePrefix(CACHE_KEYS.users);

      user = camelcaseKeys(rows[0]);
      delete user?.password;

      return res.json({ success: true, data: user });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to update user password",
      });
    }
  }

  async function deleteUser(req, res) {
    const { id } = req.params;
    try {
      const rows = await dbQuery(
        `UPDATE dbo."User"
         SET "Active" = false, "UpdatedAt" = NOW()
         WHERE "Id" = $1
         RETURNING "Id", "Name", "Username", "Active"`,
        [id],
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

  async function getVehicles(req, res) {
    try {
      let { limit, offset, driver } = req.query;

      driver = !isNaN(Number(driver)) ? Number(driver) : null;
      limit = parseInt(limit, 10);
      offset = parseInt(offset, 10);
      if (Number.isNaN(offset) || offset < 0) offset = 0;

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

      const [rows, totalRows] = await Promise.all([
        dbQuery(
          driver
            ? `SELECT * FROM dbo."Vehicles"
               WHERE "Active" = true AND "Driver"->>'id' = $3
               ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
               LIMIT $1 OFFSET $2`
            : `SELECT * FROM dbo."Vehicles"
               WHERE "Active" = true
               ORDER BY GREATEST("CreatedAt", "UpdatedAt") DESC
               LIMIT $1 OFFSET $2`,
          driver ? [limit, offset, driver] : [limit, offset],
        ),
        dbQuery(
          driver
            ? `SELECT COUNT(*) AS "total"
               FROM dbo."Vehicles"
               WHERE "Active" = true AND "Driver"->>'id' = $1`
            : `SELECT COUNT(*) AS "total"
               FROM dbo."Vehicles"
               WHERE "Active" = true`,
          driver ? [driver] : [],
        ),
      ]);

      const data = camelcaseKeys(rows);
      const total = Number(totalRows?.[0]?.total ?? 0);

      const payload = { data, total };
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

      const driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND "Id" = $1`,
        [driverId],
      );

      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle driver not found" });
      }

      const driver = camelcaseKeys(driverRes[0]);

      const savedVehicle = await withTransaction(async (client) => {
        if (id) {
          const vehicleRows = await dbTxQuery(
            client,
            `UPDATE dbo."Vehicles"
             SET "PlateNumber" = $1, "Type" = $2, "Model" = $3, "Brand" = $4, "UpdatedAt" = NOW()
             WHERE "Id" = $5
             RETURNING *`,
            [plateNumber, type, model, brand, id],
          );

          const updatedVehicle = camelcaseKeys(vehicleRows[0]);
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
            [JSON.stringify(driverVehicles), driverId],
          );

          return updatedVehicle;
        }

        const vehicleRows = await dbTxQuery(
          client,
          `INSERT INTO dbo."Vehicles"
           ("PlateNumber", "Driver", "Type", "Model", "Brand")
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [plateNumber, JSON.stringify(driver), type, model, brand],
        );

        const vehicle = camelcaseKeys(vehicleRows[0]);
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
          [JSON.stringify(driverVehicles), driverId],
        );

        return vehicle;
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
      }

      return res.status(500).json({
        success: false,
        message: "Failed to upsert Vehicle",
      });
    }
  }

  async function deleteVehicle(req, res) {
    const { id } = req.params;
    try {
      let driverRes = await dbQuery(
        `SELECT * FROM dbo."Drivers" WHERE "Active" = true AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("Vehicles") AS v(obj)
          WHERE v.obj->>'id' = $1
        )`,
        [id],
      );

      if (!driverRes.length) {
        return res
          .status(400)
          .json({ success: false, message: "Vehicle driver not found" });
      }

      const driver = camelcaseKeys(driverRes[0]);

      await withTransaction(async (client) => {
        await dbTxQuery(
          client,
          `UPDATE dbo."Vehicles" SET "Active" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING *`,
          [id],
        );

        const driverVehicles = driver.vehicles?.filter(
          (x) => x.id.toString() !== id.toString(),
        );

        await dbTxQuery(
          client,
          `UPDATE dbo."Drivers"
           SET "Vehicles" = $1, "UpdatedAt" = NOW()
           WHERE "Id" = $2`,
          [JSON.stringify(driverVehicles), driver?.id],
        );
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

    async function getLights(req, res) {
    try {
      const rows = await dbQuery(
        `
        SELECT *
        FROM dbo."Lights"
        WHERE "Active" = true
        ORDER BY COALESCE("UpdatedAt", "CreatedAt") DESC, "Name" ASC
        `,
      );

      return res.json({
        success: true,
        data: camelcaseKeys(rows),
      });
    } catch (err) {
      console.error("[getLights] error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Lights",
      });
    }
  }

  async function upsertLight(req, res) {
    try {
      const {
        originalName,
        originalSecretKey,
        name,
        secretKey,
        cameraStreamId,
      } = req.body || {};

      const finalName = String(name || "").trim().toUpperCase();
      const finalSecretKey = String(secretKey || "").trim().toUpperCase();
      const finalCameraStreamId = String(cameraStreamId || "").trim();

      if (!finalName || !finalSecretKey || !finalCameraStreamId) {
        return res.status(400).json({
          success: false,
          message: "Name, SecretKey, and CameraStreamId are required",
        });
      }

      if (finalName.length > 4) {
        return res.status(400).json({
          success: false,
          message: "Name must be at most 4 characters",
        });
      }

      if (finalSecretKey.length > 4) {
        return res.status(400).json({
          success: false,
          message: "SecretKey must be at most 4 characters",
        });
      }

      const hasOriginalKeys =
        String(originalName || "").trim() && String(originalSecretKey || "").trim();

      let rows;

      if (hasOriginalKeys) {
        const oldName = String(originalName || "").trim().toUpperCase();
        const oldSecretKey = String(originalSecretKey || "").trim().toUpperCase();

        const existing = await dbQuery(
          `
          SELECT *
          FROM dbo."Lights"
          WHERE "Name" = $1
            AND "SecretKey" = $2
            AND "Active" = true
          `,
          [oldName, oldSecretKey],
        );

        if (!existing.length) {
          return res.status(404).json({
            success: false,
            message: "Light not found",
          });
        }

        rows = await dbQuery(
          `
          UPDATE dbo."Lights"
          SET
            "Name" = $1,
            "SecretKey" = $2,
            "CameraStreamId" = $3,
            "UpdatedAt" = NOW()
          WHERE "Name" = $4
            AND "SecretKey" = $5
          RETURNING *
          `,
          [finalName, finalSecretKey, finalCameraStreamId, oldName, oldSecretKey],
        );
      } else {
        rows = await dbQuery(
          `
          INSERT INTO dbo."Lights" (
            "Name",
            "SecretKey",
            "CameraStreamId"
          )
          VALUES ($1, $2, $3)
          RETURNING *
          `,
          [finalName, finalSecretKey, finalCameraStreamId],
        );
      }

      return res.json({
        success: true,
        data: camelcaseKeys(rows[0]),
      });
    } catch (err) {
      console.error("[upsertLight] error:", err);

      if (err?.message?.includes("duplicate") || err?.code === "23505") {
        return res.status(400).json({
          success: false,
          message: "Light already exists",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to save Light",
      });
    }
  }

  async function deleteLight(req, res) {
    try {
      const { name, secretKey } = req.params;

      const finalName = String(name || "").trim().toUpperCase();
      const finalSecretKey = String(secretKey || "").trim().toUpperCase();

      const rows = await dbQuery(
        `
        UPDATE dbo."Lights"
        SET
          "Active" = false,
          "UpdatedAt" = NOW()
        WHERE "Name" = $1
          AND "SecretKey" = $2
          AND "Active" = true
        RETURNING *
        `,
        [finalName, finalSecretKey],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Light not found",
        });
      }

      return res.json({
        success: true,
      });
    } catch (err) {
      console.error("[deleteLight] error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete Light",
      });
    }
  }

  async function getSummary(req, res) {
    try {
      const now = new Date();

      function toSqlLocalTimestamp(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mi = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");
        const ms = String(date.getMilliseconds()).padStart(3, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
      }

      function startOfDay(dateValue) {
        const d = new Date(dateValue);
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function addDays(dateValue, days) {
        const d = new Date(dateValue);
        d.setDate(d.getDate() + days);
        return d;
      }

      function formatHourLabel(hour24) {
        const suffix = hour24 >= 12 ? "PM" : "AM";
        const hour12 = hour24 % 12 || 12;
        return `${hour12}`;
      }

      function formatTwoHourRangeLabel(startHour) {
        const endHour = (startHour + 2) % 24;

        const startLabel = formatHourLabel(startHour);
        const endLabel = formatHourLabel(endHour);

        const suffix =
          startHour < 12
            ? endHour === 0 || endHour <= 12
              ? "AM"
              : "PM"
            : "PM";

        return `${startLabel}-${endLabel} ${suffix}`;
      }

      const todayStart = startOfDay(now);
      const tomorrowStart = addDays(todayStart, 1);
      const sevenDaysStart = addDays(todayStart, -6);

      const todayStartSql = toSqlLocalTimestamp(todayStart);
      const tomorrowStartSql = toSqlLocalTimestamp(tomorrowStart);
      const sevenDaysStartSql = toSqlLocalTimestamp(sevenDaysStart);

      const [
        totalTodayRows,
        avgDailyRows,
        activeDriversRows,
        hourlyRows,
      ] = await Promise.all([
        dbQuery(
          `
          SELECT COUNT(DISTINCT TRIM(UPPER("PlateNumber"))) AS "total"
          FROM dbo."Logs"
          WHERE "CreatedAt" >= $1::timestamp
            AND "CreatedAt" < $2::timestamp
            AND NULLIF(TRIM("PlateNumber"), '') IS NOT NULL
          `,
          [todayStartSql, tomorrowStartSql],
        ),

        dbQuery(
          `
          SELECT
            DATE("CreatedAt") AS "logDate",
            COUNT(DISTINCT TRIM(UPPER("PlateNumber"))) AS "dailyTotal"
          FROM dbo."Logs"
          WHERE "CreatedAt" >= $1::timestamp
            AND "CreatedAt" < $2::timestamp
            AND NULLIF(TRIM("PlateNumber"), '') IS NOT NULL
          GROUP BY DATE("CreatedAt")
          ORDER BY DATE("CreatedAt") ASC
          `,
          [sevenDaysStartSql, tomorrowStartSql],
        ),

        dbQuery(
          `
          SELECT COUNT(*) AS "total"
          FROM dbo."Drivers"
          WHERE "Active" = true
          `,
        ),

        dbQuery(
          `
          SELECT
            EXTRACT(HOUR FROM "CreatedAt")::int AS "hourOfDay",
            COUNT(DISTINCT TRIM(UPPER("PlateNumber"))) AS "hourlyTotal"
          FROM dbo."Logs"
          WHERE "CreatedAt" >= $1::timestamp
            AND "CreatedAt" < $2::timestamp
            AND NULLIF(TRIM("PlateNumber"), '') IS NOT NULL
          GROUP BY EXTRACT(HOUR FROM "CreatedAt")
          ORDER BY EXTRACT(HOUR FROM "CreatedAt") ASC
          `,
          [todayStartSql, tomorrowStartSql],
        ),
      ]);

      const totalVehiclesToday = Number(totalTodayRows?.[0]?.total ?? 0);

      const avgRows = camelcaseKeys(avgDailyRows);
      const averageVehiclesDaily =
        avgRows.length > 0
          ? Math.round(
              avgRows.reduce(
                (sum, row) => sum + Number(row.dailyTotal || 0),
                0,
              ) / avgRows.length,
            )
          : 0;

      const registeredVehicles = Number(activeDriversRows?.[0]?.total ?? 0);

      const hourMap = new Map();
      for (let hour = 0; hour < 24; hour += 1) {
        hourMap.set(hour, 0);
      }

      for (const row of camelcaseKeys(hourlyRows)) {
        const hour = Number(row.hourOfDay);
        const total = Number(row.hourlyTotal || 0);
        if (hour >= 0 && hour <= 23) {
          hourMap.set(hour, total);
        }
      }

      const groupedRanges = [];
      for (let startHour = 0; startHour < 24; startHour += 2) {
        const count =
          (hourMap.get(startHour) || 0) + (hourMap.get(startHour + 1) || 0);
        groupedRanges.push({
          label: formatTwoHourRangeLabel(startHour),
          value: count,
          startHour,
        });
      }

      groupedRanges.sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.startHour - b.startHour;
      });

      const peakHours = groupedRanges[0]?.label || "---";

      const payload = {
        success: true,
        data: {
          totalVehiclesToday,
          averageVehiclesDaily,
          registeredVehicles,
          peakHours,
        },
        debug: {
          todayStart: todayStartSql,
          tomorrowStart: tomorrowStartSql,
          last7DaysStart: sevenDaysStartSql,
        },
      };

      return res.json(payload);
    } catch (err) {
      console.error("[getSummary] error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch summary",
      });
    }
  }

  async function getLogs(req, res) {
    try {
      let { type, value } = req.query;

      type = String(type || "").trim().toLowerCase();
      value = Number(value);

      if (!["hourly", "daily", "weekly"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type. Allowed values: hourly, daily, weekly",
        });
      }

      if (!Number.isInteger(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid value. It must be a positive integer",
        });
      }

      const now = new Date();
      const cutoff = new Date(now);

      if (type === "hourly") {
        cutoff.setTime(now.getTime() - value * 60 * 60 * 1000);
      } else if (type === "daily") {
        cutoff.setTime(now.getTime() - value * 24 * 60 * 60 * 1000);
      } else if (type === "weekly") {
        cutoff.setTime(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
      }

      function toSqlLocalTimestamp(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mi = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");
        const ms = String(date.getMilliseconds()).padStart(3, "0");

        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
      }

      const nowSql = toSqlLocalTimestamp(now);
      const cutoffSql = toSqlLocalTimestamp(cutoff);

      const rows = await dbQuery(
        `
        SELECT *
        FROM dbo."Logs"
        WHERE "CreatedAt" >= $1::timestamp
          AND "CreatedAt" <= $2::timestamp
        ORDER BY "CreatedAt" DESC
        `,
        [cutoffSql, nowSql],
      );

      const payload = {
        success: true,
        data: camelcaseKeys(rows),
        total: rows.length,
        filter: {
          type,
          value,
        },
        debug: {
          now: nowSql,
          cutoff: cutoffSql,
        },
      };

      return res.json(payload);
    } catch (err) {
      console.error("[getLogs] error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch Logs",
      });
    }
  }

  async function getChart(req, res) {
    try {
      let { type, value } = req.query;

      type = String(type || "").trim().toLowerCase();
      value = Number(value);

      if (!["hourly", "daily", "weekly"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid type. Allowed values: hourly, daily, weekly",
        });
      }

      if (!Number.isInteger(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid value. It must be a positive integer",
        });
      }

      function toSqlLocalTimestamp(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mi = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");
        const ms = String(date.getMilliseconds()).padStart(3, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
      }

      function parseMaybeJson(value) {
        if (!value) return null;
        if (typeof value === "object") return value;
        if (typeof value !== "string") return null;
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }

      function classifyVehicleType(typeValue) {
        const raw = String(typeValue || "").trim().toLowerCase();

        if (!raw) return "car";
        if (raw.includes("motor")) return "motorcycle";
        if (raw.includes("pickup")) return "pickup";
        if (raw.includes("truck")) return "truck";
        if (raw.includes("bus")) return "bus";
        if (
          raw.includes("utility") ||
          raw.includes("uv") ||
          raw.includes("suv") ||
          raw.includes("van")
        ) {
          return "utilityVehicle";
        }

        return "car";
      }

      function startOfHour(dateValue) {
        const d = new Date(dateValue);
        d.setMinutes(0, 0, 0);
        return d;
      }

      function startOfDay(dateValue) {
        const d = new Date(dateValue);
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function startOfWeek(dateValue) {
        const d = new Date(dateValue);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
      }

      function addHours(dateValue, hours) {
        const d = new Date(dateValue);
        d.setHours(d.getHours() + hours);
        return d;
      }

      function addDays(dateValue, days) {
        const d = new Date(dateValue);
        d.setDate(d.getDate() + days);
        return d;
      }

      function addWeeks(dateValue, weeks) {
        return addDays(dateValue, weeks * 7);
      }

      function pad2(value) {
        return String(value).padStart(2, "0");
      }

      function formatBucketKey(dateValue, resolution) {
        const d = new Date(dateValue);

        if (resolution === "hourly") {
          const h = startOfHour(d);
          return `${h.getFullYear()}-${pad2(h.getMonth() + 1)}-${pad2(
            h.getDate()
          )} ${pad2(h.getHours())}:00`;
        }

        if (resolution === "daily") {
          const day = startOfDay(d);
          return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(
            day.getDate()
          )}`;
        }

        const week = startOfWeek(d);
        return `${week.getFullYear()}-${pad2(week.getMonth() + 1)}-${pad2(
          week.getDate()
        )}`;
      }

      function formatBucketLabel(dateValue, resolution) {
        const d = new Date(dateValue);

        if (resolution === "hourly") {
          let hours = d.getHours();
          const suffix = hours >= 12 ? "PM" : "AM";
          hours = hours % 12 || 12;
          return `${hours} ${suffix}`;
        }

        if (resolution === "daily") {
          return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }

        const end = addDays(d, 6);
        return `${d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} - ${end.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`;
      }

      function createBucket(current, chartType) {
        return {
          key: formatBucketKey(current, chartType),
          label: formatBucketLabel(current, chartType),
          plates: new Set(),
          categoryPlates: {
            car: new Set(),
            pickup: new Set(),
            utilityVehicle: new Set(),
            motorcycle: new Set(),
            truck: new Set(),
            bus: new Set(),
          },
        };
      }

      function buildBuckets(chartType, chartValue, now) {
        const buckets = [];

        if (chartType === "hourly") {
          let start = startOfHour(now);
          start = addHours(start, -(chartValue - 1));
          for (let i = 0; i < chartValue; i += 1) {
            buckets.push(createBucket(addHours(start, i), chartType));
          }
          return buckets;
        }

        if (chartType === "daily") {
          let start = startOfDay(now);
          start = addDays(start, -(chartValue - 1));
          for (let i = 0; i < chartValue; i += 1) {
            buckets.push(createBucket(addDays(start, i), chartType));
          }
          return buckets;
        }

        let start = startOfWeek(now);
        start = addWeeks(start, -(chartValue - 1));
        for (let i = 0; i < chartValue; i += 1) {
          buckets.push(createBucket(addWeeks(start, i), chartType));
        }
        return buckets;
      }

      const now = new Date();
      const cutoff = new Date(now);

      if (type === "hourly") {
        cutoff.setTime(now.getTime() - value * 60 * 60 * 1000);
      } else if (type === "daily") {
        cutoff.setTime(now.getTime() - value * 24 * 60 * 60 * 1000);
      } else if (type === "weekly") {
        cutoff.setTime(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
      }

      const nowSql = toSqlLocalTimestamp(now);
      const cutoffSql = toSqlLocalTimestamp(cutoff);

      const rows = await dbQuery(
        `
        SELECT "PlateNumber", "CreatedAt", "Vehicle"
        FROM dbo."Logs"
        WHERE "CreatedAt" >= $1::timestamp
          AND "CreatedAt" <= $2::timestamp
          AND NULLIF(TRIM("PlateNumber"), '') IS NOT NULL
        ORDER BY "CreatedAt" ASC
        `,
        [cutoffSql, nowSql]
      );

      const logs = camelcaseKeys(rows);
      const buckets = buildBuckets(type, value, now);
      const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

      for (const log of logs) {
        const createdAt = log?.createdAt;
        const plateNumber = String(log?.plateNumber || "").trim().toUpperCase();

        if (!createdAt || !plateNumber) continue;

        const vehicle = parseMaybeJson(log?.vehicle);
        const vehicleType = vehicle?.type || "";
        const category = classifyVehicleType(vehicleType);

        const bucketKey = formatBucketKey(createdAt, type);
        const bucket = bucketMap.get(bucketKey);
        if (!bucket) continue;

        bucket.plates.add(plateNumber);
        bucket.categoryPlates[category].add(plateNumber);
      }

      const payload = {
        success: true,
        data: buckets.map((bucket) => ({
          label: bucket.label,
          peakValue: bucket.plates.size,
          car: bucket.categoryPlates.car.size,
          pickup: bucket.categoryPlates.pickup.size,
          utilityVehicle: bucket.categoryPlates.utilityVehicle.size,
          motorcycle: bucket.categoryPlates.motorcycle.size,
          truck: bucket.categoryPlates.truck.size,
          bus: bucket.categoryPlates.bus.size,
        })),
        filter: {
          type,
          value,
        },
        debug: {
          now: nowSql,
          cutoff: cutoffSql,
          countBasis: "unique plate number per bucket",
        },
      };

        return res.json(payload);
      } catch (err) {
        console.error("[getChart] error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch chart data",
          error: err?.message || "Unknown error",
        });
      }
  } 

  return {
    getPublicConfig,
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
    loginUser,
    upsertUser,
    updateUserPassword,
    changeUserPassword,
    deleteUser,
    getVehicles,
    upsertVehicle,
    deleteVehicle,
    getLights,
    upsertLight,
    deleteLight,
    getSummary,
    getLogs,
    getChart,
  };
}
