#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const Interpreter = require('../lib/interpreter');

function run(args) {
  if (!args.length || args[0] === '--help') {
    console.log(`
  StructScript Web Compiler

  Usage:
    ss web <file.ss>
    ss web <file.ss> -o out.html
    ss web <file.ss> --serve
`);
    process.exit(0);
  }

  const inputFile  = args[0];
  const outIdx     = args.indexOf('-o');
  const serve      = args.includes('--serve');
  const outputFile = outIdx !== -1
    ? args[outIdx + 1]
    : inputFile.replace(/\.ss$/, '.html');

  if (!fs.existsSync(inputFile)) {
    console.error(`  error: file not found: ${inputFile}`);
    process.exit(1);
  }

  const src    = fs.readFileSync(inputFile, 'utf8');
  const interp = new Interpreter();

  let html;
  try {
    const tokens = interp.tokenise(src);
    const ast    = interp.parse(tokens);
    html = interp.compileWeb(ast);
  } catch(e) {
    console.error(`  compile error: ${e.message}`);
    process.exit(1);
  }

  fs.writeFileSync(outputFile, html, 'utf8');
  console.log(`  ✓ compiled → ${outputFile}`);

  if (serve) {
    const http = require('http');
    const port = 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(outputFile, 'utf8'));
    });
    server.listen(port, () => {
      console.log(`  ✓ serving at http://localhost:${port}`);
      const { exec } = require('child_process');
      const open = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${open} http://localhost:${port}`);
    });
  }
}

module.exports = { run };

if (require.main === module) {
  run(process.argv.slice(2));
}
