const { supabase } = require('../config/supabase');
const { hydrateTask, getUsersByIds } = require('../services/repository');
const { toCamelUser } = require('../services/formatters');

async function canAccessTask(task, user) {
  if (user.role === 'admin') return true;
  const projectId = task.projectId?._id || task.projectId;
  if (!projectId) return false;

  const { data: projectRow, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !projectRow) return false;
  if (projectRow.created_by === user.id) return true;

  const { data: memberRows, error: memberError } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id);

  if (memberError) return false;
  return (memberRows || []).length > 0;
}

async function hydrateComment(row) {
  const users = row.author_id ? await getUsersByIds([row.author_id]) : [];
  const mentions = Array.isArray(row.mentions) && row.mentions.length
    ? await getUsersByIds(row.mentions)
    : [];

  return {
    _id: row.id,
    id: row.id,
    content: row.content,
    taskId: row.task_id,
    author: toCamelUser(users[0]),
    mentions: mentions.map(toCamelUser),
    isEdited: row.is_edited,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

exports.getComments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { data: taskRow, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();

    if (error) throw error;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const task = await hydrateTask(taskRow);
    if (!(await canAccessTask(task, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access comments for this task'
      });
    }

    const { data, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (commentsError) throw commentsError;

    const comments = [];
    for (const row of data || []) {
      comments.push(await hydrateComment(row));
    }

    res.json({
      success: true,
      comments
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments',
      error: error.message
    });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content, mentions = [] } = req.body;

    const { data: taskRow, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
    if (error) throw error;
    if (!taskRow) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const task = await hydrateTask(taskRow);
    if (!(await canAccessTask(task, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to comment on this task'
      });
    }

    const { data, error: insertError } = await supabase
      .from('comments')
      .insert([{
        task_id: taskId,
        author_id: req.user.id,
        content,
        mentions
      }])
      .select('*')
      .single();

    if (insertError) throw insertError;

    const comment = await hydrateComment(data);

    res.status(201).json({
      success: true,
      comment
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating comment',
      error: error.message
    });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const { data: commentRow, error } = await supabase.from('comments').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!commentRow) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    if (commentRow.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this comment'
      });
    }

    const { data, error: updateError } = await supabase
      .from('comments')
      .update({ content, is_edited: true })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      comment: await hydrateComment(data)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating comment',
      error: error.message
    });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: commentRow, error } = await supabase.from('comments').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!commentRow) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    if (commentRow.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment'
      });
    }

    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting comment',
      error: error.message
    });
  }
};
