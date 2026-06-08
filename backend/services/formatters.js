const toCamelUser = (user) => {
  if (!user) return null;

  return {
    _id: user.id,
    id: user.id,
    googleId: user.google_id,
    name: user.name,
    email: user.email,
    avatar: user.avatar_url,
    avatarUrl: user.avatar_url,
    role: user.role || 'member',
    isActive: user.is_active !== false,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
};

const toCamelProjectMember = (member, user) => ({
  user: toCamelUser(user),
  role: member.role || 'member',
  addedAt: member.added_at,
  addedBy: member.added_by
});

const toCamelProject = (project, members = [], createdBy = null) => ({
  _id: project.id,
  id: project.id,
  title: project.title,
  description: project.description,
  createdBy: toCamelUser(createdBy) || project.createdBy || project.created_by,
  members,
  progress: project.progress ?? 0,
  status: project.status || 'active',
  startDate: project.start_date || project.startDate,
  endDate: project.end_date || project.endDate,
  createdAt: project.created_at || project.createdAt,
  updatedAt: project.updated_at || project.updatedAt
});

const toCamelTask = (task, relations = {}) => ({
  _id: task.id,
  id: task.id,
  title: task.title,
  description: task.description,
  assignedTo: toCamelUser(relations.assignee),
  createdBy: toCamelUser(relations.creator),
  approvedBy: toCamelUser(relations.approver),
  projectId: relations.project ? toCamelProject(relations.project, relations.projectMembers || [], relations.projectCreator) : task.project_id,
  priority: task.priority,
  status: task.status,
  approvalStatus: task.approval_status,
  approvalNote: task.approval_note,
  dueDate: task.due_date,
  isSubtask: task.is_subtask,
  parentTask: task.parent_task_id,
  completedAt: task.completed_at,
  createdAt: task.created_at,
  updatedAt: task.updated_at
});

const toCamelActivity = (activity, user = null) => ({
  _id: activity.id,
  id: activity.id,
  taskId: activity.task_id,
  user: toCamelUser(user),
  action: activity.action,
  previousData: activity.previous_data || {},
  newData: activity.new_data || {},
  createdAt: activity.created_at
});

const toCamelNotification = (notification, relations = {}) => ({
  _id: notification.id,
  id: notification.id,
  recipient: notification.recipient_id,
  sender: toCamelUser(relations.sender),
  type: notification.type,
  title: notification.title,
  message: notification.message,
  isRead: notification.is_read,
  projectId: relations.project ? toCamelProject(relations.project) : notification.project_id,
  taskId: relations.task ? toCamelTask(relations.task, relations.taskRelations || {}) : notification.task_id,
  createdAt: notification.created_at,
  updatedAt: notification.updated_at
});

module.exports = {
  toCamelUser,
  toCamelProjectMember,
  toCamelProject,
  toCamelTask,
  toCamelActivity,
  toCamelNotification
};
