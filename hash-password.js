// Run with: npm run hash-password
// Type a password when prompted. Paste the printed hash into your .env as ADMIN_PASSWORD_HASH.

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Choose your admin password: ', (password) => {
  if (!password || password.length < 8) {
    console.log('\nPassword must be at least 8 characters. Try again.\n');
    rl.close();
    process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);
  console.log('\nAdd this line to your .env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  rl.close();
});
