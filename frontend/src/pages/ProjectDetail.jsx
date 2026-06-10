import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  UserPlus,
  UserMinus,
  Loader2,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  ListTodo,
  LayoutGrid,
  List
} from 'lucide-react';
import { projectAPI, taskAPI, authAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import KanbanBoard from '../components/KanbanBoard';

const statusColors = {
  'todo': 'bg-slate-500/20 text-slate-400',
  'in-progress': 'bg-blue-500/20 text-blue-400',
  'pending-approval': 'bg-amber-500/20 text-amber-400',
  'completed': 'bg-green-500/20 text-green-400'
};

const priorityColors = {
  'low': 'priority-low',
  'medium': 'priority-medium',
  'high': 'priority-high',
  'critical': 'priority-critical'
};

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'medium',
    dueDate: '',
    generateSubtasks: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageProject = isAdmin || project?.createdBy?._id === user?.id;

  useEffect(() => {
    fetchProject();
    fetchUsers();
    fetchPrediction();
  }, [id]);

  const fetchProject = async () => {
    try {
      const res = await projectAPI.getProject(id);
      setProject(res.data.project);
      setTasks(res.data.tasks);
    } catch (err) {
      console.error('Error fetching project:', err);
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

  const fetchPrediction = async () => {
    try {
      const res = await taskAPI.getAIPrediction(id);
      setPrediction(res.data.prediction);
    } catch (err) {
      console.error('Error fetching prediction:', err);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      console.log('Submitting task with assignedTo:', formData.assignedTo);
      await taskAPI.createTask({
        ...formData,
        projectId: id
      });
      setShowTaskModal(false);
      setFormData({
        title: '',
        description: '',
        assignedTo: '',
        priority: 'medium',
        dueDate: '',
        generateSubtasks: false
      });
      fetchProject();
    } catch (err) {
      console.error('Error creating task:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await taskAPI.updateTaskStatus(taskId, status);
      fetchProject();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await taskAPI.deleteTask(taskId);
      fetchProject();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleAddMember = async (memberId) => {
    try {
      await projectAPI.addMember(id, memberId);
      fetchProject();
    } catch (err) {
      console.error('Error adding member:', err);
    }
  };

  const handleMemberRoleChange = async (memberId, role) => {
    try {
      await projectAPI.updateMemberRole(id, memberId, role);
      fetchProject();
    } catch (err) {
      console.error('Error updating member role:', err);
    }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await projectAPI.removeMember(id, memberId);
      fetchProject();
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  const todoTasks = tasks.filter(t => t.status === 'todo' && !t.isSubtask);
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress' && !t.isSubtask);
  const pendingTasks = tasks.filter(t => t.status === 'pending-approval' && !t.isSubtask);
  const completedTasks = tasks.filter(t => t.status === 'completed' && !t.isSubtask);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/projects"
          className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project?.title}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              project?.status === 'completed' ? 'bg-green-500/20 text-green-400' :
              project?.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
              'bg-dark-600 text-dark-300'
            }`}>
              {project?.status}
            </span>
          </div>
          <p className="text-dark-400">{project?.description || 'No description'}</p>
        </div>
        {canManageProject && (
          <button
            onClick={() => setShowTaskModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Task
          </button>
        )}
      </div>

      {prediction && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-amber-600/20 border border-amber-600/50 rounded-xl"
        >
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          <div>
            <p className="font-medium text-amber-400">AI Prediction</p>
            <p className="text-sm">{prediction}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks</h2>
            <div className="flex items-center gap-2 bg-dark-700/50 rounded-lg p-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'kanban' ? 'bg-primary-600 text-white' : 'hover:bg-dark-600'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list' ? 'bg-primary-600 text-white' : 'hover:bg-dark-600'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {viewMode === 'kanban' ? (
            <KanbanBoard
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteTask}
              onEdit={() => {}}
              canDelete={isAdmin}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <TaskColumn
                title="To Do"
                icon={ListTodo}
                tasks={todoTasks}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTask}
                color="border-slate-500"
                canDelete={isAdmin}
              />
              <TaskColumn
                title="In Progress"
                icon={Clock}
                tasks={inProgressTasks}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTask}
                color="border-blue-500"
                canDelete={isAdmin}
              />
              <TaskColumn
                title="Pending Approval"
                icon={Clock}
                tasks={pendingTasks}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTask}
                color="border-amber-500"
                canDelete={isAdmin}
              />
              <TaskColumn
                title="Completed"
                icon={CheckCircle}
                tasks={completedTasks}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTask}
                color="border-green-500"
                canDelete={isAdmin}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Progress</h3>
              <span className="text-primary-400 font-bold">{project?.progress}%</span>
            </div>
            <div className="h-3 bg-dark-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${project?.progress}%` }}
                className="h-full bg-primary-500 rounded-full"
              />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Team Members</h3>
              {canManageProject && (
                <button
                  onClick={() => setShowMemberModal(true)}
                  className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2 bg-dark-700/50 rounded-lg">
                <img
                  src={project?.createdBy?.avatar}
                  alt={project?.createdBy?.name}
                  className="w-8 h-8 rounded-full"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{project?.createdBy?.name}</p>
                  <p className="text-xs text-dark-400">Owner</p>
                </div>
              </div>
              {project?.members?.map((member) => {
                const memberUser = member.user;
                if (!memberUser || !memberUser._id) return null;
                return (
                <div key={memberUser._id} className="flex items-center gap-3 p-2 bg-dark-700/50 rounded-lg">
                  <img
                    src={memberUser.avatar}
                    alt={memberUser.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{memberUser.name}</p>
                    {canManageProject ? (
                      <select
                        value={member.role || memberUser.jobRole || 'member'}
                        onChange={(e) => handleMemberRoleChange(memberUser._id, e.target.value)}
                        className="mt-1 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs"
                      >
                        {['team-lead', 'frontend-dev', 'backend-dev', 'qa', 'designer', 'member'].map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-dark-400">{member.role || memberUser.email}</p>
                    )}
                  </div>
                  {canManageProject && (
                    <button
                      onClick={() => handleRemoveMember(memberUser._id)}
                      className="p-1 hover:bg-red-600/20 text-red-400 rounded transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );})}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTaskModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowTaskModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Create Task</h2>
                  <button
                    onClick={() => setShowTaskModal(false)}
                    className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateTask} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="input-field"
                      placeholder="Task title"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input-field min-h-[80px]"
                      placeholder="Task description"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Assign To</label>
                      <select
                        value={formData.assignedTo}
                        onChange={(e) => {
                          const selectedUser = users.find(u => u.id === e.target.value);
                          console.log('Selected assignee object:', selectedUser);
                          console.log('Selected assignee id:', selectedUser?.id);
                          console.log('Selected assignee _id:', selectedUser?._id);
                          setFormData({ ...formData, assignedTo: e.target.value });
                        }}
                        className="input-field"
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => {
                          console.log('TASK USER OBJECT:', u);
                          return <option key={u.id} value={u.id}>{u.name}</option>;
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Priority</label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="input-field"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Due Date</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="input-field"
                    />
                  </div>

                  <label className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.generateSubtasks}
                      onChange={(e) => setFormData({ ...formData, generateSubtasks: e.target.checked })}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <Sparkles className="w-5 h-5 text-primary-400" />
                    <div>
                      <p className="font-medium">AI Task Breakdown</p>
                      <p className="text-xs text-dark-400">Automatically generate subtasks</p>
                    </div>
                  </label>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowTaskModal(false)}
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
                          Creating...
                        </>
                      ) : (
                        'Create Task'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}

        {showMemberModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowMemberModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Add Member</h2>
                  <button
                    onClick={() => setShowMemberModal(false)}
                    className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {users.filter(u =>
                    u._id !== project?.createdBy?._id &&
                    !project?.members?.some(m => (m.user?._id || m._id) === u._id)
                  ).map((u) => (
                    <button
                      key={u._id}
                      onClick={() => {
                        handleAddMember(u._id);
                        setShowMemberModal(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full" />
                      <div className="flex-1 text-left">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-dark-400">{u.email}</p>
                      </div>
                      <UserPlus className="w-5 h-5 text-primary-400" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskColumn({ title, icon: Icon, tasks, onStatusChange, onDelete, color, canDelete = true }) {
  const [showMenu, setShowMenu] = useState(null);

  return (
    <div className={`border-t-2 ${color} rounded-xl p-4 bg-dark-800/50`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${color.replace('border', 'text')}`} />
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm text-dark-400">({tasks.length})</span>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <motion.div
            key={task._id}
            layout
            className="card p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium">{task.title}</h4>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(showMenu === task._id ? null : task._id)}
                  className="p-1 hover:bg-dark-700 rounded transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu === task._id && (
                  <div className="absolute right-0 top-full mt-1 bg-dark-700 rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
                    <select
                      value={task.status}
                      onChange={(e) => {
                        onStatusChange(task._id, e.target.value);
                        setShowMenu(null);
                      }}
                      className="w-full px-3 py-2 bg-transparent text-sm hover:bg-dark-600 text-left"
                    >
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="pending-approval">Pending Approval</option>
                      <option value="completed">Completed</option>
                    </select>
                    {canDelete && (
                      <button
                        onClick={() => {
                          onDelete(task._id);
                          setShowMenu(null);
                        }}
                        className="w-full px-3 py-2 text-sm hover:bg-dark-600 text-left text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {task.description && (
              <p className="text-sm text-dark-400 mb-3 line-clamp-2">{task.description}</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${priorityColors[task.priority]}`} />
                <span className="text-xs text-dark-400 capitalize">{task.priority}</span>
              </div>
              {task.assignedTo && (
                <img
                  src={task.assignedTo.avatar}
                  alt={task.assignedTo.name}
                  className="w-6 h-6 rounded-full"
                  title={task.assignedTo.name}
                />
              )}
            </div>

            {task.dueDate && (
              <div className="mt-2 text-xs text-dark-400">
                Due: {new Date(task.dueDate).toLocaleDateString()}
              </div>
            )}
          </motion.div>
        ))}

        {tasks.length === 0 && (
          <p className="text-dark-400 text-sm text-center py-4">No tasks</p>
        )}
      </div>
    </div>
  );
}
