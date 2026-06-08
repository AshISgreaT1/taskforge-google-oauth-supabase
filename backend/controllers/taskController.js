const { supabase } = require('../config/supabase');
const notificationController = require('./notificationController');
const { sendEmail } = require('../services/emailService');
const {
  getTasksByFilter,
  hydrateTask,
  hydrateTasks,
  hydrateProject,
  getProjectMembers,
  getUsersByIds,
  createActivity
} = require('../services/repository');
const { toCamelUser } = require('../services/formatters');

const aiSubtasks = {
  'build landing page': [
    'Design UI mockup',
    'Create navbar component',
    'Build hero section',
    'Implement responsive layout',
    'Add footer section',
    'Test cross-browser compatibility',
    'Optimize images and assets'
  ],
  'build website': [
    'Design homepage layout',
    'Create navigation system',
    'Build content pages',
    'Implement contact forms',
    'Add responsive design',
    'Test and fix bugs',
    'Deploy to production'
  ],
  'build app': [
    'Design app architecture',
    'Create UI components',
    'Implement core features',
    'Add user authentication',
    'Build database integration',
    'Test functionality',
    'Deploy mobile app'
  ],
  'create landing page': [
    'Wireframe design',
    'Build HTML structure',
    'Style with CSS',
    'Add interactive elements',
    'Test responsiveness',
    'Optimize performance'
  ],
  'build dashboard': [
    'Design dashboard layout',
    'Create sidebar navigation',
    'Build data visualization',
    'Add user widgets',
    'Implement real-time updates',
    'Test and validate'
  ],
  'implement authentication': [
    'Design login/signup forms',
    'Set up JWT tokens',
    'Create password reset flow',
    'Add social login',
    'Implement session management',
    'Security testing'
  ],
  default: [
    'Research and planning',
    'Design phase',
    'Implementation',
    'Testing',
    'Review and refinement',
    'Deployment'
  ]
};

function generateSubtasks(mainTaskTitle) {
  const titleLower = mainTaskTitle.toLowerCase();
  let subtasks = [];

  for (const [key, value] of Object.entries(aiSubtasks)) {
    if (titleLower.includes(key)) {
      subtasks = value;
      break;
    }
  }

  if (subtasks.length === 0) {
    subtasks = aiSubtasks.default;
  }

  return subtasks;
}

function predictDelay(project, tasks) {
  const now = new Date();
  const endDate = project.endDate ? new Date(project.endDate) : null;

  if (!endDate) return null;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const overdueTasks = tasks.filter(t =>
    t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed'
  ).length;

  if (totalTasks === 0 || completedTasks === totalTasks) return null;

  const timeRemaining = endDate - now;
  const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
  const tasksRemaining = totalTasks - completedTasks;
  const avgTasksPerDay = completedTasks / Math.max(1, (now - new Date(project.createdAt)) / (1000 * 60 * 60 * 24));
  const predictedDaysNeeded = avgTasksPerDay > 0 ? tasksRemaining / avgTasksPerDay : tasksRemaining * 2;

  if (predictedDaysNeeded > daysRemaining && overdueTasks > 0) {
    const delayDays = Math.ceil(predictedDaysNeeded - daysRemaining);
    return `This project may be delayed by ${delayDays} day${delayDays > 1 ? 's' : ''}`;
  }

  if (overdueTasks > totalTasks * 0.3) {
    return 'This project has significant overdue tasks';
  }

  return null;
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

async function fetchTasksForProject(projectId) {
  const rows = await getTasksByFilter({ projectId });
  return hydrateTasks(rows);
}

async function refreshProjectProgress(projectId) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('project_id', projectId);

  if (error) throw error;

  const all = tasks || [];
  const progress = all.length === 0 ? 0 : Math.round((all.filter(task => task.status === 'completed').length / all.length) * 100);

  const updates = { progress };
  if (progress === 100) {
    updates.status = 'completed';
  }

  const { error: updateError } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (updateError) throw updateError;
}

function getAllowedNextStatuses(task, user) {
  const isAdmin = user.role === 'admin';
  const isAssigned = task.assignedTo?._id === user.id;
  const isCreator = task.createdBy?._id === user.id;

  if (!isAdmin && !isAssigned && !isCreator) return [];
  if (task.status === 'todo') return ['in-progress'];
  if (task.status === 'in-progress') return ['pending-approval', 'completed'];
  if (task.status === 'pending-approval') return ['pending-approval', 'completed', 'in-progress'];
  return ['completed'];
}

async function notifyTaskRecipients(task, senderId, type, title, message, sendMail = true) {
  const recipients = new Map();
  if (task.assignedTo?._id) recipients.set(task.assignedTo._id, task.assignedTo);
  if (task.createdBy?._id) recipients.set(task.createdBy._id, task.createdBy);

  for (const [recipientId, recipient] of recipients.entries()) {
    if (recipientId === senderId) continue;

    await notificationController.createNotification({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      message,
      projectId: task.projectId?._id,
      taskId: task._id
    });

    if (sendMail && recipient.email) {
      await sendEmail({
        to: recipient.email,
        subject: title,
        text: message,
        html: `<p>${message}</p><p><strong>Task:</strong> ${task.title}</p>`
      });
    }
  }
}

exports.getTasks = async (req, res) => {
  try {
    const { projectId, status, priority, assignedTo } = req.query;
    const allowedProjectIds = await getAccessibleProjectIds(req.user);

    if (projectId && !allowedProjectIds.includes(projectId)) {
      return res.json({ success: true, tasks: [] });
    }

    const rows = await getTasksByFilter({
      projectId: projectId || undefined,
      status: status || undefined,
      priority: priority || undefined,
      assignedTo: assignedTo || undefined
    });

    const filteredRows = req.user.role === 'admin'
      ? rows
      : rows.filter(task => allowedProjectIds.includes(task.project_id));

    const tasks = await hydrateTasks(filteredRows);
    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks',
      error: error.message
    });
  }
};

exports.getTask = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const task = await hydrateTask(data);
    const projectId = task.projectId?._id || task.projectId;
    const allowedProjectIds = await getAccessibleProjectIds(req.user);
    if (req.user.role !== 'admin' && !allowedProjectIds.includes(projectId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this task'
      });
    }

    const { data: subtaskRows, error: subtaskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('parent_task_id', req.params.id)
      .order('created_at', { ascending: false });

    if (subtaskError) throw subtaskError;

    const subtasks = await hydrateTasks(subtaskRows || []);

    res.json({
      success: true,
      task,
      subtasks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching task',
      error: error.message
    });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { title, description, assignedTo, priority, dueDate, projectId, generateSubtasks: generateAI } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create and assign tasks'
      });
    }

    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .insert([{
        title,
        description,
        assignee_id: assignedTo || null,
        priority: priority || 'medium',
        status: 'todo',
        due_date: dueDate || null,
        project_id: projectId,
        creator_id: req.user.id
      }])
      .select('*')
      .single();

    if (taskError) throw taskError;

    await createActivity({
      taskId: taskRow.id,
      userId: req.user.id,
      action: 'task_created',
      newData: taskRow
    });

    let subtasks = [];
    if (generateAI) {
      const subtaskTitles = generateSubtasks(title);
      for (const subtaskTitle of subtaskTitles) {
        const { data: subtaskRow, error: subtaskError } = await supabase
          .from('tasks')
          .insert([{
            title: subtaskTitle,
            description: `Subtask of: ${title}`,
            assignee_id: assignedTo || null,
            priority: priority || 'medium',
            status: 'todo',
            due_date: dueDate || null,
            project_id: projectId,
            creator_id: req.user.id,
            is_subtask: true,
            parent_task_id: taskRow.id
          }])
          .select('*')
          .single();

        if (subtaskError) throw subtaskError;
        subtasks.push(subtaskRow);
      }
    }

    const task = await hydrateTask(taskRow);
    const hydratedSubtasks = await hydrateTasks(subtasks);

    await refreshProjectProgress(projectId);

    if (assignedTo) {
      await notifyTaskRecipients(task, req.user.id, 'task_assigned', 'Task Assigned', `You have been assigned "${task.title}"`);
    }

    res.status(201).json({
      success: true,
      task,
      subtasks: hydratedSubtasks,
      aiGenerated: generateAI ? hydratedSubtasks.length > 0 : false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating task',
      error: error.message
    });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { title, description, assignedTo, priority, dueDate, status } = req.body;

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can edit tasks'
      });
    }

    const currentTask = await hydrateTask(taskRow);
    const previousAssignedTo = currentTask.assignedTo?._id;

    if (status) {
      const allowed = getAllowedNextStatuses(currentTask, req.user);
      if (!allowed.includes(status)) {
        return res.status(403).json({
          success: false,
          message: `Cannot move task from ${currentTask.status} to ${status}`
        });
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assignedTo !== undefined) updates.assignee_id = assignedTo || null;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.due_date = dueDate || null;
    if (status !== undefined) updates.status = status;

    if (status === 'completed') {
      updates.approval_status = 'approved';
      updates.completed_at = new Date().toISOString();
      updates.approved_by = req.user.id;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    await createActivity({
      taskId: updatedRow.id,
      userId: req.user.id,
      action: status && status !== currentTask.status ? 'status_changed' : 'task_updated',
      previousData: taskRow,
      newData: updatedRow
    });

    const task = await hydrateTask(updatedRow);

    await refreshProjectProgress(task.projectId._id);

    if (assignedTo && assignedTo !== previousAssignedTo) {
      await createActivity({
        taskId: task._id,
        userId: req.user.id,
        action: 'task_assigned',
        previousData: { assignedTo: previousAssignedTo },
        newData: { assignedTo }
      });
      await notifyTaskRecipients(task, req.user.id, 'task_assigned', 'Task Assigned', `You have been assigned "${task.title}"`);
    }

    if (status === 'completed') {
      await createActivity({
        taskId: task._id,
        userId: req.user.id,
        action: 'task_completed',
        previousData: taskRow,
        newData: updatedRow
      });
      await notifyTaskRecipients(task, req.user.id, 'task_completed', 'Task Completed', `"${task.title}" has been completed`);
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating task',
      error: error.message
    });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const task = await hydrateTask(taskRow);
    const allowed = getAllowedNextStatuses(task, req.user);
    if (!allowed.includes(status)) {
      return res.status(403).json({
        success: false,
        message: `Cannot move task from ${task.status} to ${status}`
      });
    }

    const updates = { status };
    if (status === 'completed') {
      updates.approval_status = 'approved';
      updates.completed_at = new Date().toISOString();
      updates.approved_by = req.user.id;
    }
    if (status !== 'completed') {
      updates.completed_at = null;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    await createActivity({
      taskId: updatedRow.id,
      userId: req.user.id,
      action: status === 'completed' ? 'task_completed' : 'status_changed',
      previousData: taskRow,
      newData: updatedRow
    });

    const updatedTask = await hydrateTask(updatedRow);
    await refreshProjectProgress(updatedTask.projectId._id);

    if (status === 'completed') {
      await notifyTaskRecipients(updatedTask, req.user.id, 'task_completed', 'Task Completed', `"${updatedTask.title}" has been completed`);
    }

    res.json({
      success: true,
      task: updatedTask
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating task status',
      error: error.message
    });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete tasks'
      });
    }

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) throw deleteError;

    await refreshProjectProgress(taskRow.project_id);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting task',
      error: error.message
    });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can view approvals'
      });
    }

    const rows = await getTasksByFilter({ status: 'pending-approval' });
    const tasks = await hydrateTasks(rows);

    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching approvals',
      error: error.message
    });
  }
};

exports.approveTask = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can approve tasks'
      });
    }

    const { note } = req.body;
    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (taskRow.status !== 'pending-approval') {
      return res.status(400).json({
        success: false,
        message: 'Only pending approval tasks can be approved'
      });
    }

    const updates = {
      status: 'completed',
      approval_status: 'approved',
      approval_note: note || '',
      approved_by: req.user.id,
      completed_at: new Date().toISOString()
    };

    const { data: updatedRow, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    await createActivity({
      taskId: updatedRow.id,
      userId: req.user.id,
      action: 'task_completed',
      previousData: taskRow,
      newData: updatedRow
    });

    const task = await hydrateTask(updatedRow);
    await refreshProjectProgress(task.projectId._id);
    await notifyTaskRecipients(task, req.user.id, 'task_completed', 'Task Approved', `"${task.title}" was approved and completed`);

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error approving task',
      error: error.message
    });
  }
};

exports.rejectTask = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can reject tasks'
      });
    }

    const { note } = req.body;
    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw taskError;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (taskRow.status !== 'pending-approval') {
      return res.status(400).json({
        success: false,
        message: 'Only pending approval tasks can be rejected'
      });
    }

    const updates = {
      status: 'in-progress',
      approval_status: 'rejected',
      approval_note: note || '',
      approved_by: req.user.id,
      completed_at: null
    };

    const { data: updatedRow, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    await createActivity({
      taskId: updatedRow.id,
      userId: req.user.id,
      action: 'task_updated',
      previousData: taskRow,
      newData: updatedRow
    });

    const task = await hydrateTask(updatedRow);
    await refreshProjectProgress(task.projectId._id);
    await notifyTaskRecipients(task, req.user.id, 'task_rejected', 'Approval Rejected', `"${task.title}" was sent back to In Progress`);

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting task',
      error: error.message
    });
  }
};

exports.getAIPrediction = async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!projectRow) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const project = await hydrateProject(projectRow);
    const allowedProjectIds = await getAccessibleProjectIds(req.user);
    if (req.user.role !== 'admin' && !allowedProjectIds.includes(projectId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project'
      });
    }

    const { data: taskRows, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId);

    if (tasksError) throw tasksError;

    const tasks = await hydrateTasks(taskRows || []);
    const prediction = predictDelay(project, tasks);

    res.json({
      success: true,
      prediction,
      projectId,
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === 'completed').length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error getting AI prediction',
      error: error.message
    });
  }
};
