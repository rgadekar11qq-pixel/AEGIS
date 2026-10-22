#!/usr/bin/env node
/**
 * AEGIS Secure Password Hash Generator
 * Uses bcrypt with 12 salt rounds
 *
 * Usage:
 *   node scripts/hash-password.js <passphrase>
 */

const bcrypt = require("bcryptjs");

const pass = process.argv[2];

if (!pass) {
  console.error("Usage: node scripts/hash-password.js <passphrase>");
  process.exit(1);
}

const saltRounds = 12;
const hash = bcrypt.hashSync(pass, saltRounds);

console.log("Bcrypt Salted Hash (12 rounds):");
console.log(hash);
