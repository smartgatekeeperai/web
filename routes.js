// routes.js
import express from "express";
import { createControllers } from "./controller.js";
import path from "path";

export function registerRoutes(app, { pool, webRoutes, publicDir, upload }) {
  const controllers = createControllers({ pool, publicDir });

  // ----------------------------------------------------
  // Admin Dashboard Routes (HTML pages in /public)
  // ----------------------------------------------------

  for (const routes of webRoutes) {
    if (routes.replace(".html", "").includes("index")) {
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
      app.get(`/${routes.replace(".html", "")}`, (req, res) => {
        return res.sendFile(path.join(publicDir, `/${routes}`));
      });
    }
  }

  // ----------------------------------------------------
  // Static Web Server for /public assets (CSS, JS, etc.)
  // (kept exactly the same behavior: app.use(express.static(publicDir));)
  // ----------------------------------------------------
  app.use(express.static(publicDir));

  // ----------------------------------------------------
  // Route: POST /detect
  // (same as before, just calls controller)
  // ----------------------------------------------------
  app.post("/api/detect", upload.single("frame"), controllers.detectHandler);

  // ----------------------------------------------------
  // CRUD API routes (upsert, delete, get all)
  // ----------------------------------------------------

  // IdentificationType
  app.get("/api/identification-types", controllers.getIdentificationTypes);
  app.post("/api/identification-types", controllers.upsertIdentificationType);
  app.delete(
    "/api/identification-types/:id",
    controllers.deleteIdentificationType
  );

  // RoleType
  app.get("/api/role-types", controllers.getRoleTypes);
  app.post("/api/role-types", controllers.upsertRoleType);
  app.delete("/api/role-types/:id", controllers.deleteRoleType);

  // Drivers
  app.get("/api/drivers", controllers.getDrivers);
  app.post("/api/drivers", controllers.upsertDriver);
  app.delete("/api/drivers/:id", controllers.deleteDriver);

  // User
  app.get("/api/users", controllers.getUsers);
  app.post("/api/users", controllers.upsertUser);
  app.delete("/api/users/:id", controllers.deleteUser);

  // Vehicles
  app.get("/api/vehicles", controllers.getVehicles);
  app.post("/api/vehicles", controllers.upsertVehicle);
  app.delete("/api/vehicles/:id", controllers.deleteVehicle);
}
