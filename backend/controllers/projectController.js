const { supabase } = require('../config/supabase');
const notificationController = require('./notificationController');
const {
  hydrateProjects,
  hydrateProject,
  hydrateTasks,
  getProjectMembers,
  getUsersByIds
} = require('../services/repository');

const PROJECT_ROLES = ['team-lead', 'frontend-dev', 'backend-dev', 'qa', 'designer', 'member'];

function memberUserId(member) {
  return (member.user?._id || member.user || member._id || member).toString();
}

async function getProjectRow(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function canManageProject(user, projectRow) {
  return user.role === 'admin' || projectRow?.created_by === user.id;
}

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

async function loadProjectWithRelations(projectRow) {
  const project = await hydrateProject(projectRow);
  if (!project) return null;

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', project._id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    project,
    tasks: await hydrateTasks(tasks || [])
  };
}

exports.getProjects = async (req, res) => {
  try {
    const accessible = await getAccessibleProjectIds(req.user);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const filtered = req.user.role === 'admin'
      ? data || []
      : (data || []).filter(project => accessible.includes(project.id));

    const projects = await hydrateProjects(filtered);

    res.json({
      success: true,
      projects
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching projects',
      error: error.message
    });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { data: projectRow, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const accessible = await getAccessibleProjectIds(req.user);
    if (req.user.role !== 'admin' && !accessible.includes(req.params.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project'
      });
    }

    const loaded = await loadProjectWithRelations(projectRow);

    res.json({
      success: true,
      project: loaded.project,
      tasks: loaded.tasks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project',
      error: error.message
    });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { title, description, members, endDate } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create projects'
      });
    }

    const { data: projectRow, error } = await supabase
      .from('projects')
      .insert([{
        title,
        description,
        created_by: req.user.id,
        end_date: endDate || null
      }])
      .select('*')
      .single();

    if (error) throw error;

    if (Array.isArray(members) && members.length > 0) {
      const memberRows = members.map(member => ({
        project_id: projectRow.id,
        user_id: member.user || member.user_id || member,
        role: PROJECT_ROLES.includes(member.role) ? member.role : 'member',
        added_by: req.user.id
      }));

      const { error: memberError } = await supabase
        .from('project_members')
        .insert(memberRows);

      if (memberError) throw memberError;
    }

    const project = await hydrateProject(projectRow);
    res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating project',
      error: error.message
    });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { title, description, members, status, endDate } = req.body;

    const projectRow = await getProjectRow(req.params.id);
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!canManageProject(req.user, projectRow)) {
      return res.status(403).json({
        success: false,
        message: 'Only project owners or admins can update projects'
      });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (endDate !== undefined) updates.end_date = endDate || null;

    const { data: updatedProjectRow, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!updatedProjectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (Array.isArray(members)) {
      const { error: deleteError } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', req.params.id);

      if (deleteError) throw deleteError;

      if (members.length > 0) {
        const memberRows = members.map(member => ({
          project_id: req.params.id,
          user_id: member?.user || member?.user_id || member,
          role: PROJECT_ROLES.includes(member.role) ? member.role : 'member',
          added_by: req.user.id
        }));

        const { error: memberError } = await supabase
          .from('project_members')
          .insert(memberRows);

        if (memberError) throw memberError;
      }
    }

    const project = await hydrateProject(updatedProjectRow);

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating project',
      error: error.message
    });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const projectRow = await getProjectRow(req.params.id);
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!canManageProject(req.user, projectRow)) {
      return res.status(403).json({
        success: false,
        message: 'Only project owners or admins can delete projects'
      });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting project',
      error: error.message
    });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { memberId, role = 'member' } = req.body;

    const projectRow = await getProjectRow(req.params.id);
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!canManageProject(req.user, projectRow)) {
      return res.status(403).json({
        success: false,
        message: 'Only project owners or admins can add members'
      });
    }

    if (!PROJECT_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project role'
      });
    }

    const { data: existingProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const { error } = await supabase
      .from('project_members')
      .insert([{
        project_id: req.params.id,
        user_id: memberId,
        role,
        added_by: req.user.id
      }]);

    if (error) throw error;

    await notificationController.createNotification({
      recipient: memberId,
      sender: req.user.id,
      type: 'member_added',
      title: 'Added to Project',
      message: `You have been added to project "${existingProject.title}"`,
      projectId: existingProject.id
    });

    const project = await hydrateProject(existingProject);

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error adding member',
      error: error.message
    });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { memberId } = req.body;

    const projectRow = await getProjectRow(req.params.id);
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!canManageProject(req.user, projectRow)) {
      return res.status(403).json({
        success: false,
        message: 'Only project owners or admins can remove members'
      });
    }

    const { data: existingProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', req.params.id)
      .eq('user_id', memberId);

    if (error) throw error;

    await notificationController.createNotification({
      recipient: memberId,
      sender: req.user.id,
      type: 'member_removed',
      title: 'Removed from Project',
      message: `You have been removed from project "${existingProject.title}"`,
      projectId: existingProject.id
    });

    const project = await hydrateProject(existingProject);

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error removing member',
      error: error.message
    });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { role } = req.body;

    const projectRow = await getProjectRow(req.params.id);
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!canManageProject(req.user, projectRow)) {
      return res.status(403).json({
        success: false,
        message: 'Only project owners or admins can change member roles'
      });
    }

    if (!PROJECT_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid project role'
      });
    }

    const { data: existingProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const { error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', req.params.id)
      .eq('user_id', memberId);

    if (error) throw error;

    const project = await hydrateProject(existingProject);

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating member role',
      error: error.message
    });
  }
};
