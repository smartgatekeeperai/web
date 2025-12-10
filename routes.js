// routes.js
import express from "express";
import { createControllers } from "./controller.js";
import path from "path";

export function registerRoutes(app, { pool, webRoutes, publicDir }) {
  const controllers = createControllers({ pool, publicDir });

  // ----------------------------------------------------
  // Admin Dashboard Routes (HTML pages in /public)
  // ----------------------------------------------------
  for (const file of webRoutes) {
    const name = file.replace(".html", ""); // e.g. "drivers"

    if (name.includes("index")) {
      // Root → redirect to /dashboard
      app.get("/", (req, res) => {
        return res.redirect("/dashboard");
      });

      // Dashboard (main admin page, using index.html)
      app.get("/dashboard", (req, res) => {
        return res.sendFile(path.join(publicDir, "index.html"));
      });
    } else {
      // other pages based on HTML files
      app.get(`/${name}`, (req, res) => {
        // ✅ no leading slash here
        return res.sendFile(path.join(publicDir, file));
      });
    }
  }

  // ----------------------------------------------------
  // Static Web Server for /public assets (CSS, JS, etc.)
  // ----------------------------------------------------
  app.use(express.static(publicDir));

  // ----------------------------------------------------
  // Route: GET /vehicle-brands
  // ----------------------------------------------------
  app.get("/api/vehicle-brands", controllers.getVehicleBrands);

  // ----------------------------------------------------
  // CRUD API routes (upsert, delete, get all)
  // ----------------------------------------------------
  app.get("/api/identification-types", controllers.getIdentificationTypes);
  app.post("/api/identification-types", controllers.upsertIdentificationType);
  app.delete(
    "/api/identification-types/:id",
    controllers.deleteIdentificationType
  );

  app.get("/api/role-types", controllers.getRoleTypes);
  app.post("/api/role-types", controllers.upsertRoleType);
  app.delete("/api/role-types/:id", controllers.deleteRoleType);

  app.get("/api/drivers", controllers.getDrivers);
  app.post("/api/drivers", controllers.upsertDriver);
  app.delete("/api/drivers/:id", controllers.deleteDriver);

  app.get("/api/users", controllers.getUsers);
  app.post("/api/users", controllers.upsertUser);
  app.delete("/api/users/:id", controllers.deleteUser);

  app.get("/api/vehicles", controllers.getVehicles);
  app.post("/api/vehicles", controllers.upsertVehicle);
  app.delete("/api/vehicles/:id", controllers.deleteVehicle);
}
