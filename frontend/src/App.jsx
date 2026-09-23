import React, { useEffect, useMemo, useState } from "react";
import {
  addInventoryItem,
  createPayment,
  createReservation,
  getInventory,
  loginPharmacy,
  registerPharmacy,
  searchStock,
  updateInventoryItem
} from "./api.js";

import MapView from "./MapView.jsx";

const AREAS = [
  "Nairobi CBD",
  "Westlands",
  "Eastleigh",
  "Kisumu",
  "Mombasa"
];

const pageText = {
  search: [
    "Find medicine in stock near you",
    "Search by drug and location, compare nearby pharmacies, and reserve stock to pick up and pay in person."
  ],

  dashboard: [
    "Manage pharmacy stock",
    "Keep inventory current so patients stop travelling to pharmacies that are already out of stock."
  ],

  payments: [
    "Handle pharmacy billing",
    "Patients never pay through PharmaLink. Pharmacy subscriptions and sponsored listings are the only charges here."
  ],

  privacy: [
    "Privacy policy",
    "How PharmaLink collects, uses, and protects information for patients and pharmacies."
  ]
};

function stockLabel(quantity) {
  if (quantity <= 0) return "Out of stock";
  if (quantity < 10) return "Low stock";
  return "In stock";
}

function stockClass(quantity) {
  if (quantity <= 0) return "out";
  if (quantity < 10) return "low";
  return "good";
}

export default function App() {
  const [section, setSection] = useState("search");

  // Search
  const [medicine, setMedicine] = useState("Amoxicillin");
  const [area, setArea] = useState("Nairobi CBD");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Authentication
  const [activePharmacy, setActivePharmacy] = useState(null);
  const [authMode, setAuthMode] = useState("login");

  const [authForm, setAuthForm] = useState({
    name: "",
    area: "Nairobi CBD",
    password: ""
  });

  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Inventory
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [editDraft, setEditDraft] = useState({
    quantity: "",
    price: "",
    status: "In stock"
  });

  // Payments
  const [payments, setPayments] = useState([]);

  // Reservations
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [patientInitials, setPatientInitials] = useState("");

  const [pickupWindow, setPickupWindow] = useState(
    "Today, 2:00 PM - 4:00 PM"
  );

  // Notifications
  const [toast, setToast] = useState("");

  /*
  ============================================================
  SEARCH STATISTICS
  ============================================================
  */

  const availableMatches = useMemo(() => {
    return results.filter((item) => Number(item.quantity) > 0).length;
  }, [results]);

  const lowestPrice = useMemo(() => {
    const inStock = results.filter(
      (item) => Number(item.quantity) > 0
    );

    if (inStock.length === 0) return null;

    return Math.min(
      ...inStock.map((item) => Number(item.price))
    );
  }, [results]);

  const fastestEta = useMemo(() => {
    const inStock = results.filter(
      (item) =>
        Number(item.quantity) > 0 &&
        item.eta
    );

    if (inStock.length === 0) return null;

    const minutes = inStock
      .map((item) =>
        parseInt(
          String(item.eta).match(/\d+/)?.[0],
          10
        )
      )
      .filter((number) => !Number.isNaN(number));

    if (minutes.length === 0) return null;

    return Math.min(...minutes);
  }, [results]);

  /*
  ============================================================
  LOAD INVENTORY FROM MYSQL
  ============================================================
  */

  useEffect(() => {
    if (!activePharmacy) {
      setInventory([]);
      return;
    }

    let cancelled = false;

    async function loadInventory() {
      setInventoryLoading(true);

      try {
        const data = await getInventory(activePharmacy.id);

        if (!cancelled) {
          setInventory(data);
        }
      } catch (error) {
        console.error("Failed to load inventory:", error);

        if (!cancelled) {
          setInventory([]);
          setToast("Could not load inventory from the database.");
        }
      } finally {
        if (!cancelled) {
          setInventoryLoading(false);
        }
      }
    }

    loadInventory();

    return () => {
      cancelled = true;
    };
  }, [activePharmacy]);

  /*
  ============================================================
  REMOVE TOAST AFTER 2.8 SECONDS
  ============================================================
  */

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => {
      setToast("");
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [toast]);

  /*
  ============================================================
  SEARCH DATABASE
  ============================================================
  */

  async function handleSearch(event) {
    event.preventDefault();

    if (!medicine.trim()) {
      setToast("Enter a medicine name.");
      return;
    }

    setSearching(true);
    setSelectedPharmacy(null);

    try {
      const apiResults = await searchStock(
        medicine.trim(),
        area
      );

      setResults(apiResults);

      if (apiResults.length === 0) {
        setToast(
          `No live stock found for ${medicine} in ${area}.`
        );
      } else {
        setToast(
          `Found ${apiResults.length} live stock result(s).`
        );
      }
    } catch (error) {
      console.error("Search failed:", error);

      setResults([]);

      setToast(
        error.message ||
          "Could not search stock. Check that the backend is running."
      );
    } finally {
      setSearching(false);
    }
  }

  /*
  ============================================================
  LOGIN / REGISTER
  ============================================================
  */

  async function handleAuthSubmit(event) {
    event.preventDefault();

    setAuthError("");
    setAuthSubmitting(true);

    const payload = {
      name: authForm.name.trim(),
      area: authForm.area,
      password: authForm.password
    };

    try {
      let pharmacy;

      if (authMode === "login") {
        pharmacy = await loginPharmacy({
          name: payload.name,
          password: payload.password
        });
      } else {
        pharmacy = await registerPharmacy(payload);
      }

      setActivePharmacy(pharmacy);

      setToast(
        authMode === "login"
          ? `Logged in as ${pharmacy.name}.`
          : `${pharmacy.name} registered successfully.`
      );

      setAuthForm({
        name: "",
        area: "Nairobi CBD",
        password: ""
      });
    } catch (error) {
      console.error("Authentication failed:", error);

      setAuthError(
        error.message ||
          "Unable to communicate with the server."
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  /*
  ============================================================
  LOGOUT / SWITCH PHARMACY
  ============================================================
  */

  function handleLogout() {
    setActivePharmacy(null);
    setInventory([]);
    setEditingId(null);
    setAuthError("");

    setAuthForm({
      name: "",
      area: "Nairobi CBD",
      password: ""
    });

    setToast("Logged out.");
  }

  /*
  ============================================================
  ADD INVENTORY
  ============================================================
  */

  async function handleAddInventory(event) {
    event.preventDefault();

    if (!activePharmacy) {
      setToast("Please log in first.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const item = {
      medicine: String(form.get("medicine") || "").trim(),
      quantity: Number(form.get("quantity")),
      price: Number(form.get("price")),
      status: form.get("status"),
      pharmacy_id: activePharmacy.id
    };

    if (!item.medicine) {
      setToast("Medicine name is required.");
      return;
    }

    if (
      Number.isNaN(item.quantity) ||
      item.quantity < 0
    ) {
      setToast("Enter a valid quantity.");
      return;
    }

    if (
      Number.isNaN(item.price) ||
      item.price < 0
    ) {
      setToast("Enter a valid price.");
      return;
    }

    try {
      const saved = await addInventoryItem(item);

      setInventory((current) => [
        saved,
        ...current
      ]);

      formElement.reset();

      setToast(
        `${saved.medicine || item.medicine} saved to the database.`
      );
    } catch (error) {
      console.error(
        "Failed to add inventory:",
        error
      );

      setToast(
        error.message ||
          "Could not save inventory to the database."
      );
    }
  }

  /*
  ============================================================
  EDIT INVENTORY
  ============================================================
  */

  function startEditingItem(item) {
    setEditingId(item.id);

    setEditDraft({
      quantity: item.quantity,
      price: item.price,
      status:
        item.status ||
        stockLabel(Number(item.quantity))
    });
  }

  function cancelEditingItem() {
    setEditingId(null);
  }

  async function saveEditingItem(id) {
    if (!activePharmacy) {
      setToast("Please log in first.");
      return;
    }

    const payload = {
      quantity: Number(editDraft.quantity),
      price: Number(editDraft.price),
      status: editDraft.status,
      pharmacy_id: activePharmacy.id
    };

    if (
      Number.isNaN(payload.quantity) ||
      payload.quantity < 0
    ) {
      setToast("Enter a valid quantity.");
      return;
    }

    if (
      Number.isNaN(payload.price) ||
      payload.price < 0
    ) {
      setToast("Enter a valid price.");
      return;
    }

    try {
      const saved = await updateInventoryItem(
        id,
        payload
      );

      setInventory((current) =>
        current.map((row) =>
          row.id === id ? saved : row
        )
      );

      setEditingId(null);

      setToast("Stock updated in the database.");
    } catch (error) {
      console.error(
        "Failed to update inventory:",
        error
      );

      setToast(
        error.message ||
          "Could not update stock."
      );
    }
  }

  /*
  ============================================================
  RESERVATIONS
  ============================================================
  */

  async function handleReserve() {
    if (!selectedPharmacy) {
      setToast(
        "Choose a pharmacy before reserving stock."
      );
      return;
    }

    const code = `PL-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const reservation = {
      pharmacy_id: selectedPharmacy.id,
      medicine: selectedPharmacy.medicine,
      patient_initials:
        patientInitials.trim().toUpperCase() ||
        "ANON",
      pickup_window: pickupWindow,
      reservation_code: code
    };

    try {
      const saved = await createReservation(
        reservation
      );

      setToast(
        `Reservation ${
          saved.reservation_code || code
        } created successfully.`
      );

      setPatientInitials("");
    } catch (error) {
      console.error(
        "Reservation failed:",
        error
      );

      setToast(
        error.message ||
          "Could not create reservation."
      );
    }
  }

  /*
  ============================================================
  PAYMENTS
  ============================================================
  */

  async function handlePayment(type, amount) {
    const payment = {
      type,
      amount,
      status: "Confirmed"
    };

    try {
      const saved = await createPayment(payment);

      setPayments((current) => [
        saved,
        ...current
      ]);

      setToast(`${type} recorded.`);
    } catch (error) {
      console.error(
        "Payment could not be recorded:",
        error
      );

      setToast(
        error.message ||
          "Could not record payment."
      );
    }
  }

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <div className="app-shell">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">
          <div className="brand-mark">+</div>

          <div>
            <h1>PharmaLink</h1>
            <span>Medicine stock finder</span>
          </div>
        </div>

        <nav
          className="nav"
          aria-label="Main navigation"
        >
          {[
            ["search", "Search"],
            ["dashboard", "Pharmacy"],
            ["payments", "Payments"],
            ["privacy", "Privacy"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={
                section === key ? "active" : ""
              }
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          Search data is anonymized,
          reservations expire automatically,
          and pharmacies only see what they
          need to prepare the order.
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main>

        <header className="topbar">
          <div>
            <h2>{pageText[section][0]}</h2>
            <p>{pageText[section][1]}</p>
          </div>

          <span className="status-pill">
            Live pharmacy network
          </span>
        </header>

        {/* ==================================================
            SEARCH PAGE
        ================================================== */}

        {section === "search" && (
          <section>

            <div className="search-panel">

              <div className="search-copy">

                <form
                  className="search-form"
                  onSubmit={handleSearch}
                >

                  <label>
                    Medicine

                    <input
                      value={medicine}
                      onChange={(event) =>
                        setMedicine(
                          event.target.value
                        )
                      }
                      list="drugList"
                      required
                    />
                  </label>

                  <label>
                    Location

                    <select
                      value={area}
                      onChange={(event) =>
                        setArea(
                          event.target.value
                        )
                      }
                    >
                      {AREAS.map((option) => (
                        <option key={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={searching}
                  >
                    {searching
                      ? "Searching..."
                      : "Search stock"}
                  </button>
                </form>

                <datalist id="drugList">
                  <option value="Amoxicillin" />
                  <option value="Insulin glargine" />
                  <option value="Salbutamol inhaler" />
                  <option value="Metformin" />
                  <option value="Losartan" />
                </datalist>

                <div className="stats">

                  <div className="stat">
                    <strong>
                      {availableMatches}
                    </strong>
                    <span>stock matches</span>
                  </div>

                  <div className="stat">
                    <strong>
                      {fastestEta !== null
                        ? `${fastestEta} min`
                        : "—"}
                    </strong>
                    <span>fastest pickup</span>
                  </div>

                  <div className="stat">
                    <strong>
                      {lowestPrice !== null
                        ? `KSh ${lowestPrice}`
                        : "—"}
                    </strong>
                    <span>lowest price</span>
                  </div>

                  <div className="stat">
                    <strong>99%</strong>
                    <span>private searches</span>
                  </div>

                </div>
              </div>

              <div className="visual">
                <div className="visual-device">

                  <MapView results={results} />

                  <p className="tiny">
                    Live pharmacy stock map with
                    distance, price, and verified
                    availability.
                  </p>

                </div>
              </div>
            </div>

            <div className="content-grid">

              <div className="results">

                {results.length === 0 ? (

                  <article className="result-card">
                    <div>
                      <h3>No stock results</h3>

                      <p className="tiny">
                        Search for a medicine and
                        location to see live MySQL
                        inventory.
                      </p>
                    </div>
                  </article>

                ) : (

                  results.map((item) => (

                    <article
                      className="result-card"
                      key={`${item.id}-${item.medicine}`}
                    >

                      <div>

                        <h3>{item.name}</h3>

                        <p className="tiny">
                          {item.area}
                          {" - "}
                          {item.distance}
                          {" away - Pickup in "}
                          {item.eta}
                        </p>

                        <div className="result-meta">

                          <span
                            className={`tag ${stockClass(
                              Number(item.quantity)
                            )}`}
                          >
                            {stockLabel(
                              Number(item.quantity)
                            )}
                            : {item.quantity}
                          </span>

                          <span className="tag blue">
                            KSh {item.price}
                          </span>

                          <span className="tag">
                            {item.verified
                              ? "Verified pharmacy"
                              : "Not verified"}
                          </span>

                        </div>

                        <div className="result-actions">

                          <button
                            className="secondary-btn"
                            onClick={() =>
                              setSelectedPharmacy(item)
                            }
                          >
                            Reserve
                          </button>

                          <button
                            className="ghost-btn"
                            onClick={() =>
                              setToast(
                                `Call request prepared for ${item.name}.`
                              )
                            }
                          >
                            Call
                          </button>

                          <button
                            className="ghost-btn"
                            onClick={() => {

                              if (
                                item.latitude &&
                                item.longitude
                              ) {

                                window.open(
                                  `https://www.openstreetmap.org/directions?to=${item.latitude}%2C${item.longitude}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                );

                              } else {

                                setToast(
                                  `No coordinates on file for ${item.name}.`
                                );

                              }
                            }}
                          >
                            Directions
                          </button>

                        </div>
                      </div>

                      <strong>
                        KSh {item.price}
                      </strong>

                    </article>
                  ))
                )}

              </div>

              {/* RESERVATION PANEL */}

              <aside className="side-panel">

                <h3>Reserve medicine</h3>

                <label>
                  Selected pharmacy

                  <input
                    value={
                      selectedPharmacy?.name ||
                      "Choose a result"
                    }
                    readOnly
                  />
                </label>

                <label>
                  Patient initials

                  <input
                    value={patientInitials}
                    onChange={(event) =>
                      setPatientInitials(
                        event.target.value
                      )
                    }
                    maxLength="4"
                    placeholder="e.g. MM"
                  />
                </label>

                <label>
                  Pickup window

                  <select
                    value={pickupWindow}
                    onChange={(event) =>
                      setPickupWindow(
                        event.target.value
                      )
                    }
                  >
                    <option>
                      Today, 2:00 PM - 4:00 PM
                    </option>

                    <option>
                      Today, 4:00 PM - 6:00 PM
                    </option>

                    <option>
                      Tomorrow morning
                    </option>
                  </select>
                </label>

                <button
                  className="primary-btn"
                  onClick={handleReserve}
                >
                  Reserve stock
                </button>

                <p className="tiny">
                  Only initials and reservation
                  code are shared with the pharmacy.
                </p>

              </aside>
            </div>

          </section>
        )}

        {/* ==================================================
            LOGIN / REGISTER
        ================================================== */}

        {section === "dashboard" &&
          !activePharmacy && (

          <section className="panel">

            <div className="toolbar">

              <h3>
                {authMode === "login"
                  ? "Pharmacy login"
                  : "Register your pharmacy"}
              </h3>

              <div className="result-actions">

                <button
                  className={
                    authMode === "login"
                      ? "secondary-btn"
                      : "ghost-btn"
                  }
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                >
                  Log in
                </button>

                <button
                  className={
                    authMode === "register"
                      ? "secondary-btn"
                      : "ghost-btn"
                  }
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError("");
                  }}
                >
                  Register
                </button>

              </div>
            </div>

            <form
              className="auth-form"
              onSubmit={handleAuthSubmit}
            >

              <label>
                Pharmacy name

                <input
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm((form) => ({
                      ...form,
                      name: event.target.value
                    }))
                  }
                  placeholder="e.g. AfyaCare Pharmacy"
                  required
                />
              </label>

              {authMode === "register" && (

                <label>
                  Area

                  <select
                    value={authForm.area}
                    onChange={(event) =>
                      setAuthForm((form) => ({
                        ...form,
                        area: event.target.value
                      }))
                    }
                  >
                    {AREAS.map((option) => (
                      <option key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

              )}

              <label>
                Password

                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((form) => ({
                      ...form,
                      password:
                        event.target.value
                    }))
                  }
                  placeholder={
                    authMode === "register"
                      ? "At least 6 characters"
                      : "Password"
                  }
                  minLength={
                    authMode === "register"
                      ? 6
                      : undefined
                  }
                  required
                />
              </label>

              <button
                className="primary-btn"
                type="submit"
                disabled={authSubmitting}
              >
                {authSubmitting
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>

            </form>

            {authError && (
              <p
                className="tiny"
                style={{
                  color: "var(--red)",
                  marginTop: 10
                }}
              >
                {authError}
              </p>
            )}

          </section>
        )}

        {/* ==================================================
            PHARMACY INVENTORY
        ================================================== */}

        {section === "dashboard" &&
          activePharmacy && (

          <section className="panel">

            <div className="toolbar">

              <div>
                <h3>
                  Pharmacy inventory dashboard
                </h3>

                <p className="tiny">
                  Logged in as{" "}
                  <strong>
                    {activePharmacy.name}
                  </strong>{" "}
                  ({activePharmacy.area}).
                </p>
              </div>

              <button
                className="ghost-btn"
                onClick={handleLogout}
              >
                Log out
              </button>

            </div>

            <div className="table-wrap">

              <table>

                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Stock</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Last update</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>

                  {inventoryLoading ? (

                    <tr>
                      <td
                        colSpan="6"
                        className="tiny"
                      >
                        Loading inventory...
                      </td>
                    </tr>

                  ) : inventory.length === 0 ? (

                    <tr>
                      <td
                        colSpan="6"
                        className="tiny"
                      >
                        No stock listed yet —
                        add your first item below.
                      </td>
                    </tr>

                  ) : (

                    inventory.map((item) => (

                      <tr key={item.id}>

                        <td>
                          {item.medicine}
                        </td>

                        {editingId === item.id ? (
                          <>

                            <td>
                              <input
                                type="number"
                                min="0"
                                value={
                                  editDraft.quantity
                                }
                                onChange={(event) =>
                                  setEditDraft(
                                    (draft) => ({
                                      ...draft,
                                      quantity:
                                        event.target
                                          .value
                                    })
                                  )
                                }
                              />
                            </td>

                            <td>
                              <input
                                type="number"
                                min="0"
                                value={
                                  editDraft.price
                                }
                                onChange={(event) =>
                                  setEditDraft(
                                    (draft) => ({
                                      ...draft,
                                      price:
                                        event.target
                                          .value
                                    })
                                  )
                                }
                              />
                            </td>

                            <td>
                              <select
                                value={
                                  editDraft.status
                                }
                                onChange={(event) =>
                                  setEditDraft(
                                    (draft) => ({
                                      ...draft,
                                      status:
                                        event.target
                                          .value
                                    })
                                  )
                                }
                              >
                                <option>
                                  In stock
                                </option>

                                <option>
                                  Low stock
                                </option>

                                <option>
                                  Out of stock
                                </option>
                              </select>
                            </td>

                            <td>
                              {item.updated_at ||
                                "Just now"}
                            </td>

                            <td className="result-actions">

                              <button
                                className="secondary-btn"
                                onClick={() =>
                                  saveEditingItem(
                                    item.id
                                  )
                                }
                              >
                                Save
                              </button>

                              <button
                                className="ghost-btn"
                                onClick={
                                  cancelEditingItem
                                }
                              >
                                Cancel
                              </button>

                            </td>

                          </>
                        ) : (
                          <>

                            <td>
                              {item.quantity}
                            </td>

                            <td>
                              KSh {item.price}
                            </td>

                            <td>

                              <span
                                className={`tag ${stockClass(
                                  Number(
                                    item.quantity
                                  )
                                )}`}
                              >
                                {item.status ||
                                  stockLabel(
                                    Number(
                                      item.quantity
                                    )
                                  )}
                              </span>

                            </td>

                            <td>
                              {item.updated_at ||
                                "Just now"}
                            </td>

                            <td>

                              <button
                                className="ghost-btn"
                                onClick={() =>
                                  startEditingItem(
                                    item
                                  )
                                }
                              >
                                Edit
                              </button>

                            </td>

                          </>
                        )}

                      </tr>
                    ))
                  )}

                </tbody>

              </table>

            </div>

            {/* ADD MEDICINE */}

            <form
              className="inventory-form"
              onSubmit={handleAddInventory}
            >

              <label>
                Medicine

                <input
                  name="medicine"
                  placeholder="Medicine name"
                  required
                />
              </label>

              <label>
                Quantity

                <input
                  name="quantity"
                  type="number"
                  min="0"
                  defaultValue="20"
                  required
                />
              </label>

              <label>
                Price

                <input
                  name="price"
                  type="number"
                  min="0"
                  defaultValue="250"
                  required
                />
              </label>

              <label>
                Status

                <select name="status">
                  <option>In stock</option>
                  <option>Low stock</option>
                  <option>Out of stock</option>
                </select>
              </label>

              <button
                className="primary-btn"
                type="submit"
              >
                Add item
              </button>

            </form>

          </section>
        )}

        {/* ==================================================
            PAYMENTS
        ================================================== */}

        {section === "payments" && (

          <section className="panel">

            <h3>Payments and revenue</h3>

            <div className="payment-grid">

              <PaymentTile
                title="Pharmacy subscription"
                text="Pharmacies pay a monthly listing fee for dashboard access."
                button="Bill pharmacy"
                onClick={() =>
                  handlePayment(
                    "Monthly pharmacy subscription",
                    1500
                  )
                }
              />

              <PaymentTile
                title="Sponsored listing"
                text="Sponsored results are labelled and never override stock accuracy."
                button="Create invoice"
                onClick={() =>
                  handlePayment(
                    "Sponsored listing",
                    750
                  )
                }
              />

            </div>

            <div className="table-wrap">

              <table>

                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>

                  {payments.length === 0 ? (

                    <tr>
                      <td
                        colSpan="4"
                        className="tiny"
                      >
                        No payments recorded
                        during this session.
                      </td>
                    </tr>

                  ) : (

                    payments.map((payment) => (

                      <tr key={payment.id}>

                        <td>
                          {payment.time}
                        </td>

                        <td>
                          {payment.type}
                        </td>

                        <td>
                          KSh {payment.amount}
                        </td>

                        <td>
                          <span className="tag good">
                            {payment.status}
                          </span>
                        </td>

                      </tr>

                    ))
                  )}

                </tbody>

              </table>

            </div>

          </section>
        )}

        {/* ==================================================
            PRIVACY
        ================================================== */}

        {section === "privacy" && (

          <section className="panel policy">

            <p className="tiny">
              Last updated: July 2026
            </p>

            <PolicySection title="1. Introduction">
              This Privacy Policy explains how
              PharmaLink ("we," "us") collects,
              uses, and protects information when
              patients search for medicine and
              when pharmacies manage their
              listings on the platform.
            </PolicySection>

            <PolicySection title="2. Information We Collect">

              <strong>Patients:</strong> we collect
              the medicine name and area you search
              for.

              <br />
              <br />

              <strong>Pharmacies:</strong> we
              collect pharmacy name, area and a
              password. Passwords are stored as
              cryptographic hashes rather than
              plain text.

            </PolicySection>

            <PolicySection title="3. How We Use Information">
              Search data is used to return live
              stock results. Pharmacy account data
              is used for login and inventory
              management.
            </PolicySection>

            <PolicySection title="4. Reservations">
              Reservation information is used to
              allow pharmacies to prepare medicine
              for pickup.
            </PolicySection>

            <PolicySection title="5. Payments">
              Patients pay pharmacies directly.
              PharmaLink records pharmacy
              subscription and sponsored listing
              charges.
            </PolicySection>

            <PolicySection title="6. Security">
              Pharmacy passwords are hashed and
              database queries are parameterized.
            </PolicySection>

          </section>
        )}

      </main>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

    </div>
  );
}

/*
============================================================
SMALL REUSABLE COMPONENTS
============================================================
*/

function PolicySection({ title, children }) {
  return (
    <div className="policy-section">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}

function PaymentTile({
  title,
  text,
  button,
  onClick
}) {
  return (
    <div className="info-tile">

      <strong>{title}</strong>

      <p className="tiny">
        {text}
      </p>

      <button
        className="primary-btn"
        onClick={onClick}
      >
        {button}
      </button>

    </div>
  );
}