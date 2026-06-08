const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabase');
const { hydrateTask, hydrateProject, getProjectMembers, getUsersByIds } = require('../services/repository');
const { toCamelUser } = require('../services/formatters');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function canAccessProject(projectId, user) {
  if (user.role === 'admin') return true;

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

async function resolveFileProject({ taskId, projectId }) {
  if (taskId) {
    const { data: taskRow, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
    if (error || !taskRow) return null;
    const task = await hydrateTask(taskRow);
    return task.projectId?._id ? task.projectId : null;
  }

  if (!projectId) return null;
  const { data: projectRow, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !projectRow) return null;
  return hydrateProject(projectRow);
}

async function getFileById(id) {
  const { data, error } = await supabase.from('files').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function hydrateFile(fileRow) {
  if (!fileRow) return null;
  const users = fileRow.uploaded_by ? await getUsersByIds([fileRow.uploaded_by]) : [];
  const uploader = users[0] ? toCamelUser(users[0]) : null;
  return {
    _id: fileRow.id,
    id: fileRow.id,
    filename: fileRow.file_name,
    originalName: fileRow.original_name,
    mimeType: fileRow.mime_type,
    size: fileRow.size_bytes,
    url: fileRow.file_url,
    taskId: fileRow.task_id,
    projectId: fileRow.project_id,
    uploadedBy: uploader,
    createdAt: fileRow.created_at
  };
}

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { taskId, projectId } = req.body;
    if (!taskId && !projectId) {
      return res.status(400).json({
        success: false,
        message: 'Task ID or Project ID is required'
      });
    }

    const project = await resolveFileProject({ taskId, projectId });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project or task not found'
      });
    }

    if (!(await canAccessProject(project._id || project.id, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload files for this project'
      });
    }

    const { data, error } = await supabase
      .from('files')
      .insert([{
        file_name: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
        file_url: `/uploads/${req.file.filename}`,
        task_id: taskId || null,
        project_id: projectId || null,
        uploaded_by: req.user.id
      }])
      .select('*')
      .single();

    if (error) throw error;

    const file = await hydrateFile(data);

    res.status(201).json({
      success: true,
      file
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
};

exports.getFiles = async (req, res) => {
  try {
    const { taskId, projectId } = req.query;
    let query = supabase.from('files').select('*').order('created_at', { ascending: false });

    if (taskId) query = query.eq('task_id', taskId);
    if (projectId) query = query.eq('project_id', projectId);

    if (taskId || projectId) {
      const project = await resolveFileProject({ taskId, projectId });
      if (!project || !(await canAccessProject(project._id || project.id, req.user))) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access these files'
        });
      }
    } else if (req.user.role !== 'admin') {
      const { data: projectRows, error } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', req.user.id);
      const { data: memberRows, error: memberError } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', req.user.id);

      if (error) throw error;
      if (memberError) throw memberError;

      const allowedIds = [
        ...(projectRows || []).map(project => project.id),
        ...(memberRows || []).map(member => member.project_id)
      ];
      query = query.in('project_id', allowedIds.length ? allowedIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data, error } = await query;
    if (error) throw error;

    const files = [];
    for (const row of data || []) {
      files.push(await hydrateFile(row));
    }

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const fileRow = await getFileById(id);

    if (!fileRow) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const projectId = fileRow.project_id;
    if (!(await canAccessProject(projectId, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this file'
      });
    }

    if (fileRow.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this file'
      });
    }

    const filePath = path.join(UPLOAD_DIR, fileRow.file_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const fileRow = await getFileById(id);

    if (!fileRow) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const filePath = path.join(UPLOAD_DIR, fileRow.file_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on disk'
      });
    }

    if (!(await canAccessProject(fileRow.project_id, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this file'
      });
    }

    res.download(filePath, fileRow.original_name);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
};
