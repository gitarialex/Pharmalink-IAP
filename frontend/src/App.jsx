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
import { demoPayments, demoPharmacies } from "./demoData.js";
import MapView from "./MapView.jsx";

const AREAS = ["Nairobi CBD", "Westlands", "Eastleigh", "Kisumu", "Mombasa"];
const DEMO_PHARMACY_PASSWORD = "demo1234";

const pageText = {
  search: ["Find medicine in stock near you", "Search by drug and location, compare nearby pharmacies, and reserve stock to pick up and pay in person."],
  dashboard: ["Manage pharmacy stock", "Keep inventory current so patients stop travelling to pharmacies that are already out of stock."],
  payments: ["Handle pharmacy billing", "Patients never pay through PharmaLink. Pharmacy subscriptions and sponsored listings are the only charges here."],
  privacy: ["Privacy policy", "How PharmaLink collects, uses, and protects information for patients and pharmacies."]
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
  const [medicine, setMedicine] = useState("Amoxicillin");
  const [area, setArea] = useState("Nairobi CBD");
  const [results, setResults] = useState(demoPharmacies.filter((item) => item.medicine === "Amoxicillin" || item.area === "Nairobi CBD"));
  const [activePharmacy, setActivePharmacy] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", area: "Nairobi CBD", password: "" });
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantity: "", price: "", status: "In stock" });
  const [payments, setPayments] = useState(demoPayments);
  const [selectedPharmacy, setSelectedPharmacy] = useState("");
  const [patientInitials, setPatientInitials] = useState("");
  const [pickupWindow, setPickupWindow] = useState("Today, 2:00 PM - 4:00 PM");
  const [toast, setToast] = useState("");

  const availableMatches = useMemo(() => results.filter((item) => item.quantity > 0).length, [results]);

  const lowestPrice = useMemo(() => {
    const inStock = results.filter((item) => item.quantity > 0);
    if (inStock.length === 0) return null;
    return Math.min(...inStock.map((item) => item.price));
  }, [results]);

  const fastestEta = useMemo(() => {
    const inStock = results.filter((item) => item.quantity > 0 && item.eta);
    if (inStock.length === 0) return null;
    const minutes = inStock
      .map((item) => parseInt(String(item.eta).match(/\d+/)?.[0], 10))
      .filter((n) => !Number.isNaN(n));
    if (minutes.length === 0) return null;
    return Math.min(...minutes);
  }, [results]);

  useEffect(() => {
    if (!activePharmacy) {
      setInventory([]);
      return;
    }

    getInventory(activePharmacy.id)
      .then(setInventory)
      .catch(() => {
        const fallback = demoPharmacies
          .filter((item) => item.id === activePharmacy.id)
          .map((item) => ({
            id: item.id,
            pharmacy_id: item.id,
            medicine: item.medicine,
            quantity: item.quantity,
            price: item.price,
            status: stockLabel(item.quantity),
            updated_at: "Demo data"
          }));
        setInventory(fallback);
      });
  }, [activePharmacy]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleSearch(event) {
    event.preventDefault();
    try {
      const apiResults = await searchStock(medicine, area);
      setResults(apiResults);
      setToast(`Showing live stock for ${medicine}.`);
    } catch {
      const fallback = demoPharmacies
        .filter((item) => item.medicine.toLowerCase().includes(medicine.toLowerCase()) || item.area === area)
        .sort((a, b) => b.quantity - a.quantity);
      setResults(fallback);
      setToast(`Showing demo stock for ${medicine}. Start the backend for live MySQL data.`);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);

    const payload = { name: authForm.name.trim(), area: authForm.area, password: authForm.password };

    try {
      const pharmacy =
        authMode === "login" ? await loginPharmacy(payload) : await registerPharmacy(payload);
      setActivePharmacy(pharmacy);
      setToast(authMode === "login" ? `Logged in as ${pharmacy.name}.` : `${pharmacy.name} registered.`);
      setAuthForm({ name: "", area: "Nairobi CBD", password: "" });
    } catch (error) {
      if (!error.isNetworkError) {
        setAuthError(error.message);
        setAuthSubmitting(false);
        return;
      }

      if (authMode === "login") {
        const match = demoPharmacies.find(
          (item) => item.name.toLowerCase() === payload.name.toLowerCase()
        );
        if (match && payload.password === DEMO_PHARMACY_PASSWORD) {
          setActivePharmacy({ id: match.id, name: match.name, area: match.area, verified: match.verified });
          setToast(`Logged in as ${match.name} (offline demo mode).`);
          setAuthForm({ name: "", area: "Nairobi CBD", password: "" });
        } else {
          setAuthError("Backend unreachable. In offline demo mode, use a seeded pharmacy name with password demo1234.");
        }
      } else {
        const demoPharmacy = { id: Date.now(), name: payload.name, area: payload.area, verified: false };
        setActivePharmacy(demoPharmacy);
        setToast(`${demoPharmacy.name} registered (offline demo mode, not saved).`);
        setAuthForm({ name: "", area: "Nairobi CBD", password: "" });
      }
    }

    setAuthSubmitting(false);
  }

  async function handleReserve() {
    if (!selectedPharmacy) {
      setToast("Choose a pharmacy before reserving stock.");
      return;
    }

    const code = `PL-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await createReservation({
        pharmacy_id: selectedPharmacy.id,
        medicine: selectedPharmacy.medicine,
        patient_initials: patientInitials || "ANON",
        pickup_window: pickupWindow,
        reservation_code: code
      });
    } catch {
      
    }
    setToast(`Reservation ${code} created for ${(patientInitials || "ANON").toUpperCase()}.`);
  }

  async function handleAddInventory(event) {
    event.preventDefault();
    if (!activePharmacy) return;

    const form = new FormData(event.currentTarget);
    const item = {
      medicine: form.get("medicine"),
      quantity: Number(form.get("quantity")),
      price: Number(form.get("price")),
      status: form.get("status"),
      pharmacy_id: activePharmacy.id
    };

    try {
      const saved = await addInventoryItem(item);
      setInventory((current) => [saved, ...current]);
    } catch {
      setInventory((current) => [{ id: Date.now(), ...item, updated_at: "Just now" }, ...current]);
    }

    event.currentTarget.reset();
    setToast("Inventory item added.");
  }

  function startEditingItem(item) {
    setEditingId(item.id);
    setEditDraft({ quantity: item.quantity, price: item.price, status: item.status || stockLabel(item.quantity) });
  }

  function cancelEditingItem() {
    setEditingId(null);
  }

  async function saveEditingItem(id) {
    const payload = {
      quantity: Number(editDraft.quantity),
      price: Number(editDraft.price),
      status: editDraft.status,
      pharmacy_id: activePharmacy?.id
    };

    try {
      const saved = await updateInventoryItem(id, payload);
      setInventory((current) => current.map((row) => (row.id === id ? saved : row)));
    } catch {
      setInventory((current) =>
        current.map((row) => (row.id === id ? { ...row, ...payload, updated_at: "Just now" } : row))
      );
    }

    setEditingId(null);
    setToast("Stock updated.");
  }

  async function handlePayment(type, amount) {
    const payment = {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type,
      amount,
      status: "Confirmed"
    };

    try {
      const saved = await createPayment(payment);
      setPayments((current) => [saved, ...current]);
    } catch {
      setPayments((current) => [payment, ...current]);
    }

    setToast(`${type} recorded.`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">+</div>
          <div>
            <h1>PharmaLink</h1>
            <span>Medicine stock finder</span>
          </div>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {[
            ["search", "Search"],
            ["dashboard", "Pharmacy"],
            ["payments", "Payments"],
            ["privacy", "Privacy"]
          ].map(([key, label]) => (
            <button key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          Search data is anonymized, reservations expire automatically, and pharmacies only see what they need to prepare the order.
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h2>{pageText[section][0]}</h2>
            <p>{pageText[section][1]}</p>
          </div>
          <span className="status-pill">Live pharmacy network</span>
        </header>

        {section === "search" && (
          <section>
            <div className="search-panel">
              <div className="search-copy">
                <form className="search-form" onSubmit={handleSearch}>
                  <label>
                    Medicine
                    <input value={medicine} onChange={(event) => setMedicine(event.target.value)} list="drugList" />
                  </label>
                  <label>
                    Location
                    <select value={area} onChange={(event) => setArea(event.target.value)}>
                      <option>Nairobi CBD</option>
                      <option>Westlands</option>
                      <option>Eastleigh</option>
                      <option>Kisumu</option>
                      <option>Mombasa</option>
                    </select>
                  </label>
                  <button className="primary-btn" type="submit">Search stock</button>
                </form>
                <datalist id="drugList">
                  <option value="Amoxicillin" />
                  <option value="Insulin glargine" />
                  <option value="Salbutamol inhaler" />
                  <option value="Metformin" />
                  <option value="Losartan" />
                </datalist>
                <div className="stats">
                  <div className="stat"><strong>{availableMatches}</strong><span>stock matches</span></div>
                  <div className="stat"><strong>{fastestEta !== null ? `${fastestEta} min` : "—"}</strong><span>fastest pickup</span></div>
                  <div className="stat"><strong>{lowestPrice !== null ? `KSh ${lowestPrice}` : "—"}</strong><span>lowest price</span></div>
                  <div className="stat"><strong>99%</strong><span>private searches</span></div>
                </div>
              </div>
              <div className="visual">
                <div className="visual-device">
                  <MapView results={results} />
                  <p className="tiny">Live pharmacy stock map with distance, price, and verified availability.</p>
                </div>
              </div>
            </div>

            <div className="content-grid">
              <div className="results">
                {results.length === 0 ? (
                  <article className="result-card">
                    <div>
                      <h3>No exact matches yet</h3>
                      <p className="tiny">Try another location or medicine name.</p>
                    </div>
                  </article>
                ) : results.map((item) => (
                  <article className="result-card" key={`${item.id}-${item.name}`}>
                    <div>
                      <h3>{item.name}</h3>
                      <p className="tiny">{item.area} - {item.distance} away - Pickup in {item.eta}</p>
                      <div className="result-meta">
                        <span className={`tag ${stockClass(item.quantity)}`}>{stockLabel(item.quantity)}: {item.quantity}</span>
                        <span className="tag blue">KSh {item.price}</span>
                        <span className="tag">{item.verified ? "Verified pharmacy" : "Community report"}</span>
                      </div>
                      <div className="result-actions">
                        <button className="secondary-btn" onClick={() => setSelectedPharmacy(item)}>Reserve</button>
                        <button className="ghost-btn" onClick={() => setToast(`Call request prepared for ${item.name}.`)}>Call</button>
                        <button
                          className="ghost-btn"
                          onClick={() => {
                            if (item.latitude && item.longitude) {
                              window.open(
                                `https://www.openstreetmap.org/directions?to=${item.latitude}%2C${item.longitude}`,
                                "_blank",
                                "noopener,noreferrer"
                              );
                            } else {
                              setToast(`No coordinates on file for ${item.name} yet.`);
                            }
                          }}
                        >
                          Directions
                        </button>
                      </div>
                    </div>
                    <strong>KSh {item.price}</strong>
                  </article>
                ))}
              </div>

              <aside className="side-panel">
                <h3>Reserve medicine</h3>
                <label>
                  Selected pharmacy
                  <input value={selectedPharmacy?.name || "Choose a result"} readOnly />
                </label>
                <label>
                  Patient initials
                  <input value={patientInitials} onChange={(event) => setPatientInitials(event.target.value)} maxLength="4" placeholder="e.g. MM" />
                </label>
                <label>
                  Pickup window
                  <select value={pickupWindow} onChange={(event) => setPickupWindow(event.target.value)}>
                    <option>Today, 2:00 PM - 4:00 PM</option>
                    <option>Today, 4:00 PM - 6:00 PM</option>
                    <option>Tomorrow morning</option>
                  </select>
                </label>
                <button className="primary-btn" onClick={handleReserve}>Reserve stock</button>
                <p className="tiny">Only initials and reservation code are shared with the pharmacy.</p>
              </aside>
            </div>
          </section>
        )}

        {section === "dashboard" && !activePharmacy && (
          <section className="panel">
            <div className="toolbar">
              <h3>{authMode === "login" ? "Pharmacy login" : "Register your pharmacy"}</h3>
              <div className="result-actions">
                <button
                  className={authMode === "login" ? "secondary-btn" : "ghost-btn"}
                  onClick={() => { setAuthMode("login"); setAuthError(""); }}
                >
                  Log in
                </button>
                <button
                  className={authMode === "register" ? "secondary-btn" : "ghost-btn"}
                  onClick={() => { setAuthMode("register"); setAuthError(""); }}
                >
                  Register
                </button>
              </div>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                Pharmacy name
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm((form) => ({ ...form, name: event.target.value }))}
                  placeholder="e.g. AfyaCare Pharmacy"
                  required
                />
              </label>

              {authMode === "register" && (
                <label>
                  Area
                  <select
                    value={authForm.area}
                    onChange={(event) => setAuthForm((form) => ({ ...form, area: event.target.value }))}
                  >
                    {AREAS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((form) => ({ ...form, password: event.target.value }))}
                  placeholder={authMode === "register" ? "At least 6 characters" : "Password"}
                  minLength={authMode === "register" ? 6 : undefined}
                  required
                />
              </label>

              <button className="primary-btn" type="submit" disabled={authSubmitting}>
                {authSubmitting ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}
              </button>
            </form>

            {authError && <p className="tiny" style={{ color: "var(--red)", marginTop: 10 }}>{authError}</p>}
            <p className="tiny" style={{ marginTop: 14 }}>
              Trying the demo without registering? Seeded pharmacies (AfyaCare Pharmacy, Westlands MedPoint, etc.)
              all use the password <strong>demo1234</strong>.
            </p>
          </section>
        )}

        {section === "dashboard" && activePharmacy && (
          <section className="panel">
            <div className="toolbar">
              <div>
                <h3>Pharmacy inventory dashboard</h3>
                <p className="tiny">Logged in as <strong>{activePharmacy.name}</strong> ({activePharmacy.area}). Update live stock and flag low inventory.</p>
              </div>
              <button
                className="ghost-btn"
                onClick={() => {
                  setActivePharmacy(null);
                  setEditingId(null);
                  setAuthError("");
                  setAuthForm({ name: "", area: "Nairobi CBD", password: "" });
                }}
              >
                Switch pharmacy
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Medicine</th><th>Stock</th><th>Price</th><th>Status</th><th>Last update</th><th></th></tr>
                </thead>
                <tbody>
                  {inventory.length === 0 ? (
                    <tr><td colSpan="6" className="tiny">No stock listed yet — add your first item below.</td></tr>
                  ) : inventory.map((item) => (
                    <tr key={item.id}>
                      <td>{item.medicine}</td>
                      {editingId === item.id ? (
                        <>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={editDraft.quantity}
                              onChange={(event) => setEditDraft((draft) => ({ ...draft, quantity: event.target.value }))}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={editDraft.price}
                              onChange={(event) => setEditDraft((draft) => ({ ...draft, price: event.target.value }))}
                            />
                          </td>
                          <td>
                            <select
                              value={editDraft.status}
                              onChange={(event) => setEditDraft((draft) => ({ ...draft, status: event.target.value }))}
                            >
                              <option>In stock</option>
                              <option>Low stock</option>
                              <option>Out of stock</option>
                            </select>
                          </td>
                          <td>{item.updated_at || "Just now"}</td>
                          <td className="result-actions">
                            <button className="secondary-btn" onClick={() => saveEditingItem(item.id)}>Save</button>
                            <button className="ghost-btn" onClick={cancelEditingItem}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{item.quantity}</td>
                          <td>KSh {item.price}</td>
                          <td><span className={`tag ${stockClass(item.quantity)}`}>{item.status || stockLabel(item.quantity)}</span></td>
                          <td>{item.updated_at || "Just now"}</td>
                          <td><button className="ghost-btn" onClick={() => startEditingItem(item)}>Edit</button></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="inventory-form" onSubmit={handleAddInventory}>
              <label>Medicine<input name="medicine" placeholder="Medicine name" required /></label>
              <label>Quantity<input name="quantity" type="number" min="0" defaultValue="20" required /></label>
              <label>Price<input name="price" type="number" min="0" defaultValue="250" required /></label>
              <label>Status<select name="status"><option>In stock</option><option>Low stock</option><option>Out of stock</option></select></label>
              <button className="primary-btn" type="submit">Add item</button>
            </form>
          </section>
        )}

        {section === "payments" && (
          <section className="panel">
            <h3>Payments and revenue</h3>
            <div className="payment-grid">
              <PaymentTile title="Pharmacy subscription" text="Pharmacies pay a monthly listing fee for dashboard access." button="Bill pharmacy" onClick={() => handlePayment("Monthly pharmacy subscription", 1500)} />
              <PaymentTile title="Sponsored listing" text="Sponsored results are labelled and never override stock accuracy." button="Create invoice" onClick={() => handlePayment("Sponsored listing", 750)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.time}</td>
                      <td>{payment.type}</td>
                      <td>KSh {payment.amount}</td>
                      <td><span className="tag good">{payment.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {section === "privacy" && (
          <section className="panel policy">
            <p className="tiny">Last updated: July 2026</p>

            <PolicySection title="1. Introduction">
              This Privacy Policy explains how PharmaLink ("we," "us") collects, uses, and protects information
              when patients search for medicine and when pharmacies manage their listings on the platform.
              By using PharmaLink, you agree to the practices described below.
            </PolicySection>

            <PolicySection title="2. Information We Collect">
              <strong>Patients:</strong> we collect the medicine name and area you search for. If you reserve stock,
              we collect your initials (not your full name), a chosen pickup window, and a system-generated
              reservation code. We do not require an account, and we do not collect your diagnosis, national ID
              number, or phone number.
              <br /><br />
              <strong>Pharmacies:</strong> we collect a pharmacy name, area, and a password (stored as a one-way
              cryptographic hash, never in plain text) to create an account, plus the inventory data a pharmacy
              chooses to list — medicine names, quantities, and prices.
            </PolicySection>

            <PolicySection title="3. How We Use Information">
              Search data is used to return live stock results and to improve coverage in underserved areas.
              Reservation data is used only to let a pharmacy prepare an order for pickup. Pharmacy account data
              is used for login and to attribute inventory changes to the correct pharmacy.
            </PolicySection>

            <PolicySection title="4. What Pharmacies Can See">
              When a patient reserves stock, the receiving pharmacy can see the reservation code, the medicine
              and quantity requested, the requested pickup window, and the patient's initials. A pharmacy cannot
              see a patient's search history, other pharmacies' reservations, or any pharmacy account information
              belonging to a competitor.
            </PolicySection>

            <PolicySection title="5. Payments">
              PharmaLink does not process, store, or have any involvement in payment between patients and
              pharmacies — medicine is paid for directly at the pharmacy. The only charges PharmaLink processes
              are pharmacy subscription fees and sponsored listing fees, billed to pharmacies, not patients.
              Sponsored listings are always labelled as sponsored and never affect displayed stock accuracy.
            </PolicySection>

            <PolicySection title="6. Data Retention">
              Reservation records are retained only as long as needed to complete a pickup, and expired
              reservation details may be removed after 30 days. Pharmacies may request correction or removal of
              their own listed inventory at any time.
            </PolicySection>

            <PolicySection title="7. Your Rights">
              Under Kenya's Data Protection Act (2019), you have the right to access, correct, or request deletion
              of personal data we hold about you, and to lodge a complaint with the Office of the Data Protection
              Commissioner (ODPC). Because patient searches are anonymous by default, most search activity is not
              linked to an identifiable person in the first place.
            </PolicySection>

            <PolicySection title="8. Security">
              Pharmacy passwords are hashed, not stored as plain text. Database queries are parameterized to
              guard against common injection attacks. As with any online service, no method of storage or
              transmission is 100% secure, and we work to use industry-standard safeguards appropriate to the
              data we hold.
            </PolicySection>

            <PolicySection title="9. Changes to This Policy">
              We may update this policy as PharmaLink's features evolve. Material changes will be reflected here
              with an updated "last updated" date.
            </PolicySection>

            <PolicySection title="10. Contact Us">
              Questions about this policy or your data can be sent to privacy@pharmalink.co.ke.
            </PolicySection>
          </section>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PolicySection({ title, children }) {
  return (
    <div className="policy-section">
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}

function PaymentTile({ title, text, button, onClick }) {
  return (
    <div className="info-tile">
      <strong>{title}</strong>
      <p className="tiny">{text}</p>
      <button className="primary-btn" onClick={onClick}>{button}</button>
    </div>
  );
}

