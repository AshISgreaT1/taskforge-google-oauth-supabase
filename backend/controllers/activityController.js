const { supabase } = require('../config/supabase');
const { getProjectMembers, getUsersByIds, hydrateTasks } = require('../services/repository');
const { toCamelActivity } = require('../services/formatters');

async function getAccessibleProjectIds(user) {
  if (user.role === 'admin') {
    const { data, error } = await supabase.from('projects').select('id');
    if (error) throw error;
    return (data || []).map(project => project.id);
  }

  const [owned, memberships] = await Promise.all([
    supabase.from('projects').select('id').eq('created_by', user.id),
    supabase.from('project_members').select('project_id').eq('user_id', user.id)
  ]);

  if (owned.error) throw owned.error;
  if (memberships.error) throw memberships.error;

  return [
    ...(owned.data || []).map(project => project.id),
    ...(memberships.data || []).map(member => member.project_id)
  ];
}

exports.getActivityLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view activity logs'
      });
    }

    const { entityType, entityId, userId, limit = 50 } = req.query;

    let query = supabase.from('task_activity').select('*').order('created_at', { ascending: false }).limit(parseInt(limit, 10));
    if (entityType === 'task' && entityId) query = query.eq('task_id', entityId);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) throw error;

    const userIds = [...new Set((data || []).map(item => item.user_id).filter(Boolean))];
    const usersRes = userIds.length ? await supabase.from('users').select('*').in('id', userIds) : { data: [] };
    if (usersRes.error) throw usersRes.error;

    const userMap = new Map((usersRes.data || []).map(user => [user.id, user]));
    const logs = (data || []).map(item => toCamelActivity(item, userMap.get(item.user_id)));

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity logs',
      error: error.message
    });
  }
};

exports.getProjectActivity = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50 } = req.query;

    const accessible = await getAccessibleProjectIds(req.user);
    if (req.user.role !== 'admin' && !accessible.includes(projectId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project activity'
      });
    }

    const { data: taskRows, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId);

    if (error) throw error;

    const taskIds = (taskRows || []).map(task => task.id);
    if (taskIds.length === 0) {
      return res.json({ success: true, logs: [] });
    }

    const { data: activityRows, error: activityError } = await supabase
      .from('task_activity')
      .select('*')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10));

    if (activityError) throw activityError;

    const userIds = [...new Set((activityRows || []).map(item => item.user_id).filter(Boolean))];
    const usersRes = userIds.length ? await supabase.from('users').select('*').in('id', userIds) : { data: [] };
    if (usersRes.error) throw usersRes.error;

    const userMap = new Map((usersRes.data || []).map(user => [user.id, user]));
    const logs = (activityRows || []).map(item => toCamelActivity(item, userMap.get(item.user_id)));

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project activity',
      error: error.message
    });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { startDate, endDate, userId, action, limit = 100 } = req.query;

    let query = supabase.from('task_activity').select('*').order('created_at', { ascending: false }).limit(parseInt(limit, 10));
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (userId) query = query.eq('user_id', userId);
    if (action) query = query.eq('action', action);

    const { data, error } = await query;
    if (error) throw error;

    const userIds = [...new Set((data || []).map(item => item.user_id).filter(Boolean))];
    const usersRes = userIds.length ? await supabase.from('users').select('*').in('id', userIds) : { data: [] };
    if (usersRes.error) throw usersRes.error;
    const userMap = new Map((usersRes.data || []).map(user => [user.id, user]));

    const logs = (data || []).map(item => toCamelActivity(item, userMap.get(item.user_id)));

    res.json({
      success: true,
      logs,
      total: logs.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching audit logs',
      error: error.message
    });
  }
};

exports.getActivityStats = async (req, res) => {
  try {
    const { projectId, days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days, 10));

    let taskIds = null;
    if (projectId) {
      const accessible = await getAccessibleProjectIds(req.user);
      if (req.user.role !== 'admin' && !accessible.includes(projectId)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this project activity'
        });
      }

      const { data, error } = await supabase.from('tasks').select('id').eq('project_id', projectId);
      if (error) throw error;
      taskIds = (data || []).map(task => task.id);
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view global activity stats'
      });
    }

    let query = supabase
      .from('task_activity')
      .select('*')
      .gte('created_at', startDate.toISOString());
    if (taskIds) query = query.in('task_id', taskIds);

    const { data, error } = await query;
    if (error) throw error;

    const byDate = {};
    const byAction = {};

    (data || []).forEach(item => {
      const date = item.created_at.slice(0, 10);
      byDate[date] = (byDate[date] || 0) + 1;
      byAction[item.action] = (byAction[item.action] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        byDate,
        byAction,
        total: (data || []).length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity stats',
      error: error.message
    });
  }
};
