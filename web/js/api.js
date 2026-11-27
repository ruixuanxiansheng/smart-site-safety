const TOKEN_KEY = 'zha_token';

class Api {
  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY) || '';
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
  }

  clear() {
    this.token = '';
    localStorage.removeItem(TOKEN_KEY);
  }

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      this.clear();
      if (!location.hash.startsWith('#/login')) {
        location.hash = '#/login';
      }
      throw new Error('登录已过期，请重新登录');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `请求失败 (${res.status})`);
    }
    return data;
  }

  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  logout() {
    return this.request('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }

  me() {
    return this.request('/api/me');
  }

  dashboard() {
    return this.request('/api/dashboard');
  }

  alerts(params = {}) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return this.request(`/api/alerts${qs ? `?${qs}` : ''}`);
  }

  patchAlert(id, body) {
    return this.request(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  alertToOrder(id, body) {
    return this.request(`/api/alerts/${id}/workorder`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  workorders(params = {}) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return this.request(`/api/workorders${qs ? `?${qs}` : ''}`);
  }

  createOrder(body) {
    return this.request('/api/workorders', { method: 'POST', body: JSON.stringify(body) });
  }

  patchOrder(id, body) {
    return this.request(`/api/workorders/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  workers() {
    return this.request('/api/workers');
  }

  cameras() {
    return this.request('/api/cameras');
  }

  analytics() {
    return this.request('/api/analytics');
  }

  settings() {
    return this.request('/api/settings');
  }

  patchSettings(body) {
    return this.request('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
  }
}

export const api = new Api();
