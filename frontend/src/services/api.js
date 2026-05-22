import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const API = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  signup: (data) => API.post('/auth/signup', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  getAllUsers: () => API.get('/auth/users'),
  createUser: (data) => API.post('/auth/users', data),
  updateUserRole: (id, data) => API.patch(`/auth/users/${id}/role`, data),
  disableUser: (id, isActive = false) => API.patch(`/auth/users/${id}/disable`, { isActive }),
  deleteUser: (id) => API.delete(`/auth/users/${id}`)
};

export const projectAPI = {
  getProjects: () => API.get('/projects'),
  getProject: (id) => API.get(`/projects/${id}`),
  createProject: (data) => API.post('/projects', data),
  updateProject: (id, data) => API.put(`/projects/${id}`, data),
  deleteProject: (id) => API.delete(`/projects/${id}`),
  addMember: (id, memberId, role = 'member') => API.post(`/projects/${id}/members`, { memberId, role }),
  removeMember: (id, memberId) => API.delete(`/projects/${id}/members`, { data: { memberId } }),
  updateMemberRole: (id, memberId, role) => API.patch(`/projects/${id}/members/${memberId}`, { role })
};

export const taskAPI = {
  getTasks: (params) => API.get('/tasks', { params }),
  getTask: (id) => API.get(`/tasks/${id}`),
  createTask: (data) => API.post('/tasks', data),
  updateTask: (id, data) => API.put(`/tasks/${id}`, data),
  updateTaskStatus: (id, status) => API.patch(`/tasks/${id}/status`, { status }),
  deleteTask: (id) => API.delete(`/tasks/${id}`),
  getAIPrediction: (projectId) => API.get(`/tasks/ai/prediction/${projectId}`),
  getPendingApprovals: () => API.get('/tasks/approvals/pending'),
  approveTask: (id, note) => API.post(`/tasks/${id}/approve`, { note }),
  rejectTask: (id, note) => API.post(`/tasks/${id}/reject`, { note })
};

export const notificationAPI = {
  getNotifications: () => API.get('/notifications'),
  markAsRead: (id) => API.put(`/notifications/${id}/read`),
  markAllAsRead: () => API.put('/notifications/read-all'),
  deleteNotification: (id) => API.delete(`/notifications/${id}`)
};

export const chatAPI = {
  getProjectChat: (projectId) => API.get(`/chat/${projectId}`),
  getMessages: (projectId) => API.get(`/chat/${projectId}/messages`),
  sendMessage: (projectId, data) => API.post(`/chat/${projectId}/messages`, data)
};

export const fileAPI = {
  uploadFile: (data) => API.post('/files/upload', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

export const dashboardAPI = {
  getDashboard: () => API.get('/dashboard'),
  getTeamStats: (projectId) => API.get('/dashboard/team', { params: { projectId } })
};

export const searchAPI = {
  globalSearch: (query) => API.get('/search', { params: { q: query } })
};

export default API;
