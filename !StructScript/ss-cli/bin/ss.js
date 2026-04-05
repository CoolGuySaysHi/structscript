#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const Interpreter  = require('../lib/interpreter');
const { patchInputRuntime } = require('../lib/input-runtime');

const args = process.argv.slice(2);
const cmd  = args[0];

const HELP = `
  StructScript CLI v1.6.0

  Usage:
    ss run <file.ss>           Run a StructScript file
    ss web <file.ss>           Compile web mode to HTML
    ss web <file.ss> -o out.html
    ss web <file.ss> --serve   Compile and serve at localhost:3000
    ss editor                  Open the desktop editor (if installed)
    ss version                 Print version

  Examples:
    ss run hello.ss
    ss run game.ss
    ss web landing.ss --serve
`;

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(HELP);
  process.exit(0);
}

if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
  const pkg = require('../package.json');
  console.log(`  StructScript v${pkg.version}`);
  process.exit(0);
}

if (cmd === 'run') {
  const file = args[1];
  if (!file) { console.error('  error: no file specified. Usage: ss run <file.ss>'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`  error: file not found: ${file}`); process.exit(1); }
  if (path.extname(file) !== '.ss') { console.error(`  error: expected a .ss file`); process.exit(1); }

  const src  = fs.readFileSync(file, 'utf8');
  const interp = new Interpreter();
  patchInputRuntime(interp);

  interp.onOutput((entry) => {
    if (entry.type === 'output') {
      const val = entry.value;
      if (val === null) console.log('null');
      else if (typeof val === 'object') console.log(JSON.stringify(val, null, 2));
      else console.log(String(val));
    } else if (entry.type === 'error') {
      console.error(`  error: ${entry.value}`);
    } else if (entry.type === 'log') {
      console.log(`  [log] ${entry.value}`);
    }
  });

  interp.run(src).then(result => {
    if (result.mode === 'web') {
      console.error('  hint: this script uses web mode. Use `ss web` to compile it.');
      process.exit(1);
    }
  }).catch(e => {
    console.error(`  fatal: ${e.message}`);
    process.exit(1);
  });

  return;
}

if (cmd === 'web') {
  require('./web').run(args.slice(1));
  return;
}

if (cmd === 'editor') {
  try {
    require('./editor').open();
  } catch(e) {
    console.error('  error: editor not installed. Run `ss editor` after installing the desktop app.');
    process.exit(1);
  }
  return;
}

console.error(`  error: unknown command '${cmd}'. Run \`ss --help\` for usage.`);
process.exit(1);
