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
  };
}
