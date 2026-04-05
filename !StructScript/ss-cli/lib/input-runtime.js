'use strict';

/**
 * StructScript — lib/input-runtime.js
 * Patches the interpreter with real readline-based input() for Node.js CLI use.
 */

const readline = require('readline');

function patchInputRuntime(interpreter) {
  let rl = null;

  const getRL = () => {
    if (!rl || rl.closed) {
      rl = readline.createInterface({
        input:    process.stdin,
        output:   process.stdout,
        terminal: process.stdin.isTTY
      });
      rl.on('close', () => { rl = null; });
    }
    return rl;
  };

  const original = interpreter._builtin.bind(interpreter);

  interpreter._builtin = async function(name, args) {
    if (name === 'input') {
      const prompt = args[0] !== undefined ? String(args[0]) : '';
      return new Promise((resolve) => {
        const iface = getRL();
        iface.question(prompt, (answer) => {
          const trimmed = answer.trim();
          interpreter._emit('input_val', trimmed);
          const n = Number(trimmed);
          resolve((!isNaN(n) && trimmed !== '') ? n : trimmed);
        });
      });
    }
    return original(name, args);
  };
}

module.exports = { patchInputRuntime };
