const { supabase } = require('../config/supabase');
const notificationController = require('./notificationController');
const { hydrateProject, getUsersByIds } = require('../services/repository');
const { toCamelUser } = require('../services/formatters');

async function hasProjectAccess(project, user) {
  if (user.role === 'admin') return true;
  if (project.createdBy?._id === user.id) return true;
  return (project.members || []).some(member => (member.user?._id || member.user || member).toString() === user.id);
}

async function getProject(projectId) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data ? hydrateProject(data) : null;
}

async function hydrateMessage(row) {
  const users = await getUsersByIds([row.sender_id]);
  return {
    _id: row.id,
    id: row.id,
    sender: toCamelUser(users[0]),
    content: row.content,
    messageType: row.message_type,
    mediaUrl: row.media_url,
    createdAt: row.created_at
  };
}

exports.getProjectChat = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!(await hasProjectAccess(project, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this project'
      });
    }

    res.json({
      success: true,
      chat: {
        projectId,
        participants: [req.user.id]
      }
    });
  } catch (error) {
    console.error('Get project chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project chat'
    });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { content, messageType, mediaUrl } = req.body;

    if (!content && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Message content or media is required'
      });
    }

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!(await hasProjectAccess(project, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this project'
      });
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        project_id: projectId,
        sender_id: req.user.id,
        content: content || mediaUrl || '',
        message_type: messageType || 'text',
        media_url: mediaUrl || null
      }])
      .select('*')
      .single();

    if (error) throw error;

    const message = await hydrateMessage(data);

    const participantIds = new Set([
      project.createdBy._id,
      ...(project.members || []).map(member => (member.user?._id || member.user || member).toString())
    ]);

    for (const recipientId of participantIds) {
      if (recipientId === req.user.id) continue;
      await notificationController.createNotification({
        recipient: recipientId,
        sender: req.user.id,
        type: 'new_message',
        title: 'New Chat Message',
        message: `${req.user.name} sent a message in ${project.title}`,
        projectId
      });
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message'
    });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50, before } = req.query;
    const project = await getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (!(await hasProjectAccess(project, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this project'
      });
    }

    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(parseInt(limit, 10));

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) throw error;

    const messages = [];
    for (const row of data || []) {
      messages.push(await hydrateMessage(row));
    }

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages'
    });
  }
};

exports.addParticipant = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId } = req.body;

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add members'
      });
    }

    const member = (project.members || []).some(m => (m.user?._id || m.user || m).toString() === userId);
    const owner = project.createdBy?._id === userId;
    if (!member && !owner) {
      return res.status(403).json({
        success: false,
        message: 'Only project members can be added to project chat'
      });
    }

    await notificationController.createNotification({
      recipient: userId,
      sender: req.user.id,
      type: 'member_added',
      title: 'Added to Project',
      message: `You have been added to project "${project.title}"`,
      projectId
    });

    res.json({
      success: true,
      message: 'Participant added successfully'
    });
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding participant'
    });
  }
};

exports.removeParticipant = async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove members'
      });
    }

    await notificationController.createNotification({
      recipient: userId,
      sender: req.user.id,
      type: 'member_removed',
      title: 'Removed from Project',
      message: `You have been removed from project "${project.title}"`,
      projectId
    });

    res.json({
      success: true,
      message: 'Participant removed successfully'
    });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing participant'
    });
  }
};
