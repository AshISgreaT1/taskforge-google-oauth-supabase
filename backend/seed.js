const dotenv = require('dotenv');
const { supabase } = require('./config/supabase');

dotenv.config();

async function resetTables() {
  await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('files').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('comments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('task_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('project_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

async function main() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    await resetTables();
    console.log('Cleared existing data');

    const sampleUsers = [
      {
        google_id: 'google-admin',
        name: 'Alex Johnson',
        email: 'admin@taskforge.ai',
        avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Alex%20Johnson',
        role: 'admin',
        is_active: true
      },
      {
        google_id: 'google-sarah',
        name: 'Sarah Chen',
        email: 'sarah@taskforge.ai',
        avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Sarah%20Chen',
        role: 'member',
        is_active: true
      },
      {
        google_id: 'google-mike',
        name: 'Mike Williams',
        email: 'mike@taskforge.ai',
        avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Mike%20Williams',
        role: 'member',
        is_active: true
      },
      {
        google_id: 'google-emily',
        name: 'Emily Davis',
        email: 'emily@taskforge.ai',
        avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Emily%20Davis',
        role: 'member',
        is_active: true
      }
    ];

    const { data: users, error: usersError } = await supabase
      .from('users')
      .insert(sampleUsers)
      .select('*');

    if (usersError) throw usersError;

    const userMap = new Map(users.map(user => [user.email, user]));
    const adminUser = userMap.get('admin@taskforge.ai');
    const member1 = userMap.get('sarah@taskforge.ai');
    const member2 = userMap.get('mike@taskforge.ai');
    const member3 = userMap.get('emily@taskforge.ai');

    const projectsPayload = [
      {
        title: 'TaskForge AI Platform',
        description: 'AI-powered project management platform with smart task breakdown and delay prediction.',
        created_by: adminUser.id,
        progress: 65,
        end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Mobile App Development',
        description: 'Cross-platform mobile application for team collaboration.',
        created_by: adminUser.id,
        progress: 40,
        status: 'active',
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Website Redesign',
        description: 'Modern redesign of company website with improved UX.',
        created_by: adminUser.id,
        progress: 85,
        status: 'active',
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .insert(projectsPayload)
      .select('*');

    if (projectsError) throw projectsError;

    const [project1, project2, project3] = projects;

    const projectMembers = [
      { project_id: project1.id, user_id: member1.id, role: 'frontend-dev', added_by: adminUser.id },
      { project_id: project1.id, user_id: member2.id, role: 'backend-dev', added_by: adminUser.id },
      { project_id: project2.id, user_id: member1.id, role: 'frontend-dev', added_by: adminUser.id },
      { project_id: project2.id, user_id: member3.id, role: 'designer', added_by: adminUser.id },
      { project_id: project3.id, user_id: member2.id, role: 'backend-dev', added_by: adminUser.id },
      { project_id: project3.id, user_id: member3.id, role: 'designer', added_by: adminUser.id }
    ];

    const { error: membersError } = await supabase
      .from('project_members')
      .insert(projectMembers);

    if (membersError) throw membersError;

    const tasksData = [
      ['Design System Implementation', 'Create comprehensive design system with tokens and components', project1.id, member1.id, 'high', 'completed', -5],
      ['Backend API Development', 'Build RESTful API with Express and Supabase', project1.id, member2.id, 'critical', 'in-progress', 3],
      ['Frontend Dashboard', 'Create main dashboard with analytics and charts', project1.id, member1.id, 'high', 'in-progress', 5],
      ['User Authentication', 'Implement Google OAuth with role-based access control', project1.id, member2.id, 'critical', 'completed', -2],
      ['AI Task Breakdown Feature', 'Smart subtask generation based on main task', project1.id, member1.id, 'medium', 'todo', 10],
      ['iOS App Setup', 'Initialize iOS project', project2.id, member1.id, 'high', 'completed', -10],
      ['Android App Setup', 'Initialize Android project', project2.id, member3.id, 'high', 'completed', -8],
      ['Push Notifications', 'Implement push notification system', project2.id, member1.id, 'medium', 'in-progress', 15],
      ['UI Wireframes', 'Create wireframes for all app screens', project2.id, member3.id, 'high', 'completed', -12],
      ['Homepage Redesign', 'Modern homepage with hero section and features', project3.id, member2.id, 'critical', 'completed', -3],
      ['About Page', 'Create company about page', project3.id, member3.id, 'medium', 'completed', -1],
      ['Contact Form', 'Implement contact form with validation', project3.id, member2.id, 'medium', 'in-progress', 2],
      ['SEO Optimization', 'Improve search engine optimization', project3.id, member3.id, 'low', 'todo', 5]
    ].map(([title, description, projectId, assigneeId, priority, status, dueOffsetDays]) => ({
      title,
      description,
      project_id: projectId,
      creator_id: adminUser.id,
      assignee_id: assigneeId,
      priority,
      status,
      due_date: new Date(Date.now() + dueOffsetDays * 24 * 60 * 60 * 1000).toISOString()
    }));

    const { error: tasksError } = await supabase
      .from('tasks')
      .insert(tasksData);

    if (tasksError) throw tasksError;

    console.log('Seed data created successfully');
    console.log('Admin: admin@taskforge.ai');
    console.log('Member: sarah@taskforge.ai');
    console.log('Member: mike@taskforge.ai');
    console.log('Member: emily@taskforge.ai');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exitCode = 1;
  }
}

main();
