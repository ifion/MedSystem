// utils/initializeUsers.js
const { User } = require('../models');
const getDefaultUsers = require('./defaultUsers');
const bcrypt = require('bcrypt');

async function initializeUsers() {
  const defaultUsers = await getDefaultUsers();

  for (const userData of defaultUsers) {
    const existing = await User.findOne({ username: userData.username });

    if (existing) {
      console.log(`✅ User "${userData.username}" already exists. Skipping.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(userData.rawPassword, 10);
    const user = new User({
      ...userData,
      password: hashedPassword,
    });
    delete user.rawPassword;

    await user.save();
    console.log(`🆕 User "${userData.username}" created.`);
  }
}

module.exports = initializeUsers;
// this checks the defaultUsers for new additions and initialize. 
// to ensure that old users are not duplicated in the database.