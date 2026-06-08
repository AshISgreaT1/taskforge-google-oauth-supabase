const { supabase } = require('../config/supabase');
const { hydrateTasks, hydrateProjects, getProjectMembers, getUsersByIds } = require('../services/repository');

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

exports.getDashboard = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user);
    const [projectsRes, tasksRes, usersRes] = await Promise.all([
      supabase.from('projects').select('*').in('id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('tasks').select('*').in('project_id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']),
      supabase.from('users').select('*').eq('is_active', true)
    ]);

    if (projectsRes.error) throw projectsRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (usersRes.error) throw usersRes.error;

    const userProjects = await hydrateProjects(projectsRes.data || []);
    const allTasks = await hydrateTasks(tasksRes.data || []);

    const now = new Date();
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const pendingTasks = allTasks.filter(t => t.status === 'todo').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in-progress').length;
    const overdueTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed').length;

    const userTaskStats = {};
    allTasks.forEach(task => {
      if (task.assignedTo?._id) {
        const id = task.assignedTo._id;
        if (!userTaskStats[id]) {
          userTaskStats[id] = { assigned: 0, completed: 0 };
        }
        userTaskStats[id].assigned++;
        if (task.status === 'completed') userTaskStats[id].completed++;
      }
    });

    const leaderboard = (usersRes.data || []).map(user => {
      const stats = userTaskStats[user.id] || { assigned: 0, completed: 0 };
      const productivityScore = stats.assigned > 0
        ? Math.round((stats.completed / stats.assigned) * 100)
        : 0;
      return {
        user: {
          _id: user.id,
          name: user.name,
          avatar: user.avatar_url
        },
        assignedTasks: stats.assigned,
        completedTasks: stats.completed,
        productivityScore
      };
    }).sort((a, b) => b.productivityScore - a.productivityScore);

    const tasksByPriority = {
      low: allTasks.filter(t => t.priority === 'low').length,
      medium: allTasks.filter(t => t.priority === 'medium').length,
      high: allTasks.filter(t => t.priority === 'high').length,
      critical: allTasks.filter(t => t.priority === 'critical').length
    };

    const tasksByStatus = {
      todo: pendingTasks,
      'in-progress': inProgressTasks,
      'pending-approval': allTasks.filter(t => t.status === 'pending-approval').length,
      completed: completedTasks
    };

    const recentActivity = allTasks
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10);

    res.json({
      success: true,
      stats: {
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks,
        overdueTasks,
        totalProjects: userProjects.length,
        activeProjects: userProjects.filter(p => p.status === 'active').length,
        completedProjects: userProjects.filter(p => p.status === 'completed').length
      },
      tasksByPriority,
      tasksByStatus,
      leaderboard: leaderboard.slice(0, 10),
      recentActivity,
      overallProductivity: totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard',
      error: error.message
    });
  }
};

exports.getTeamStats = async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const { data: projectRow, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw error;
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const accessible = await getAccessibleProjectIds(req.user);
    if (req.user.role !== 'admin' && !accessible.includes(projectId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project'
      });
    }

    const [membersRes, tasksRes, creatorRes] = await Promise.all([
      supabase.from('project_members').select('*').eq('project_id', projectId),
      supabase.from('tasks').select('*').eq('project_id', projectId),
      supabase.from('users').select('*').eq('id', projectRow.created_by).maybeSingle()
    ]);

    if (membersRes.error) throw membersRes.error;
    if (tasksRes.error) throw tasksRes.error;
    if (creatorRes.error) throw creatorRes.error;

    const memberUserIds = (membersRes.data || []).map(member => member.user_id);
    const usersRes = memberUserIds.length
      ? await supabase.from('users').select('*').in('id', memberUserIds)
      : { data: [] };

    if (usersRes.error) throw usersRes.error;

    const userMap = new Map((usersRes.data || []).map(user => [user.id, user]));
    const tasks = await hydrateTasks(tasksRes.data || []);

    const teamStats = (membersRes.data || []).map(member => {
      const user = userMap.get(member.user_id);
      const memberTasks = tasks.filter(t => t.assignedTo?._id === member.user_id);
      const completed = memberTasks.filter(t => t.status === 'completed').length;
      const productivity = memberTasks.length > 0
        ? Math.round((completed / memberTasks.length) * 100)
        : 0;

      return {
        member: {
          _id: member.user_id,
          name: user?.name,
          avatar: user?.avatar_url,
          email: user?.email
        },
        totalAssigned: memberTasks.length,
        completed,
        inProgress: memberTasks.filter(t => t.status === 'in-progress').length,
        todo: memberTasks.filter(t => t.status === 'todo').length,
        overdue: memberTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed').length,
        productivity
      };
    });

    const ownerTasks = tasks.filter(t => t.createdBy?._id === projectRow.created_by);
    const ownerCompleted = ownerTasks.filter(t => t.status === 'completed').length;
    const ownerProductivity = ownerTasks.length > 0
      ? Math.round((ownerCompleted / ownerTasks.length) * 100)
      : 0;

    teamStats.unshift({
      member: {
        _id: creatorRes.data.id,
        name: creatorRes.data.name,
        avatar: creatorRes.data.avatar_url,
        email: creatorRes.data.email
      },
      totalAssigned: ownerTasks.length,
      completed: ownerCompleted,
      inProgress: ownerTasks.filter(t => t.status === 'in-progress').length,
      todo: ownerTasks.filter(t => t.status === 'todo').length,
      overdue: ownerTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed').length,
      productivity: ownerProductivity,
      isOwner: true
    });

    res.json({
      success: true,
      project: {
        _id: projectRow.id,
        title: projectRow.title,
        progress: projectRow.progress
      },
      teamStats: teamStats.sort((a, b) => b.productivity - a.productivity)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team stats',
      error: error.message
    });
  }
};
