import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Lock,
  Bell,
  Moon,
  Sun,
  Monitor,
  Globe,
  Shield,
  Save,
  Camera
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/Layout';

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    avatar: user?.avatar || ''
  });
  const [notifications, setNotifications] = useState({
    taskAssigned: true,
    taskCompleted: true,
    projectUpdates: true,
    dueDateReminders: true,
    emailNotifications: false
  });
  const [appearance, setAppearance] = useState('dark');
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Moon },
    { id: 'security', label: 'Security', icon: Shield }
  ];

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = (key) => {
    setNotifications(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      toast.success('Notification settings saved');
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-dark-400">Manage your account preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 flex-shrink-0">
          <nav className="card p-2 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1">
          {activeTab === 'profile' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold mb-6">Profile Settings</h2>

              <div className="flex items-center gap-6 mb-8">
                <div className="relative">
                  <img
                    src={profile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.name}`}
                    alt="Profile"
                    className="w-24 h-24 rounded-full bg-dark-700"
                  />
                  <button className="absolute bottom-0 right-0 p-2 bg-primary-600 rounded-full hover:bg-primary-700 transition-colors">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{profile.name}</h3>
                  <p className="text-dark-400">{profile.email}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="input-field pl-11"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="input-field pl-11"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold mb-6">Notification Preferences</h2>

              <div className="space-y-4">
                {[
                  { key: 'taskAssigned', label: 'Task Assigned', desc: 'Get notified when a task is assigned to you' },
                  { key: 'taskCompleted', label: 'Task Completed', desc: 'Get notified when a task is completed' },
                  { key: 'projectUpdates', label: 'Project Updates', desc: 'Get notified about project updates' },
                  { key: 'dueDateReminders', label: 'Due Date Reminders', desc: 'Get reminders for upcoming due dates' },
                  { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive notifications via email' }
                ].map(item => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-4 bg-dark-700/30 rounded-xl"
                  >
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-dark-400">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => handleNotificationChange(item.key)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        notifications[item.key] ? 'bg-primary-600' : 'bg-dark-600'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          notifications[item.key] ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold mb-6">Appearance Settings</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-4">Theme</label>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'system', label: 'System', icon: Monitor }
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => setAppearance(theme.id)}
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          appearance === theme.id
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-600 hover:border-dark-500'
                        }`}
                      >
                        <theme.icon className={`w-8 h-8 mx-auto mb-2 ${
                          appearance === theme.id ? 'text-primary-400' : 'text-dark-400'
                        }`} />
                        <p className="font-medium">{theme.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-4">Language</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <select className="input-field pl-11">
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <h2 className="text-lg font-semibold mb-6">Security Settings</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-4">Change Password</label>
                  <div className="space-y-4">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                      <input
                        type="password"
                        placeholder="Current password"
                        className="input-field pl-11"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                      <input
                        type="password"
                        placeholder="New password"
                        className="input-field pl-11"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                      <input
                        type="password"
                        placeholder="Confirm new password"
                        className="input-field pl-11"
                      />
                    </div>
                    <button className="btn-primary flex items-center gap-2">
                      <Save className="w-5 h-5" />
                      Update Password
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
