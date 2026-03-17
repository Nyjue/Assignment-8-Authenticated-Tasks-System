const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database', 'task_management.db');

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  store: new SQLiteStore({ 
    db: 'sessions.db', 
    dir: './database',
    table: 'sessions'
  }),
  secret: process.env.SESSION_SECRET || 'dev_secret_key_change_this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    httpOnly: true,
    secure: false // Set to true only if using HTTPS
  }
}));

// Database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// ============ AUTHENTICATION MIDDLEWARE ============
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Attach user info to request for use in routes
  db.get('SELECT id, username, email FROM users WHERE id = ?', 
    [req.session.userId], 
    (err, user) => {
      if (err || !user) {
        req.session.destroy();
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = user;
      next();
    }
  );
};

// ============ AUTHENTICATION ROUTES ============

// REGISTER - POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  // Validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert new user
      db.run(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user' });
          }
          
          res.status(201).json({ 
            message: '✅ User registered successfully',
            userId: this.lastID 
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN - POST /api/login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  // Find user by email
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Compare passwords
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    
    res.json({ 
      message: '✅ Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  });
});

// LOGOUT - POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    
    res.clearCookie('connect.sid');
    res.json({ message: '✅ Logout successful' });
  });
});

// CHECK SESSION - GET /api/me (useful for testing)
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ============ PROTECTED PROJECT ROUTES ============

// GET all projects for authenticated user
app.get('/api/projects', requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.id],
    (err, projects) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch projects' });
      }
      res.json(projects);
    }
  );
});

// GET single project (verify ownership)
app.get('/api/projects/:id', requireAuth, (req, res) => {
  db.get(
    `SELECT * FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id],
    (err, project) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch project' });
      }
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    }
  );
});

// CREATE new project
app.post('/api/projects', requireAuth, (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  
  db.run(
    `INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
    [name, description, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create project' });
      }
      
      db.get(`SELECT * FROM projects WHERE id = ?`, [this.lastID], (err, project) => {
        if (err) {
          return res.status(500).json({ error: 'Project created but failed to retrieve' });
        }
        res.status(201).json(project);
      });
    }
  );
});

// UPDATE project (verify ownership)
app.put('/api/projects/:id', requireAuth, (req, res) => {
  const { name, description } = req.body;
  
  db.run(
    `UPDATE projects SET name = COALESCE(?, name), 
        description = COALESCE(?, description), 
        updated_at = CURRENT_TIMESTAMP 
     WHERE id = ? AND user_id = ?`,
    [name, description, req.params.id, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update project' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      
      db.get(`SELECT * FROM projects WHERE id = ?`, [req.params.id], (err, project) => {
        res.json(project);
      });
    }
  );
});

// DELETE project (verify ownership)
app.delete('/api/projects/:id', requireAuth, (req, res) => {
  db.run(
    `DELETE FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete project' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      res.json({ message: '✅ Project deleted successfully' });
    }
  );
});

// ============ PROTECTED TASK ROUTES ============

// GET tasks for a specific project (verify project ownership)
app.get('/api/projects/:projectId/tasks', requireAuth, (req, res) => {
  // First verify project ownership
  db.get(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.projectId, req.user.id],
    (err, project) => {
      if (err || !project) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      
      // Then fetch tasks
      db.all(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC`,
        [req.params.projectId],
        (err, tasks) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch tasks' });
          }
          res.json(tasks);
        }
      );
    }
  );
});

// CREATE task for a project
app.post('/api/projects/:projectId/tasks', requireAuth, (req, res) => {
  const { title, description } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  
  // Verify project ownership first
  db.get(
    `SELECT id FROM projects WHERE id = ? AND user_id = ?`,
    [req.params.projectId, req.user.id],
    (err, project) => {
      if (err || !project) {
        return res.status(404).json({ error: 'Project not found or access denied' });
      }
      
      db.run(
        `INSERT INTO tasks (title, description, project_id) VALUES (?, ?, ?)`,
        [title, description, req.params.projectId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create task' });
          }
          
          db.get(`SELECT * FROM tasks WHERE id = ?`, [this.lastID], (err, task) => {
            res.status(201).json(task);
          });
        }
      );
    }
  );
});

// UPDATE task (verify task belongs to user's project)
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const { title, description, completed } = req.body;
  
  // First verify task belongs to user's project
  db.get(
    `SELECT t.* FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.id = ? AND p.user_id = ?`,
    [req.params.id, req.user.id],
    (err, task) => {
      if (err || !task) {
        return res.status(404).json({ error: 'Task not found or access denied' });
      }
      
      db.run(
        `UPDATE tasks SET 
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          completed = COALESCE(?, completed),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description, completed, req.params.id],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to update task' });
          }
          
          db.get(`SELECT * FROM tasks WHERE id = ?`, [req.params.id], (err, updatedTask) => {
            res.json(updatedTask);
          });
        }
      );
    }
  );
});

// DELETE task (verify task belongs to user's project)
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  // First verify task belongs to user's project
  db.get(
    `SELECT t.id FROM tasks t
     JOIN projects p ON t.project_id = p.id
     WHERE t.id = ? AND p.user_id = ?`,
    [req.params.id, req.user.id],
    (err, task) => {
      if (err || !task) {
        return res.status(404).json({ error: 'Task not found or access denied' });
      }
      
      db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete task' });
        }
        res.json({ message: '✅ Task deleted successfully' });
      });
    }
  );
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API Endpoints:`);
  console.log(`   POST   /api/register`);
  console.log(`   POST   /api/login`);
  console.log(`   POST   /api/logout`);
  console.log(`   GET    /api/me (protected)`);
  console.log(`   GET    /api/projects (protected)`);
  console.log(`   POST   /api/projects (protected)`);
  console.log(`   PUT    /api/projects/:id (protected)`);
  console.log(`   DELETE /api/projects/:id (protected)`);
  console.log(`   GET    /api/projects/:projectId/tasks (protected)`);
  console.log(`   POST   /api/projects/:projectId/tasks (protected)`);
  console.log(`   PUT    /api/tasks/:id (protected)`);
  console.log(`   DELETE /api/tasks/:id (protected)`);
});