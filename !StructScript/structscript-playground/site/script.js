/**
 * StructScript Playground — script.js
 * UI logic: tabs, editor, syntax highlighting, run, input(), web preview, examples
 */

const SS_KEYWORDS = ['let','fn','return','if','else','while','for','in','from','to','count',
  'say','print','input','true','false','null','and','or','not','is','import',
  'page','div','h1','h2','h3','p','button','style','span','ul','li','img','a',
  'match','class','new','this','async','await','break','continue'];

const EXAMPLES = [
  {
    title: 'Hello, World!',
    desc: 'The classic first program',
    tag: 'basics',
    mode: 'script',
    code: `say "Hello, World!"\nsay "Welcome to StructScript"`
  },
  {
    title: 'User input',
    desc: 'Using input() to ask the user for data',
    tag: 'input',
    mode: 'script',
    code: `let name = input("What's your name? ")\nlet age = input("How old are you? ")\nsay "Hello, " + name + "! You are " + age + " years old."`
  },
  {
    title: 'FizzBuzz',
    desc: 'Classic FizzBuzz with count from',
    tag: 'loops',
    mode: 'script',
    code: `count i from 1 to 20 {\n  if i % 15 == 0 {\n    say "FizzBuzz"\n  } else if i % 3 == 0 {\n    say "Fizz"\n  } else if i % 5 == 0 {\n    say "Buzz"\n  } else {\n    say i\n  }\n}`
  },
  {
    title: 'Fibonacci',
    desc: 'Recursive fibonacci with memoisation',
    tag: 'functions',
    mode: 'script',
    code: `let memo = {}\n\nfn fib(n) {\n  if n <= 1 { return n }\n  if memo[n] { return memo[n] }\n  memo[n] = fib(n - 1) + fib(n - 2)\n  return memo[n]\n}\n\ncount i from 1 to 10 {\n  say "fib(" + i + ") = " + fib(i)\n}`
  },
  {
    title: 'Number guessing game',
    desc: 'Interactive game using input()',
    tag: 'input',
    mode: 'script',
    code: `let secret = 42\nlet tries = 0\nlet won = false\n\nsay "I'm thinking of a number between 1 and 100."\n\nwhile not won {\n  let guess = input("Your guess: ")\n  tries += 1\n  if guess < secret {\n    say "Too low!"\n  } else if guess > secret {\n    say "Too high!"\n  } else {\n    won = true\n    say "Correct! You got it in " + tries + " tries."\n  }\n}`
  },
  {
    title: 'Simple webpage',
    desc: 'A basic page with web mode',
    tag: 'web',
    mode: 'web',
    code: `page "My Page" {\n  div .hero {\n    bg: "#0d1f1e"\n    padding: 60\n    center: true\n    h1 {\n      text: "Hello from StructScript"\n      color: "#b8f000"\n    }\n    p {\n      text: "Web mode compiles .ss to HTML/CSS."\n      color: "#6a9290"\n    }\n    button .cta {\n      text: "Click me"\n      bg: "#0b7a75"\n      color: "#b8f000"\n      padding: 12\n    }\n  }\n}`
  },
  {
    title: 'Calculator',
    desc: 'Interactive calculator with input()',
    tag: 'input',
    mode: 'script',
    code: `say "StructScript Calculator"\nsay "Operations: + - * /"\n\nlet a = input("First number: ")\nlet op = input("Operation: ")\nlet b = input("Second number: ")\n\nlet result = 0\nif op == "+" {\n  result = a + b\n} else if op == "-" {\n  result = a - b\n} else if op == "*" {\n  result = a * b\n} else if op == "/" {\n  if b == 0 {\n    say "Error: division by zero"\n    result = null\n  } else {\n    result = a / b\n  }\n} else {\n  say "Unknown operation: " + op\n}\n\nif result {\n  say a + " " + op + " " + b + " = " + result\n}`
  },
  {
    title: 'Styled landing page',
    desc: 'A full landing page with web mode',
    tag: 'web',
    mode: 'web',
    code: `page "StructScript" {\n  div .nav {\n    bg: "#0d1f1e"\n    padding: 16\n    h2 {\n      text: "StructScript"\n      color: "#b8f000"\n    }\n  }\n  div .hero {\n    bg: "#091918"\n    padding: 80\n    center: true\n    h1 {\n      text: "Code that reads like English."\n      color: "#e8f5f4"\n    }\n    p {\n      text: "The structured scripting language for everyone."\n      color: "#4a6e6b"\n    }\n    button {\n      text: "Get started"\n      bg: "#b8f000"\n      color: "#0d1f1e"\n      padding: 14\n      radius: 8\n    }\n  }\n}`
  }
];

// ---- STATE ----
let currentTab = 'script';
let features = { arrays: false, match: false, classes: false, async: false, web: false };
let interpreter = new StructScriptInterpreter();
let isRunning = false;
let editorPanelFlex = 1;

// ---- DOM REFS ----
const editor    = document.getElementById('editor');
const lineNums  = document.getElementById('line-numbers');
const outputBody = document.getElementById('output-body');
const webPreview = document.getElementById('web-preview');
const previewFrame = document.getElementById('preview-frame');
const btnRun    = document.getElementById('btn-run');
const btnClear  = document.getElementById('btn-clear');
const btnExamples = document.getElementById('btn-examples');
const btnShare  = document.getElementById('btn-share');
const statusBadge = document.getElementById('status-badge');
const outLabel  = document.getElementById('out-label');
const unsavedDot = document.getElementById('unsaved-dot');
const sbCursor  = document.getElementById('sb-cursor');
const featureBar = document.getElementById('feature-bar');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawer    = document.getElementById('drawer');
const drawerList = document.getElementById('drawer-list');
const drawerClose = document.getElementById('drawer-close');

// ---- INIT ----
window.addEventListener('DOMContentLoaded', () => {
  setEditorContent(EXAMPLES[0].code);
  updateLineNumbers();
  buildExamplesDrawer();
  loadFromURL();
  setupDivider();
  setupTabs();
  setupFeatureLab();
  setupKeyboardShortcuts();
  updateCursorPos();
});

// ---- TABS ----
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      featureBar.style.display = currentTab === 'lab' ? 'flex' : 'none';
      if (currentTab === 'web') {
        document.getElementById('file-name').textContent = 'main.ss → web';
        outLabel.textContent = 'preview';
      } else {
        document.getElementById('file-name').textContent = 'main.ss';
        outLabel.textContent = 'output';
      }
    });
  });
}

// ---- FEATURE LAB ----
function setupFeatureLab() {
  document.querySelectorAll('.feat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const feat = pill.dataset.feat;
      features[feat] = !features[feat];
      pill.classList.toggle('active', features[feat]);
      interpreter.setFeatures(features);
    });
  });
}

// ---- EDITOR ----
function setEditorContent(code) {
  editor.value = code;
  updateLineNumbers();
}

editor.addEventListener('input', () => {
  updateLineNumbers();
  unsavedDot.style.display = 'inline-block';
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    updateLineNumbers();
  }
});

editor.addEventListener('scroll', () => {
  lineNums.scrollTop = editor.scrollTop;
});

editor.addEventListener('keyup', updateCursorPos);
editor.addEventListener('click', updateCursorPos);

function updateCursorPos() {
  const text = editor.value.substring(0, editor.selectionStart);
  const lines = text.split('\n');
  const ln = lines.length;
  const col = lines[lines.length - 1].length + 1;
  sbCursor.textContent = `Ln ${ln}, Col ${col}`;
}

function updateLineNumbers() {
  const lines = editor.value.split('\n').length;
  lineNums.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
}

// ---- KEYBOARD SHORTCUTS ----
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); clearOutput(); }
  });
}

// ---- RUN ----
btnRun.addEventListener('click', runCode);

async function runCode() {
  if (isRunning) return;
  isRunning = true;
  btnRun.classList.add('running');
  btnRun.innerHTML = '<span style="display:inline-block;width:8px;height:8px;background:#b8f000;border-radius:50%;animation:pulse 0.8s ease-in-out infinite"></span> running';
  unsavedDot.style.display = 'none';

  clearOutput();
  showStatus('wait', 'running...');

  const startTime = performance.now();
  interpreter = new StructScriptInterpreter();
  interpreter.setFeatures(features);

  interpreter.onOutput((entry) => {
    renderOutputEntry(entry);
  });

  interpreter.onInputRequest((prompt) => {
    renderInputField(prompt);
  });

  const result = await interpreter.run(editor.value);
  const elapsed = Math.round(performance.now() - startTime);

  if (result.mode === 'web') {
    // Switch to web preview
    outputBody.style.display = 'none';
    webPreview.style.display = 'flex';
    previewFrame.srcdoc = result.html;
    showStatus('ok', `compiled · ${elapsed}ms`);
    outLabel.textContent = 'preview';
  } else {
    outputBody.style.display = 'flex';
    outputBody.style.flexDirection = 'column';
    webPreview.style.display = 'none';
    const hasError = outputBody.querySelector('.out-err');
    showStatus(hasError ? 'err' : 'ok', hasError ? 'error' : `ok · ${elapsed}ms`);
    // Add timing separator
    const sep = document.createElement('div');
    sep.className = 'out-info out-line';
    sep.style.marginTop = '8px';
    sep.style.fontSize = '11px';
    sep.style.opacity = '0.5';
    sep.textContent = `-- done in ${elapsed}ms --`;
    outputBody.appendChild(sep);
    outputBody.scrollTop = outputBody.scrollHeight;
  }

  isRunning = false;
  btnRun.classList.remove('running');
  btnRun.innerHTML = '<span class="run-tri"></span> run';
}

// ---- OUTPUT RENDERING ----
function clearOutput() {
  outputBody.innerHTML = '';
  outputBody.style.display = 'flex';
  outputBody.style.flexDirection = 'column';
  webPreview.style.display = 'none';
  statusBadge.style.display = 'none';
  statusBadge.className = 'status-badge';
  outLabel.textContent = 'output';
}

function showStatus(type, text) {
  statusBadge.style.display = 'inline-block';
  statusBadge.className = `status-badge ${type}`;
  statusBadge.textContent = text;
}

function ssValueToString(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function ssTypeLabel(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function renderOutputEntry(entry) {
  if (entry.type === 'input_prompt') return; // handled by renderInputField
  if (entry.type === 'input_val') {
    // Remove the pending input row, show echoed value
    const existing = outputBody.querySelector('.input-row.pending');
    if (existing) {
      const echo = document.createElement('div');
      echo.className = 'out-line';
      echo.innerHTML = `<span class="out-input-prompt">? </span><span class="out-input-val">${escapeHtml(String(entry.value))}</span>`;
      existing.replaceWith(echo);
    }
    return;
  }

  const line = document.createElement('div');
  line.className = 'out-line';

  if (entry.type === 'error') {
    line.innerHTML = `<span class="out-prompt">✕</span><span class="out-err">${escapeHtml(entry.value)}</span>`;
  } else if (entry.type === 'log') {
    line.innerHTML = `<span class="out-prompt">~</span><span class="out-info">${escapeHtml(ssValueToString(entry.value))}</span>`;
  } else {
    const val = ssValueToString(entry.value);
    const typ = ssTypeLabel(entry.value);
    const isMultiline = val.includes('\n');
    if (isMultiline) {
      line.innerHTML = `<span class="out-prompt">›</span><pre style="color:#d4edeb;font-family:var(--font-code);font-size:13px;margin:0">${escapeHtml(val)}</pre>`;
    } else {
      line.innerHTML = `<span class="out-prompt">›</span><span class="out-val">${escapeHtml(val)}</span><span class="out-type">${typ}</span>`;
    }
  }

  outputBody.appendChild(line);
  outputBody.scrollTop = outputBody.scrollHeight;
}

function renderInputField(prompt) {
  const row = document.createElement('div');
  row.className = 'input-row pending';

  const promptSpan = document.createElement('span');
  promptSpan.className = 'input-prompt-sym';
  promptSpan.textContent = prompt || '? ';

  const field = document.createElement('input');
  field.className = 'input-field';
  field.type = 'text';
  field.placeholder = 'type here and press Enter...';
  field.autocomplete = 'off';

  const submit = document.createElement('button');
  submit.className = 'input-submit';
  submit.textContent = 'enter ↵';

  const doSubmit = () => {
    const val = field.value;
    field.disabled = true;
    submit.disabled = true;
    interpreter.provideInput(val);
  };

  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
  submit.addEventListener('click', doSubmit);

  row.appendChild(promptSpan);
  row.appendChild(field);
  row.appendChild(submit);
  outputBody.appendChild(row);
  outputBody.scrollTop = outputBody.scrollHeight;
  field.focus();
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- CLEAR ----
btnClear.addEventListener('click', clearOutput);

// ---- EXAMPLES DRAWER ----
function buildExamplesDrawer() {
  EXAMPLES.forEach((ex, i) => {
    const item = document.createElement('div');
    item.className = 'example-item';
    item.innerHTML = `
      <div class="example-title">${ex.title}</div>
      <div class="example-desc">${ex.desc}</div>
      <span class="example-tag">${ex.tag}</span>
    `;
    item.addEventListener('click', () => {
      setEditorContent(ex.code);
      // switch tab to match mode
      if (ex.mode === 'web') {
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === 'web');
        });
        currentTab = 'web';
      } else {
        document.querySelectorAll('.tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === 'script');
        });
        currentTab = 'script';
      }
      closeDrawer();
      clearOutput();
    });
    drawerList.appendChild(item);
  });
}

btnExamples.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

function openDrawer() {
  drawerOverlay.classList.add('open');
  drawer.classList.add('open');
}
function closeDrawer() {
  drawerOverlay.classList.remove('open');
  drawer.classList.remove('open');
}

// ---- SHARE ----
btnShare.addEventListener('click', () => {
  const encoded = btoa(unescape(encodeURIComponent(editor.value)));
  const url = `${location.origin}${location.pathname}?snippet=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    btnShare.textContent = 'copied!';
    setTimeout(() => { btnShare.textContent = 'share snippet'; }, 2000);
  });
});

function loadFromURL() {
  const params = new URLSearchParams(location.search);
  const snippet = params.get('snippet');
  if (snippet) {
    try {
      const code = decodeURIComponent(escape(atob(snippet)));
      setEditorContent(code);
    } catch(e) {}
  }
}

// ---- RESIZABLE DIVIDER ----
function setupDivider() {
  const divider = document.getElementById('divider');
  const workspace = document.querySelector('.workspace');
  let dragging = false, startX = 0, startFlex = 0;

  divider.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    const editorPanel = document.querySelector('.editor-panel');
    startFlex = editorPanel.offsetWidth;
    divider.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const total = workspace.offsetWidth;
    const newEditorW = Math.max(200, Math.min(total - 200, startFlex + dx));
    const editorPanel = document.querySelector('.editor-panel');
    const outputPanel = document.querySelector('.output-panel');
    editorPanel.style.flex = 'none';
    editorPanel.style.width = newEditorW + 'px';
    outputPanel.style.flex = '1';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}
