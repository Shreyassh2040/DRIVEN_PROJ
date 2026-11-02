#!/usr/bin/env node
/**
 * Frees the API port before `npm start` / `npm run dev`.
 *
 * Closing a terminal does not always stop the `node src/server.js` child that
 * `npm` spawned; it gets re-parented to launchd and keeps holding the port.
 * This script stops that stale instance so a fresh terminal can start cleanly.
 *
 * It only kills a process that is running this project's `src/server.js`.
 * Anything else on the port is reported and left alone.
 */
require('dotenv').config();

const fs = require('fs');
const { execFileSync } = require('child_process');

const port = Number(process.env.PORT) || 3000;

function realPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return value;
  }
}

const projectDir = realPath(process.cwd());

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    // lsof exits non-zero when there are no matches; treat that as empty.
    return '';
  }
}

function listenersOn(targetPort) {
  return run('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(Number);
}

function commandOf(pid) {
  return run('ps', ['-p', String(pid), '-o', 'command=']).trim();
}

function cwdOf(pid) {
  const output = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const line = output.split('\n').find(item => item.startsWith('n'));
  return line ? realPath(line.slice(1)) : '';
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const pids = listenersOn(port);
if (pids.length === 0) process.exit(0);

const ours = [];
const foreign = [];

for (const pid of pids) {
  const command = commandOf(pid);
  const cwd = cwdOf(pid);
  const isOurServer = command.includes('src/server.js') && cwd === projectDir;

  if (isOurServer) ours.push(pid);
  else foreign.push({ pid, command, cwd });
}

if (foreign.length > 0) {
  console.error(`Port ${port} is in use by another program:`);
  for (const item of foreign) {
    console.error(`  PID ${item.pid}: ${item.command || 'unknown command'}`);
    if (item.cwd) console.error(`    cwd: ${item.cwd}`);
  }
  console.error('Stop that program, or start on another port: PORT=3001 npm start');
  process.exit(1);
}

for (const pid of ours) {
  console.log(`Port ${port} is held by a previous run (PID ${pid}). Stopping it…`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

const deadline = Date.now() + 4000;
while (ours.some(isAlive) && Date.now() < deadline) sleep(100);

for (const pid of ours) {
  if (!isAlive(pid)) continue;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

sleep(200);

const remaining = listenersOn(port);
if (remaining.length > 0) {
  console.error(`Port ${port} is still in use (PID ${remaining.join(', ')}).`);
  process.exit(1);
}
