import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mysql from "mysql2/promise";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());
app.use(express.json());

/* =========================================================
   DATABASE CONNECTION
========================================================= */

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pharmalink",
  waitForConnections: true,
  connectionLimit: 10
});

/* =========================================================
   AREA COORDINATES
========================================================= */

/*
  Registration only collects an area rather than exact
  coordinates.

  New pharmacies are therefore placed near the centre of
  the selected area with a small random offset.
*/

const AREA_COORDINATES = {
  "Nairobi CBD": [-1.2864, 36.8172],
  "Westlands": [-1.2647, 36.8030],
  "Eastleigh": [-1.2740, 36.8460],
  "Kisumu": [-0.0917, 34.7680],
  "Mombasa": [-4.0526, 39.6650]
};

function coordinatesForArea(area) {
  const [lat, lng] =
    AREA_COORDINATES[area] ||
    AREA_COORDINATES["Nairobi CBD"];

  const jitter = () => (Math.random() - 0.5) * 0.01;

  return [
    lat + jitter(),
    lng + jitter()
  ];
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "PharmaLink API"
  });
});

/* =========================================================
   WEEK 5 GET ENDPOINT 1
   GET /api/pharmacies
========================================================= */

app.get("/api/pharmacies", async (req, res, next) => {
  try {
    const { verified } = req.query;

    let sql = `
      SELECT
        name,
        area,
        distance,
        eta,
        verified
      FROM pharmacies
    `;

    const params = [];

    /*
      verified is optional.

      Examples:

      /api/pharmacies
      /api/pharmacies?verified=true
      /api/pharmacies?verified=false
    */

    if (verified !== undefined) {
      if (verified !== "true" && verified !== "false") {
        return res.status(400).json({
          error: "verified must be true or false"
        });
      }

      sql += " WHERE verified = ?";
      params.push(verified === "true" ? 1 : 0);
    }

    sql += " ORDER BY name";

    const [rows] = await pool.query(sql, params);

    /*
      Shape database rows so that they match
      the OpenAPI Pharmacy schema.

      Database:
        area       -> API: location
        verified 0/1 -> API: boolean

      distance is currently stored as VARCHAR in the DB.
      If it contains a valid number we return that number.
      Otherwise we use 0 until distance calculation is
      redesigned.
    */

    const pharmacies = rows.map((row) => {
      const parsedDistance = Number.parseFloat(row.distance);

      return {
        name: row.name,
        location: row.area,
        distance: Number.isFinite(parsedDistance)
          ? parsedDistance
          : 0,
        eta: row.eta,
        verified: Boolean(row.verified)
      };
    });

    return res.status(200).json(pharmacies);

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   WEEK 5 GET ENDPOINT 2
   GET /api/inventory
========================================================= */

app.get("/api/inventory", async (req, res, next) => {
  try {
    const pharmacyId = req.query.pharmacy_id;

    /*
      pharmacy_id is required according to
      the OpenAPI contract.
    */

    if (!pharmacyId) {
      return res.status(400).json({
        error: "pharmacy_id is required"
      });
    }

    /*
      pharmacy_id should represent a positive integer.
    */

    const parsedPharmacyId = Number(pharmacyId);

    if (
      !Number.isInteger(parsedPharmacyId) ||
      parsedPharmacyId <= 0
    ) {
      return res.status(400).json({
        error: "pharmacy_id must be a valid positive integer"
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        medicine,
        quantity,
        price
      FROM inventory
      WHERE pharmacy_id = ?
      ORDER BY updated_at DESC
      `,
      [parsedPharmacyId]
    );

    /*
      Shape response according to InventoryItem schema.

      Do NOT expose:
        id
        pharmacy_id
        status
        updated_at
    */

    const inventory = rows.map((row) => ({
      medicine: row.medicine,
      quantity: Number(row.quantity),
      price: Number(row.price)
    }));

    return res.status(200).json(inventory);

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   WEEK 5 GET ENDPOINT 3
   GET /api/stock/search
========================================================= */

app.get("/api/stock/search", async (req, res, next) => {
  try {
    const { medicine, location } = req.query;

    /*
      Both parameters are required according to
      the OpenAPI contract.
    */

    if (!medicine || !location) {
      return res.status(400).json({
        error: "medicine and location are required"
      });
    }

    /*
      JOIN inventory with pharmacies.

      inventory.pharmacy_id
               ↓
      pharmacies.id
    */

    const [rows] = await pool.query(
      `
      SELECT
        p.id AS pharmacy_id,
        p.name,
        p.area AS location,
        p.distance,
        i.quantity,
        i.price
      FROM inventory i
      JOIN pharmacies p
        ON p.id = i.pharmacy_id
      WHERE i.medicine LIKE ?
        AND p.area LIKE ?
        AND i.quantity > 0
      ORDER BY i.quantity DESC, i.price ASC
      `,
      [
        `%${medicine}%`,
        `%${location}%`
      ]
    );

    /*
      Shape response according to
      PharmacyStockSearchResult.
    */

    const results = rows.map((row) => {
      const parsedDistance = Number.parseFloat(row.distance);

      return {
        pharmacy_id: String(row.pharmacy_id),
        name: row.name,
        location: row.location,
        distance: Number.isFinite(parsedDistance)
          ? parsedDistance
          : 0
      };
    });

    return res.status(200).json(results);

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   AUTH - REGISTER
========================================================= */

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, area, password } = req.body;

    if (!name || !area || !password) {
      return res.status(400).json({
        message:
          "Pharmacy name, area, and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters"
      });
    }

    const [existing] = await pool.query(
      `
      SELECT id
      FROM pharmacies
      WHERE name = ?
      `,
      [name]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message:
          "A pharmacy with that name is already registered"
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      10
    );

    const [lat, lng] =
      coordinatesForArea(area);

    const [result] = await pool.query(
      `
      INSERT INTO pharmacies
      (
        name,
        password_hash,
        area,
        distance,
        eta,
        latitude,
        longitude,
        verified
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
      `,
      [
        name,
        passwordHash,
        area,
        "Distance varies",
        "Varies by pickup",
        lat,
        lng
      ]
    );

    return res.status(201).json({
      id: result.insertId,
      name,
      area,
      verified: false
    });

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   AUTH - LOGIN
========================================================= */

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        message:
          "Pharmacy name and password are required"
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        area,
        verified,
        password_hash
      FROM pharmacies
      WHERE name = ?
      `,
      [name]
    );

    const pharmacy = rows[0];

    const passwordMatches = pharmacy
      ? await bcrypt.compare(
          password,
          pharmacy.password_hash
        )
      : false;

    if (!pharmacy || !passwordMatches) {
      return res.status(401).json({
        message:
          "Incorrect pharmacy name or password"
      });
    }

    return res.status(200).json({
      id: pharmacy.id,
      name: pharmacy.name,
      area: pharmacy.area,
      verified: Boolean(pharmacy.verified)
    });

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CREATE INVENTORY ITEM
========================================================= */

app.post("/api/inventory", async (req, res, next) => {
  try {
    const {
      medicine,
      quantity,
      price,
      status
    } = req.body;

    const pharmacyId =
      req.body.pharmacy_id || 1;

    if (
      !medicine ||
      quantity === undefined ||
      price === undefined
    ) {
      return res.status(400).json({
        message:
          "medicine, quantity and price are required"
      });
    }

    const finalStatus =
      status || "In stock";

    const [result] = await pool.query(
      `
      INSERT INTO inventory
      (
        pharmacy_id,
        medicine,
        quantity,
        price,
        status
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        pharmacyId,
        medicine,
        quantity,
        price,
        finalStatus
      ]
    );

    return res.status(201).json({
      id: result.insertId,
      pharmacy_id: pharmacyId,
      medicine,
      quantity,
      price,
      status: finalStatus,
      updated_at: "Just now"
    });

  } catch (error) {
    next(error);
  }
});

/* =========================================================
   UPDATE INVENTORY ITEM
========================================================= */

app.patch(
  "/api/inventory/:id",
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const {
        quantity,
        price,
        status,
        pharmacy_id: pharmacyId
      } = req.body;

      if (!pharmacyId) {
        return res.status(400).json({
          message: "pharmacy_id is required"
        });
      }

      const [result] = await pool.query(
        `
        UPDATE inventory
        SET
          quantity = ?,
          price = ?,
          status = ?
        WHERE id = ?
          AND pharmacy_id = ?
        `,
        [
          quantity,
          price,
          status,
          id,
          pharmacyId
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message:
            "Inventory item not found for this pharmacy"
        });
      }

      const [rows] = await pool.query(
        `
        SELECT
          id,
          pharmacy_id,
          medicine,
          quantity,
          price,
          status,
          updated_at
        FROM inventory
        WHERE id = ?
        `,
        [id]
      );

      return res.status(200).json(rows[0]);

    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CREATE RESERVATION
========================================================= */

app.post(
  "/api/reservations",
  async (req, res, next) => {
    try {
      const {
        pharmacy_id,
        medicine,
        patient_initials,
        pickup_window,
        reservation_code
      } = req.body;

      const [result] = await pool.query(
        `
        INSERT INTO reservations
        (
          pharmacy_id,
          medicine,
          patient_initials,
          pickup_window,
          reservation_code
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          pharmacy_id,
          medicine,
          patient_initials,
          pickup_window,
          reservation_code
        ]
      );

      return res.status(201).json({
        id: result.insertId,
        reservation_code,
        status: "Reserved"
      });

    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CREATE PAYMENT
========================================================= */

app.post(
  "/api/payments",
  async (req, res, next) => {
    try {
      const {
        type,
        amount,
        status
      } = req.body;

      const finalStatus =
        status || "Confirmed";

      const [result] = await pool.query(
        `
        INSERT INTO payments
        (
          type,
          amount,
          status
        )
        VALUES (?, ?, ?)
        `,
        [
          type,
          amount,
          finalStatus
        ]
      );

      return res.status(201).json({
        id: result.insertId,

        time: new Date().toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        ),

        type,
        amount,
        status: finalStatus
      });

    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint not found"
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  res.status(500).json({
    message: "Server error",
    detail: error.message
  });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(port, () => {
  console.log(
    `PharmaLink API running on http://localhost:${port}`
  );
});