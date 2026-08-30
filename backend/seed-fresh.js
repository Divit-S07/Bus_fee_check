const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./models/Admin');
require('dotenv').config();

async function seedAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete old admin (if exists)
    await Admin.deleteMany({ email: 'admin@college.edu' });
    console.log('✅ Removed old admin (if any)');

    // Hash password
    const plainPassword = 'admin123';
    const saltRounds = 12;
    const hash = await bcrypt.hash(plainPassword, saltRounds);
    console.log('✅ Password hash generated');

    // Create admin
    const admin = new Admin({
      email: 'admin@college.edu',
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'super_admin',
      permissions: [],
      isActive: true,
    });

    await admin.save();
    console.log('\n=================================');
    console.log('✅ Admin created successfully!');
    console.log('📧 Email: admin@college.edu');
    console.log('🔑 Password: admin123');
    console.log('=================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedAdmin();