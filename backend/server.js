import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mysql from "mysql2/promise";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pharmalink",
  waitForConnections: true,
  connectionLimit: 10
});

/*Registration only collects an area (not exact coordinates), so new pharmacies are placed near their area's centre with a small random
 offset to avoid every pharmacy in the same area stacking on one pin.*/
const AREA_COORDINATES = {
  "Nairobi CBD": [-1.2864, 36.8172],
  "Westlands": [-1.2647, 36.8030],
  "Eastleigh": [-1.2740, 36.8460],
  "Kisumu": [-0.0917, 34.7680],
  "Mombasa": [-4.0526, 39.6650]
};

function coordinatesForArea(area) {
  const [lat, lng] = AREA_COORDINATES[area] || AREA_COORDINATES["Nairobi CBD"];
  const jitter = () => (Math.random() - 0.5) * 0.01;
  return [lat + jitter(), lng + jitter()];
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "PharmaLink API" });
});

app.get("/api/stock/search", async (req, res, next) => {
  try {
    const medicine = `%${req.query.medicine || ""}%`;
    const area = `%${req.query.area || ""}%`;
    const [rows] = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.area,
        p.distance,
        p.eta,
        p.latitude,
        p.longitude,
        p.verified,
        i.medicine,
        i.quantity,
        i.price
       FROM inventory i
       JOIN pharmacies p ON p.id = i.pharmacy_id
       WHERE i.medicine LIKE ? AND p.area LIKE ?
       ORDER BY i.quantity DESC, i.price ASC`,
      [medicine, area]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, area, password } = req.body;

    if (!name || !area || !password) {
      return res.status(400).json({ message: "Pharmacy name, area, and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const [existing] = await pool.query(`SELECT id FROM pharmacies WHERE name = ?`, [name]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "A pharmacy with that name is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [lat, lng] = coordinatesForArea(area);

    const [result] = await pool.query(
      `INSERT INTO pharmacies (name, password_hash, area, distance, eta, latitude, longitude, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [name, passwordHash, area, "Distance varies", "Varies by pickup", lat, lng]
    );

    res.status(201).json({ id: result.insertId, name, area, verified: false });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ message: "Pharmacy name and password are required" });
    }

    const [rows] = await pool.query(
      `SELECT id, name, area, verified, password_hash FROM pharmacies WHERE name = ?`,
      [name]
    );

    const pharmacy = rows[0];
    const passwordMatches = pharmacy ? await bcrypt.compare(password, pharmacy.password_hash) : false;

    if (!pharmacy || !passwordMatches) {
      return res.status(401).json({ message: "Incorrect pharmacy name or password" });
    }

    res.json({ id: pharmacy.id, name: pharmacy.name, area: pharmacy.area, verified: !!pharmacy.verified });
  } catch (error) {
    next(error);
  }
});

app.get("/api/pharmacies", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, area, verified FROM pharmacies ORDER BY name`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/inventory", async (req, res, next) => {
  try {
    const pharmacyId = req.query.pharmacy_id;
    const conditions = [];
    const params = [];

    if (pharmacyId) {
      conditions.push("pharmacy_id = ?");
      params.push(pharmacyId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT id, pharmacy_id, medicine, quantity, price, status, updated_at
       FROM inventory
       ${where}
       ORDER BY updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory", async (req, res, next) => {
  try {
    const { medicine, quantity, price, status } = req.body;
    const pharmacyId = req.body.pharmacy_id || 1;
    const [result] = await pool.query(
      `INSERT INTO inventory (pharmacy_id, medicine, quantity, price, status)
       VALUES (?, ?, ?, ?, ?)`,
      [pharmacyId, medicine, quantity, price, status]
    );
    res.status(201).json({
      id: result.insertId,
      pharmacy_id: pharmacyId,
      medicine,
      quantity,
      price,
      status,
      updated_at: "Just now"
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/inventory/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, price, status, pharmacy_id: pharmacyId } = req.body;

    const [result] = await pool.query(
      `UPDATE inventory
       SET quantity = ?, price = ?, status = ?
       WHERE id = ? AND pharmacy_id = ?`,
      [quantity, price, status, id, pharmacyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Inventory item not found for this pharmacy" });
    }

    const [rows] = await pool.query(
      `SELECT id, pharmacy_id, medicine, quantity, price, status, updated_at
       FROM inventory WHERE id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reservations", async (req, res, next) => {
  try {
    const { pharmacy_id, medicine, patient_initials, pickup_window, reservation_code } = req.body;
    const [result] = await pool.query(
      `INSERT INTO reservations
       (pharmacy_id, medicine, patient_initials, pickup_window, reservation_code)
       VALUES (?, ?, ?, ?, ?)`,
      [pharmacy_id, medicine, patient_initials, pickup_window, reservation_code]
    );
    res.status(201).json({ id: result.insertId, reservation_code, status: "Reserved" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments", async (req, res, next) => {
  try {
    const { type, amount, status } = req.body;
    const [result] = await pool.query(
      `INSERT INTO payments (type, amount, status)
       VALUES (?, ?, ?)`,
      [type, amount, status || "Confirmed"]
    );
    res.status(201).json({
      id: result.insertId,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type,
      amount,
      status: status || "Confirmed"
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Server error", detail: error.message });
});

app.listen(port, () => {
  console.log(`PharmaLink API running on http://localhost:${port}`);
});