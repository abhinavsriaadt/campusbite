import api from "./client";

const d = (p) => p.then((r) => r.data);

/** Strip empty params so URLs stay clean. */
const clean = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false));

export const authApi = {
  login: (body) => d(api.post("/auth/login", body)),
  register: (body) => d(api.post("/auth/register", body)),
  verifyEmail: (body) => d(api.post("/auth/verify-email", body)),
  verifyLogin: (body) => d(api.post("/auth/login/verify", body)),
  resendOtp: (body) => d(api.post("/auth/otp/resend", body)),
  me: () => d(api.get("/auth/me")),
  updateMe: (body) => d(api.patch("/auth/me", body)),
};

export const catalogApi = {
  restaurants: (params) => d(api.get("/restaurants", { params: clean(params) })),
  cuisines: () => d(api.get("/restaurants/cuisines")),
  restaurant: (id) => d(api.get(`/restaurants/${id}`)),
  menu: (id, params) => d(api.get(`/restaurants/${id}/menu`, { params: clean(params) })),
  reviews: (id, params) => d(api.get(`/restaurants/${id}/reviews`, { params: clean(params) })),
  dishes: (params) => d(api.get("/dishes", { params: clean(params) })),
};

export const ordersApi = {
  quote: (body) => d(api.post("/orders/quote", body)),
  place: (body) => d(api.post("/orders", body)),
  list: (params) => d(api.get("/orders", { params: clean(params) })),
  get: (id) => d(api.get(`/orders/${id}`)),
  setStatus: (id, status, note) => d(api.patch(`/orders/${id}/status`, { status, note })),
  cancel: (id, reason) => d(api.post(`/orders/${id}/cancel`, { reason: reason || null })),
  assign: (id, partnerId) => d(api.post(`/orders/${id}/assign`, { delivery_partner_id: partnerId })),
  review: (id, body) => d(api.post(`/orders/${id}/review`, body)),
  requestReturn: (id, reason) => d(api.post(`/orders/${id}/return`, { reason })),
};

export const returnsApi = {
  list: (params) => d(api.get("/returns", { params: clean(params) })),
  approve: (id, note) => d(api.post(`/returns/${id}/approve`, { note: note || null })),
  reject: (id, note) => d(api.post(`/returns/${id}/reject`, { note: note || null })),
};

export const ownerApi = {
  restaurant: () => d(api.get("/owner/restaurant")),
  updateRestaurant: (body) => d(api.patch("/owner/restaurant", body)),
  menuItems: (params) => d(api.get("/owner/menu-items", { params: clean(params) })),
  createItem: (body) => d(api.post("/owner/menu-items", body)),
  updateItem: (id, body) => d(api.patch(`/owner/menu-items/${id}`, body)),
  setAvailability: (id, is_available) => d(api.patch(`/owner/menu-items/${id}/availability`, { is_available })),
  deleteItem: (id) => d(api.delete(`/owner/menu-items/${id}`)),
  partners: () => d(api.get("/owner/delivery-partners")),
  stats: () => d(api.get("/owner/stats")),
  reminders: (params) => d(api.get("/owner/reminders", { params: clean(params) })),
  dismissReminder: (id) => d(api.post(`/owner/reminders/${id}/dismiss`)),
};

export const deliveryApi = {
  stats: () => d(api.get("/delivery/stats")),
};

export const aiApi = {
  status: () => d(api.get("/ai/status")),
  ask: (question) => d(api.post("/ai/insights", { question })),
};
