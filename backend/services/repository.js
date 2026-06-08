const { supabase } = require('../config/supabase');
const {
  toCamelUser,
  toCamelProjectMember,
  toCamelProject,
  toCamelTask,
  toCamelActivity,
  toCamelNotification
} = require('./formatters');

const STATUS_ORDER = ['todo', 'in-progress', 'pending-approval', 'completed'];

async function getUsersByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .in('id', uniqueIds);

  if (error) throw error;
  return data || [];
}

async function getProjectsByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .in('id', uniqueIds);

  if (error) throw error;
  return data || [];
}

async function getProjectMembers(projectIds = []) {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .in('project_id', uniqueIds)
    .order('added_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function hydrateProjects(projectRows = []) {
  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map(project => project.id);
  const creatorIds = projectRows.map(project => project.created_by);
  const members = await getProjectMembers(projectIds);
  const userIds = [
    ...creatorIds,
    ...members.map(member => member.user_id),
    ...members.map(member => member.added_by)
  ];
  const users = await getUsersByIds(userIds);
  const userMap = new Map(users.map(user => [user.id, user]));
  const memberMap = members.reduce((acc, member) => {
    if (!acc[member.project_id]) acc[member.project_id] = [];
    acc[member.project_id].push(member);
    return acc;
  }, {});

  return projectRows.map(project => {
    const projectMembers = (memberMap[project.id] || []).map(member => toCamelProjectMember(member, userMap.get(member.user_id)));
    return toCamelProject(project, projectMembers, userMap.get(project.created_by));
  });
}

async function hydrateTasks(taskRows = []) {
  if (taskRows.length === 0) return [];

  const projectIds = taskRows.map(task => task.project_id);
  const userIds = [
    ...taskRows.map(task => task.assignee_id),
    ...taskRows.map(task => task.creator_id),
    ...taskRows.map(task => task.approved_by)
  ];

  const [projects, users] = await Promise.all([
    getProjectsByIds(projectIds),
    getUsersByIds(userIds)
  ]);

  const projectMap = new Map(projects.map(project => [project.id, project]));
  const userMap = new Map(users.map(user => [user.id, user]));

  const projectMembers = await getProjectMembers(projectIds);
  const memberMap = projectMembers.reduce((acc, member) => {
    if (!acc[member.project_id]) acc[member.project_id] = [];
    acc[member.project_id].push(member);
    return acc;
  }, {});

  return taskRows.map(task => toCamelTask(task, {
    assignee: userMap.get(task.assignee_id),
    creator: userMap.get(task.creator_id),
    approver: userMap.get(task.approved_by),
    project: projectMap.get(task.project_id),
    projectCreator: userMap.get(projectMap.get(task.project_id)?.created_by),
    projectMembers: (memberMap[task.project_id] || []).map(member => toCamelProjectMember(member, userMap.get(member.user_id)))
  }));
}

async function hydrateTask(taskRow) {
  if (!taskRow) return null;
  const tasks = await hydrateTasks([taskRow]);
  return tasks[0] || null;
}

async function hydrateProject(projectRow) {
  if (!projectRow) return null;
  const projects = await hydrateProjects([projectRow]);
  return projects[0] || null;
}

async function createActivity({ taskId, userId, action, previousData = {}, newData = {} }) {
  const { data, error } = await supabase
    .from('task_activity')
    .insert([{
      task_id: taskId,
      user_id: userId,
      action,
      previous_data: previousData,
      new_data: newData
    }])
    .select('*')
    .single();

  if (error) throw error;

  const user = userId ? await getUsersByIds([userId]).then(rows => rows[0] || null) : null;
  return toCamelActivity(data, user);
}

async function createNotification(payload) {
  const { data, error } = await supabase
    .from('notifications')
    .insert([{
      recipient_id: payload.recipient,
      sender_id: payload.sender,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      project_id: payload.projectId || null,
      task_id: payload.taskId || null,
      is_read: false
    }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getNotificationsByUser(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

async function getTasksByFilter(filter = {}) {
  let query = supabase.from('tasks').select('*');

  if (filter.projectId) query = query.eq('project_id', filter.projectId);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.priority) query = query.eq('priority', filter.priority);
  if (filter.assignedTo) query = query.eq('assignee_id', filter.assignedTo);
  if (filter.creatorId) query = query.eq('creator_id', filter.creatorId);
  if (filter.parentTask) query = query.eq('parent_task_id', filter.parentTask);
  if (filter.isSubtask !== undefined) query = query.eq('is_subtask', filter.isSubtask);
  if (filter.search) {
    query = query.or(`title.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
  }
  if (filter.dueBefore) query = query.lte('due_date', filter.dueBefore);
  if (filter.dueAfter) query = query.gte('due_date', filter.dueAfter);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  STATUS_ORDER,
  getUsersByIds,
  getProjectsByIds,
  getProjectMembers,
  hydrateProjects,
  hydrateProjectsList: hydrateProjects,
  hydrateTasks,
  hydrateTask,
  hydrateProject,
  createActivity,
  createNotification,
  getNotificationsByUser,
  getTasksByFilter
};
