const { supabase } = require('../config/supabase');
const { hydrateTasks, hydrateProjects } = require('../services/repository');
const { toCamelUser } = require('../services/formatters');

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

exports.globalSearch = async (req, res) => {
  try {
    const { q, type, projectId, status, priority, assignedTo } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const accessible = await getAccessibleProjectIds(req.user);
    const projectIds = projectId ? [projectId] : accessible;
    if (projectId && req.user.role !== 'admin' && !accessible.includes(projectId)) {
      return res.json({
        success: true,
        results: { tasks: [], projects: [], users: [] },
        query: q
      });
    }

    const results = {
      tasks: [],
      projects: [],
      users: []
    };

    if (!type || type === 'task') {
      if (req.user.role !== 'admin' && projectIds.length === 0) {
        results.tasks = [];
      } else {
      let query = supabase
        .from('tasks')
        .select('*')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(20);

      if (projectIds.length > 0) query = query.in('project_id', projectIds);
      if (status) query = query.eq('status', status);
      if (priority) query = query.eq('priority', priority);
      if (assignedTo) query = query.eq('assignee_id', assignedTo);

      const { data, error } = await query;
      if (error) throw error;
      results.tasks = await hydrateTasks(data || []);
      }
    }

    if (!type || type === 'project') {
      if (req.user.role !== 'admin' && accessible.length === 0) {
        results.projects = [];
      } else {
      let query = supabase
        .from('projects')
        .select('*')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(10);

      if (req.user.role !== 'admin') {
        query = query.in('id', accessible);
      }

      const { data, error } = await query;
      if (error) throw error;
      results.projects = await hydrateProjects(data || []);
      }
    }

    if (!type || type === 'user') {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);

      if (error) throw error;
      results.users = (data || []).map(user => toCamelUser(user));
    }

    res.json({
      success: true,
      results,
      query: q
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: error.message
    });
  }
};

exports.searchTasks = async (req, res) => {
  try {
    const { q, projectId, status, priority, assignedTo, dueBefore, dueAfter } = req.query;

    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
    const accessible = await getAccessibleProjectIds(req.user);

    if (req.user.role !== 'admin') {
      if (projectId && !accessible.includes(projectId)) {
        return res.json({
          success: true,
          tasks: [],
          total: 0
        });
      }
      if (accessible.length === 0) {
        return res.json({
          success: true,
          tasks: [],
          total: 0
        });
      }
      query = query.in('project_id', accessible);
    }

    if (q) {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (assignedTo) query = query.eq('assignee_id', assignedTo);
    if (dueBefore) query = query.lte('due_date', dueBefore);
    if (dueAfter) query = query.gte('due_date', dueAfter);

    const { data, error } = await query;
    if (error) throw error;

    const tasks = await hydrateTasks(data || []);

    res.json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error searching tasks',
      error: error.message
    });
  }
};

exports.getFilters = async (req, res) => {
  try {
    const accessible = await getAccessibleProjectIds(req.user);
    const { data: taskRows, error } = await supabase
      .from('tasks')
      .select('status, priority, assignee_id, project_id')
      .in('project_id', accessible.length ? accessible : ['00000000-0000-0000-0000-000000000000']);

    if (error) throw error;

    const usersRes = await supabase.from('users').select('*');
    const projectsRes = await supabase.from('projects').select('*').in('id', accessible);

    if (usersRes.error) throw usersRes.error;
    if (projectsRes.error) throw projectsRes.error;

    const statuses = [...new Set((taskRows || []).map(task => task.status))].sort();
    const priorities = [...new Set((taskRows || []).map(task => task.priority))].sort();

    res.json({
      success: true,
      filters: {
        statuses,
        priorities,
        users: (usersRes.data || []).map(user => toCamelUser(user)),
        projects: (projectsRes.data || []).map(project => ({
          _id: project.id,
          title: project.title
        }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filters',
      error: error.message
    });
  }
};
