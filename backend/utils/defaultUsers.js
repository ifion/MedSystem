// utils/defaultUsers.js
const bcrypt = require('bcrypt');

async function getDefaultUsers() {
  return [
    {
      username: 'Saint Nicholas',
      rawPassword: 'nicoles123',
      role: 'admin',
      name: 'Nicholas Administrator',
      email: 'SaintNicholas@example.com',
      phone: '1234567890',
      address: 'Lagos Island',
      status: 'active',
    },

   { username: 'LIMH',
      rawPassword: 'limh123',
      role: 'admin',
      name: 'Lagos Island Maternity Hospital',
      email: 'Limh@example.com',
      phone: '1234567890',
      address: 'Behind HSC headquater Lagos Island',
      status: 'active',},

      {username: 'Onikan',
        rawPassword: 'onikan123',
        role: 'admin',
        name: 'Onikan general hospital',
        email: 'onikangeneral@gmai.com',
        phone: '234567',
        address: 'onikan lagos island',
        status: 'active',
      },
      
  ];
}

module.exports = getDefaultUsers;
