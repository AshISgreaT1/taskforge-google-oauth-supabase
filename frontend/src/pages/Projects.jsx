import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  FolderKanban,
  Pencil,
  Trash2,
  Users,
  Calendar,
  Loader2,
  X
} from 'lucide-react';
import { projectAPI, authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({ title: '', description: '', endDate: '', members: [] });
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchProjects();
    fetchUsers();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await projectAPI.getProjects();
      setProjects(res.data.projects);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await authAPI.getAllUsers();
      setUsers(res.data.users);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingProject) {
        await projectAPI.updateProject(editingProject._id, formData);
      } else {
        await projectAPI.createProject(formData);
      }
      setShowModal(false);
      setEditingProject(null);
      setFormData({ title: '', description: '', endDate: '', members: [] });
      fetchProjects();
    } catch (err) {
      console.error('Error saving project:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await projectAPI.deleteProject(id);
      fetchProjects();
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setFormData({
      title: project.title,
      description: project.description || '',
      endDate: project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : '',
      members: project.members.map(m => m.user?._id).filter(Boolean)
    });
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-dark-400">Manage your team projects</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingProject(null);
              setFormData({ title: '', description: '', endDate: '', members: [] });
              setShowModal(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="card text-center py-12">
          <FolderKanban className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="text-dark-400 mb-4">Create your first project to get started</p>
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, index) => (
            <motion.div
              key={project._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card-hover group relative"
            >
              <Link to={`/projects/${project._id}`} className="block">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-primary-600/20 rounded-xl">
                    <FolderKanban className="w-6 h-6 text-primary-400" />
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    project.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    project.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-dark-600 text-dark-300'
                  }`}>
                    {project.status}
                  </div>
                </div>

                <h3 className="text-lg font-semibold mb-2 group-hover:text-primary-400 transition-colors">
                  {project.title}
                </h3>
                <p className="text-dark-400 text-sm mb-4 line-clamp-2">
                  {project.description || 'No description'}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-400">Progress</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${project.progress}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="h-full bg-primary-500 rounded-full"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 text-dark-400 text-sm">
                      <Users className="w-4 h-4" />
                      <span>{project.members.length + 1}</span>
                    </div>
                    {project.endDate && (
                      <div className="flex items-center gap-2 text-dark-400 text-sm">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(project.endDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>

              {(project.createdBy._id === user?.id || isAdmin) && (
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      openEditModal(project);
                    }}
                    className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {(project.createdBy._id === user?.id || user?.role === 'admin') && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete(project._id);
                      }}
                      className="p-2 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">
                    {editingProject ? 'Edit Project' : 'New Project'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="input-field"
                      placeholder="Project title"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input-field min-h-[100px]"
                      placeholder="Project description"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Team Members</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {users.filter(u => u._id !== user?.id).map((u) => (
                        <label
                          key={u._id}
                          className="flex items-center gap-3 p-2 hover:bg-dark-700/50 rounded-lg cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.members.includes(u._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  members: [...formData.members, u._id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  members: formData.members.filter(id => id !== u._id)
                                });
                              }
                            }}
                            className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                          />
                          <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full" />
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-xs text-dark-400">{u.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        editingProject ? 'Update Project' : 'Create Project'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
