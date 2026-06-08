const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { supabase } = require('../config/supabase');
const { toCamelUser } = require('../services/formatters');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const toUserPayload = (user) => ({
  id: user._id || user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  avatarUrl: user.avatarUrl,
  isActive: user.isActive
});

async function findOrCreateGoogleUser(profile) {
  const googleId = profile.sub;
  const email = profile.email;
  const name = profile.name || profile.given_name || email.split('@')[0];
  const avatarUrl = profile.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;

  const { data: existingByGoogle, error: byGoogleError } = await supabase
    .from('users')
    .select('*')
    .eq('google_id', googleId)
    .maybeSingle();

  if (byGoogleError) throw byGoogleError;

  if (existingByGoogle) {
    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        name,
        email,
        avatar_url: avatarUrl
      })
      .eq('id', existingByGoogle.id)
      .select('*')
      .single();

    if (updateError) throw updateError;
    return updated;
  }

  const { data: existingByEmail, error: byEmailError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (byEmailError) throw byEmailError;

  if (existingByEmail) {
    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        google_id: googleId,
        name,
        avatar_url: avatarUrl
      })
      .eq('id', existingByEmail.id)
      .select('*')
      .single();

    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert([{
      google_id: googleId,
      name,
      email,
      avatar_url: avatarUrl,
      role: 'member',
      is_active: true
    }])
    .select('*')
    .single();

  if (createError) throw createError;
  return created;
}

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const userRow = await findOrCreateGoogleUser(payload);
    const user = toCamelUser(userRow);

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: toUserPayload(user)
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Email/password login is disabled. Use Google Sign-In.'
  });
};

exports.signup = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Email/password signup is disabled. Use Google Sign-In.'
  });
};

exports.getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      user: toUserPayload(req.user)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error getting user',
      error: error.message
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      users: (data || []).map(row => toUserPayload(toCamelUser(row)))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, isActive } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update user roles'
      });
    }

    const updates = {};
    if (role) updates.role = role;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: toUserPayload(toCamelUser(data))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating user role',
      error: error.message
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create users'
      });
    }

    const { name, email, role } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{
        name,
        email,
        role: role || 'member',
        google_id: null,
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || email)}`,
        is_active: true
      }])
      .select('*')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: toUserPayload(toCamelUser(data))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

exports.disableUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can disable users'
      });
    }

    const { userId } = req.params;
    const { isActive } = req.body;

    if (userId === req.user.id && isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot disable your own account'
      });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ is_active: isActive !== undefined ? isActive : false })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;

    const user = toCamelUser(data);

    res.json({
      success: true,
      message: user.isActive ? 'User enabled successfully' : 'User disabled successfully',
      user: toUserPayload(user)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating account status',
      error: error.message
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete users'
      });
    }

    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};
