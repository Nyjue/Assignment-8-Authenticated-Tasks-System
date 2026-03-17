const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'task_management.db');
const db = new sqlite3.Database(DB_PATH);

async function seed() {
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

      // Get user IDs to assign projects
      db.get(`SELECT id FROM users WHERE email = ?`, ['john@example.com'], (err, john) => {
        if (err) throw err;
        
        // Insert projects for John
        db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
          ['Work Projects', 'Professional work-related projects', john.id]);
        
        db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
          ['Personal Projects', 'Side projects and hobbies', john.id]);

        // Get Jane's ID
        db.get(`SELECT id FROM users WHERE email = ?`, ['jane@example.com'], (err, jane) => {
          if (err) throw err;
          
          // Insert projects for Jane
          db.run(`INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)`,
            ['Client Work', 'Projects for clients', jane.id]);
        });
      });

      console.log('Database seeded successfully!');
    });
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    setTimeout(() => db.close(), 1000); // Wait for queries to complete
  }
}

seed();