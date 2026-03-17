const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'task_management.db');
const db = new sqlite3.Database(DB_PATH);

async function seed() {
  console.log('🌱 Seeding database...');
  
  try {
    // Hash passwords for test users
    const hashedPassword1 = await bcrypt.hash('password123', 10);
    const hashedPassword2 = await bcrypt.hash('password456', 10);

    db.serialize(() => {
      // Insert test users
      db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, 
        ['john_doe', 'john@example.com', hashedPassword1]);
      
      db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, 
        ['jane_smith', 'jane@example.com', hashedPassword2]);

      // Wait a bit for users to be inserted
      setTimeout(() => {
        // Get John's ID and insert his projects
        db.get(`SELECT id FROM users WHERE email = ?`, ['john@example.com'], (err, john) => {
          if (err) {
            console.error('Error finding John:', err);
            return;
          }
          
          db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
            ['Work Projects', 'Professional work-related projects', john.id]);
          
          db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
            ['Personal Projects', 'Side projects and hobbies', john.id]);
          
          // Get the first project ID to add tasks
          db.get(`SELECT id FROM projects WHERE user_id = ? AND name = ?`, 
            [john.id, 'Work Projects'], (err, workProject) => {
              if (workProject) {
                db.run(`INSERT INTO tasks (title, description, project_id) VALUES (?, ?, ?)`,
                  ['Finish report', 'Complete quarterly report', workProject.id]);
                db.run(`INSERT INTO tasks (title, description, project_id) VALUES (?, ?, ?)`,
                  ['Team meeting', 'Schedule weekly sync', workProject.id]);
              }
            });
        });

        // Get Jane's ID and insert her projects
        db.get(`SELECT id FROM users WHERE email = ?`, ['jane@example.com'], (err, jane) => {
          if (err) {
            console.error('Error finding Jane:', err);
            return;
          }
          
          db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
            ['Client Work', 'Projects for clients', jane.id]);
          
          db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
            ['Learning', 'Tutorials and courses', jane.id]);
          
          // Get the first project ID to add tasks
          db.get(`SELECT id FROM projects WHERE user_id = ? AND name = ?`, 
            [jane.id, 'Client Work'], (err, clientProject) => {
              if (clientProject) {
                db.run(`INSERT INTO tasks (title, description, project_id) VALUES (?, ?, ?)`,
                  ['Design mockup', 'Create initial designs', clientProject.id]);
                db.run(`INSERT INTO tasks (title, description, project_id) VALUES (?, ?, ?)`,
                  ['Client presentation', 'Prepare slides for meeting', clientProject.id]);
              }
            });
        });

        console.log('✅ Database seeded successfully!');
        console.log('Test users created:');
        console.log('  john@example.com / password123');
        console.log('  jane@example.com / password456');
      }, 500); // Wait 500ms for users to be inserted
    });
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    // Close database after all operations
    setTimeout(() => {
      db.close();
      console.log('📊 Database connection closed');
    }, 2000);
  }
}

seed();