const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (networkError) {
    const error = new Error("Backend unreachable");
    error.isNetworkError = true;
    throw error;
  }

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export function searchStock(medicine, area) {
  const query = new URLSearchParams({ medicine, area });
  return request(`/stock/search?${query.toString()}`);
}

export function createReservation(payload) {
  return request("/reservations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function registerPharmacy(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginPharmacy(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getPharmacies() {
  return request("/pharmacies");
}

export function getInventory(pharmacyId) {
  const query = pharmacyId ? `?${new URLSearchParams({ pharmacy_id: pharmacyId }).toString()}` : "";
  return request(`/inventory${query}`);
}

export function addInventoryItem(payload) {
  return request("/inventory", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInventoryItem(id, payload) {
  return request(`/inventory/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function createPayment(payload) {
  return request("/payments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}