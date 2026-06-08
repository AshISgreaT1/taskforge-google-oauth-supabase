const { supabase } = require('../config/supabase');
const {
  hydrateTask,
  hydrateProject,
  createNotification: createNotificationRow,
  getNotificationsByUser
} = require('../services/repository');
const { toCamelNotification, toCamelUser } = require('../services/formatters');

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await getNotificationsByUser(req.user.id);
    const senderIds = notifications.map(notification => notification.sender_id).filter(Boolean);
    const taskIds = notifications.map(notification => notification.task_id).filter(Boolean);
    const projectIds = notifications.map(notification => notification.project_id).filter(Boolean);

    const [senders, tasks, projects] = await Promise.all([
      senderIds.length ? supabase.from('users').select('*').in('id', [...new Set(senderIds)]) : Promise.resolve({ data: [] }),
      taskIds.length ? supabase.from('tasks').select('*').in('id', [...new Set(taskIds)]) : Promise.resolve({ data: [] }),
      projectIds.length ? supabase.from('projects').select('*').in('id', [...new Set(projectIds)]) : Promise.resolve({ data: [] })
    ]);

    const senderMap = new Map((senders.data || []).map(user => [user.id, user]));
    const taskMap = new Map((tasks.data || []).map(task => [task.id, task]));
    const projectMap = new Map((projects.data || []).map(project => [project.id, project]));

    const hydratedTasks = [];
    for (const task of taskMap.values()) {
      hydratedTasks.push(await hydrateTask(task));
    }
    const hydratedProjects = [];
    for (const project of projectMap.values()) {
      hydratedProjects.push(await hydrateProject(project));
    }
    const hydratedTaskMap = new Map(hydratedTasks.filter(Boolean).map(task => [task._id, task]));
    const hydratedProjectMap = new Map(hydratedProjects.filter(Boolean).map(project => [project._id, project]));

    const mapped = notifications.map(notification => {
      const base = toCamelNotification(notification, {
        sender: senderMap.get(notification.sender_id),
        task: hydratedTaskMap.get(notification.task_id),
        project: hydratedProjectMap.get(notification.project_id)
      });
      return base;
    });

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('is_read', false);

    res.json({
      success: true,
      notifications: mapped,
      unreadCount: count || 0
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
};

exports.createNotification = async (data) => {
  try {
    const notification = await createNotificationRow(data);
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification'
    });
  }
};
