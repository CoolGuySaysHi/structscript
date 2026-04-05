/**
 * StructScript Interpreter — interpreter.js
 * Handles: script execution, input() builtin, web mode compilation
 */

class StructScriptInterpreter {
  constructor() {
    this.vars = {};
    this.fns = {};
    this.features = { arrays: false, match: false, classes: false, async: false, web: false };
    this._inputQueue = [];
    this._inputResolvers = [];
    this._output = [];
    this._onOutput = null;
    this._onInputRequest = null;
  }

  setFeatures(f) { this.features = { ...this.features, ...f }; }
  onOutput(cb) { this._onOutput = cb; }
  onInputRequest(cb) { this._onInputRequest = cb; }

  _emit(type, value, meta) {
    const entry = { type, value, meta };
    this._output.push(entry);
    if (this._onOutput) this._onOutput(entry);
  }

  provideInput(val) {
    if (this._inputResolvers.length > 0) {
      const resolve = this._inputResolvers.shift();
      resolve(val);
    }
  }

  _waitForInput(prompt) {
    return new Promise(resolve => {
      this._inputResolvers.push(resolve);
      if (this._onInputRequest) this._onInputRequest(prompt);
    });
  }

  // ---- TOKENISER ----
  tokenise(src) {
    const tokens = [];
    let i = 0;
    const lines = src.split('\n');
    let absPos = 0;
    for (let ln = 0; ln < lines.length; ln++) {
      const line = lines[ln];
      let col = 0;
      while (col < line.length) {
        // skip whitespace
        if (/\s/.test(line[col])) { col++; continue; }
        // comment
        if (line[col] === '/' && line[col+1] === '/') {
          tokens.push({ type: 'COMMENT', val: line.slice(col), ln, col });
          col = line.length;
          continue;
        }
        // string
        if (line[col] === '"' || line[col] === "'") {
          const q = line[col]; let s = ''; col++;
          while (col < line.length && line[col] !== q) { s += line[col]; col++; }
          col++;
          tokens.push({ type: 'STRING', val: s, ln, col });
          continue;
        }
        // number
        if (/\d/.test(line[col]) || (line[col] === '-' && /\d/.test(line[col+1]))) {
          let n = '';
          if (line[col] === '-') { n = '-'; col++; }
          while (col < line.length && /[\d.]/.test(line[col])) { n += line[col]; col++; }
          tokens.push({ type: 'NUMBER', val: parseFloat(n), ln, col });
          continue;
        }
        // operators / punctuation
        const two = line.slice(col, col+2);
        if (['==','!=','<=','>=','&&','||','+=','-=','*=','/=','->'].includes(two)) {
          tokens.push({ type: 'OP', val: two, ln, col }); col += 2; continue;
        }
        if ('+-*/%<>=!&|^~(){}[],:.'.includes(line[col])) {
          tokens.push({ type: 'OP', val: line[col], ln, col }); col++; continue;
        }
        // identifier / keyword
        if (/[a-zA-Z_]/.test(line[col])) {
          let id = '';
          while (col < line.length && /[a-zA-Z0-9_]/.test(line[col])) { id += line[col]; col++; }
          const keywords = ['let','fn','return','if','else','while','for','in','from','to','count',
                            'say','print','input','true','false','null','and','or','not','is',
                            'import','page','div','h1','h2','h3','p','button','style','on_click',
                            'match','class','new','this','async','await','break','continue'];
          const type = keywords.includes(id) ? 'KW' : 'ID';
          tokens.push({ type, val: id, ln, col });
          continue;
        }
        col++;
      }
      tokens.push({ type: 'NEWLINE', val: '\n', ln, col: line.length });
    }
    return tokens.filter(t => t.type !== 'COMMENT' && t.type !== 'NEWLINE' || t.type === 'NEWLINE');
  }

  // ---- PARSER ----
  parse(tokens) {
    // Remove consecutive newlines and leading newlines
    const toks = tokens.filter(t => t.type !== 'COMMENT');
    const nodes = [];
    let i = 0;

    const peek = (offset=0) => toks[i + offset];
    const eat = (type, val) => {
      const t = toks[i];
      if (!t) throw new Error(`Unexpected end of input`);
      if (type && t.type !== type) throw new Error(`Line ${t.ln+1}: Expected ${type} got ${t.type} (${t.val})`);
      if (val !== undefined && t.val !== val) throw new Error(`Line ${t.ln+1}: Expected '${val}' got '${t.val}'`);
      i++;
      return t;
    };

    const skipNewlines = () => { while (toks[i]?.type === 'NEWLINE') i++; };

    const parseExpr = (minPrec=0) => {
      let left = parsePrimary();
      while (true) {
        const op = peek();
        if (!op || op.type === 'NEWLINE') break;
        const prec = {'+':6,'-':6,'*':7,'/':7,'%':7,'<':4,'>':4,'<=':4,'>=':4,'==':3,'!=':3,'&&':2,'||':1,'and':2,'or':1}[op.val];
        if (prec === undefined || prec < minPrec) break;
        i++;
        const right = parseExpr(prec + 1);
        left = { type: 'BinOp', op: op.val, left, right };
      }
      return left;
    };

    const parsePrimary = () => {
      skipNewlines();
      const t = peek();
      if (!t) throw new Error('Unexpected end');

      // Unary
      if (t.type === 'KW' && t.val === 'not') { i++; return { type: 'UnaryOp', op: 'not', operand: parsePrimary() }; }
      if (t.type === 'OP' && t.val === '!') { i++; return { type: 'UnaryOp', op: '!', operand: parsePrimary() }; }
      if (t.type === 'OP' && t.val === '-' && peek(1)?.type !== 'NUMBER') { i++; return { type: 'UnaryOp', op: '-', operand: parsePrimary() }; }

      // Literals
      if (t.type === 'NUMBER') { i++; return { type: 'Literal', value: t.val }; }
      if (t.type === 'STRING') { i++; return { type: 'Literal', value: t.val }; }
      if (t.type === 'KW' && t.val === 'true') { i++; return { type: 'Literal', value: true }; }
      if (t.type === 'KW' && t.val === 'false') { i++; return { type: 'Literal', value: false }; }
      if (t.type === 'KW' && t.val === 'null') { i++; return { type: 'Literal', value: null }; }

      // Array literal [features.arrays]
      if (t.type === 'OP' && t.val === '[') {
        i++; const items = [];
        while (peek()?.val !== ']') {
          items.push(parseExpr());
          if (peek()?.val === ',') i++;
        }
        i++;
        return { type: 'ArrayLiteral', items };
      }

      // Object literal {}
      if (t.type === 'OP' && t.val === '{') {
        i++; skipNewlines();
        const pairs = [];
        while (peek()?.val !== '}') {
          skipNewlines();
          const key = eat();
          eat('OP', ':');
          const val = parseExpr();
          pairs.push({ key: key.val, val });
          if (peek()?.val === ',') { i++; }
          skipNewlines();
        }
        i++;
        return { type: 'ObjLiteral', pairs };
      }

      // Grouped
      if (t.type === 'OP' && t.val === '(') {
        i++; const expr = parseExpr(); eat('OP', ')'); return expr;
      }

      // Identifier / call / index
      if (t.type === 'ID' || t.type === 'KW') {
        i++;
        let node = { type: 'Var', name: t.val };
        // call
        while (peek()?.val === '(' || peek()?.val === '[' || peek()?.val === '.') {
          if (peek().val === '(') {
            i++; const args = [];
            while (peek()?.val !== ')') {
              args.push(parseExpr());
              if (peek()?.val === ',') i++;
            }
            i++;
            node = { type: 'Call', callee: node, args };
          } else if (peek().val === '[') {
            i++; const idx = parseExpr(); eat('OP', ']');
            node = { type: 'Index', obj: node, idx };
          } else if (peek().val === '.') {
            i++; const prop = eat();
            node = { type: 'Prop', obj: node, prop: prop.val };
          }
        }
        return node;
      }

      throw new Error(`Line ${t.ln+1}: Unexpected token '${t.val}'`);
    };

    const parseBlock = () => {
      skipNewlines();
      eat('OP', '{');
      skipNewlines();
      const stmts = [];
      while (peek()?.val !== '}') {
        skipNewlines();
        if (peek()?.val === '}') break;
        stmts.push(parseStmt());
        skipNewlines();
      }
      eat('OP', '}');
      return stmts;
    };

    const parseStmt = () => {
      skipNewlines();
      const t = peek();
      if (!t) return null;

      // let
      if (t.type === 'KW' && t.val === 'let') {
        i++; const name = eat('ID').val;
        eat('OP', '=');
        const val = parseExpr();
        return { type: 'Let', name, val };
      }
      // fn
      if (t.type === 'KW' && t.val === 'fn') {
        i++; const name = eat('ID').val;
        eat('OP', '(');
        const params = [];
        while (peek()?.val !== ')') { params.push(eat('ID').val); if (peek()?.val === ',') i++; }
        eat('OP', ')');
        const body = parseBlock();
        return { type: 'FnDef', name, params, body };
      }
      // return
      if (t.type === 'KW' && t.val === 'return') {
        i++;
        if (peek()?.type === 'NEWLINE' || peek()?.val === '}') return { type: 'Return', val: { type: 'Literal', value: null } };
        return { type: 'Return', val: parseExpr() };
      }
      // if
      if (t.type === 'KW' && t.val === 'if') {
        i++; const cond = parseExpr(); const then = parseBlock();
        skipNewlines();
        let els = null;
        if (peek()?.val === 'else') {
          i++; skipNewlines();
          if (peek()?.val === 'if') els = [parseStmt()];
          else els = parseBlock();
        }
        return { type: 'If', cond, then, els };
      }
      // while
      if (t.type === 'KW' && t.val === 'while') {
        i++; const cond = parseExpr(); const body = parseBlock();
        return { type: 'While', cond, body };
      }
      // for / count
      if ((t.type === 'KW' && t.val === 'for') || (t.type === 'KW' && t.val === 'count')) {
        i++; const varName = eat('ID').val;
        if (peek()?.val === 'from') {
          i++;
          const from = parseExpr();
          eat('KW', 'to');
          const to = parseExpr();
          let step = { type: 'Literal', value: 1 };
          const body = parseBlock();
          return { type: 'CountFrom', var: varName, from, to, step, body };
        }
        eat('KW', 'in');
        const iter = parseExpr();
        const body = parseBlock();
        return { type: 'ForIn', var: varName, iter, body };
      }
      // say / print
      if (t.type === 'KW' && (t.val === 'say' || t.val === 'print')) {
        i++;
        if (peek()?.val === '(') {
          i++; const val = parseExpr(); eat('OP', ')');
          return { type: 'Say', val };
        }
        return { type: 'Say', val: parseExpr() };
      }
      // page {} — web mode
      if (t.type === 'KW' && t.val === 'page') {
        i++; const title = parseExpr(); const body = parseBlock();
        return { type: 'Page', title, body };
      }
      // Web elements
      const webEls = ['div','h1','h2','h3','p','button','style','span','ul','li','img','input','a'];
      if (webEls.includes(t.val)) {
        i++;
        const elType = t.val;
        let className = null;
        let id = null;
        if (peek()?.val === '.') { i++; className = eat().val; }
        if (peek()?.val === '#') { i++; id = eat().val; }
        const body = parseBlock();
        return { type: 'WebEl', el: elType, className, id, body };
      }
      // assignment / compound assign / expr
      const expr = parseExpr();
      const assignOps = ['=','+=','-=','*=','/='];
      if (peek() && assignOps.includes(peek().val)) {
        const op = eat('OP').val;
        const val = parseExpr();
        return { type: 'Assign', target: expr, op, val };
      }
      return { type: 'ExprStmt', expr };
    };

    while (i < toks.length) {
      skipNewlines();
      if (i >= toks.length) break;
      const stmt = parseStmt();
      if (stmt) nodes.push(stmt);
    }
    return nodes;
  }

  // ---- EVALUATOR ----
  async eval(nodes, env) {
    const e = env || this._makeEnv();
    for (const node of nodes) {
      const result = await this._evalNode(node, e);
      if (result instanceof ReturnSignal) return result;
      if (result instanceof BreakSignal) return result;
    }
  }

  _makeEnv(parent) {
    return { vars: {}, parent };
  }

  _envGet(env, name) {
    if (name in env.vars) return env.vars[name];
    if (env.parent) return this._envGet(env.parent, name);
    throw new Error(`Undefined variable: '${name}'`);
  }

  _envSet(env, name, val) {
    if (name in env.vars) { env.vars[name] = val; return; }
    if (env.parent) { this._envSet(env.parent, name, val); return; }
    env.vars[name] = val;
  }

  _envDef(env, name, val) { env.vars[name] = val; }

  async _evalNode(node, env) {
    if (!node) return null;
    switch (node.type) {
      case 'Literal': return node.value;
      case 'ArrayLiteral': return await Promise.all(node.items.map(it => this._evalNode(it, env)));
      case 'ObjLiteral': {
        const obj = {};
        for (const p of node.pairs) obj[p.key] = await this._evalNode(p.val, env);
        return obj;
      }
      case 'Var': {
        const builtins = ['say','print','input','len','range','type','str','num','bool','push','pop',
                          'join','split','keys','values','floor','ceil','round','abs','max','min',
                          'sqrt','random','now','log','fetch','fetchJson'];
        if (builtins.includes(node.name)) return { __builtin__: node.name };
        try { return this._envGet(env, node.name); } catch(e) {
          if (node.name === 'true') return true;
          if (node.name === 'false') return false;
          if (node.name === 'null') return null;
          throw e;
        }
      }
      case 'Prop': {
        const obj = await this._evalNode(node.obj, env);
        if (obj === null || obj === undefined) throw new Error(`Cannot access property '${node.prop}' of null`);
        return obj[node.prop];
      }
      case 'Index': {
        const obj = await this._evalNode(node.obj, env);
        const idx = await this._evalNode(node.idx, env);
        return obj[idx];
      }
      case 'BinOp': {
        const l = await this._evalNode(node.left, env);
        const r = await this._evalNode(node.right, env);
        switch (node.op) {
          case '+':  return typeof l === 'string' || typeof r === 'string' ? String(l) + String(r) : l + r;
          case '-':  return l - r;
          case '*':  return l * r;
          case '/':  if (r === 0) throw new Error('Division by zero'); return l / r;
          case '%':  return l % r;
          case '<':  return l < r;
          case '>':  return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
          case '==': return l == r;
          case '!=': return l != r;
          case '&&': case 'and': return l && r;
          case '||': case 'or':  return l || r;
          default: throw new Error(`Unknown operator: ${node.op}`);
        }
      }
      case 'UnaryOp': {
        const v = await this._evalNode(node.operand, env);
        if (node.op === 'not' || node.op === '!') return !v;
        if (node.op === '-') return -v;
        break;
      }
      case 'Let': {
        const val = await this._evalNode(node.val, env);
        this._envDef(env, node.name, val);
        return null;
      }
      case 'Assign': {
        const val = await this._evalNode(node.val, env);
        if (node.target.type === 'Var') {
          const name = node.target.name;
          let cur;
          try { cur = this._envGet(env, name); } catch { cur = 0; }
          const newVal = node.op === '=' ? val : node.op === '+=' ? cur + val : node.op === '-=' ? cur - val : node.op === '*=' ? cur * val : cur / val;
          try { this._envSet(env, name, newVal); } catch { this._envDef(env, name, newVal); }
        } else if (node.target.type === 'Index') {
          const obj = await this._evalNode(node.target.obj, env);
          const idx = await this._evalNode(node.target.idx, env);
          obj[idx] = val;
        } else if (node.target.type === 'Prop') {
          const obj = await this._evalNode(node.target.obj, env);
          obj[node.target.prop] = val;
        }
        return null;
      }
      case 'FnDef': {
        this._envDef(env, node.name, { __fn__: true, params: node.params, body: node.body, closure: env });
        return null;
      }
      case 'Return': {
        const val = await this._evalNode(node.val, env);
        return new ReturnSignal(val);
      }
      case 'Say': {
        const val = await this._evalNode(node.val, env);
        this._emit('output', val);
        return null;
      }
      case 'If': {
        const cond = await this._evalNode(node.cond, env);
        if (cond) {
          const childEnv = this._makeEnv(env);
          const r = await this.eval(node.then, childEnv);
          if (r instanceof ReturnSignal || r instanceof BreakSignal) return r;
        } else if (node.els) {
          const childEnv = this._makeEnv(env);
          const r = await this.eval(node.els, childEnv);
          if (r instanceof ReturnSignal || r instanceof BreakSignal) return r;
        }
        return null;
      }
      case 'While': {
        let guard = 0;
        while (await this._evalNode(node.cond, env)) {
          if (++guard > 100000) throw new Error('Infinite loop detected');
          const childEnv = this._makeEnv(env);
          const r = await this.eval(node.body, childEnv);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
        }
        return null;
      }
      case 'CountFrom': {
        const from = await this._evalNode(node.from, env);
        const to   = await this._evalNode(node.to, env);
        for (let v = from; v <= to; v++) {
          const childEnv = this._makeEnv(env);
          this._envDef(childEnv, node.var, v);
          const r = await this.eval(node.body, childEnv);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
        }
        return null;
      }
      case 'ForIn': {
        const iter = await this._evalNode(node.iter, env);
        const items = Array.isArray(iter) ? iter : Object.keys(iter);
        for (const item of items) {
          const childEnv = this._makeEnv(env);
          this._envDef(childEnv, node.var, item);
          const r = await this.eval(node.body, childEnv);
          if (r instanceof ReturnSignal) return r;
          if (r instanceof BreakSignal) break;
        }
        return null;
      }
      case 'Call': {
        const callee = await this._evalNode(node.callee, env);
        const args = await Promise.all(node.args.map(a => this._evalNode(a, env)));
        if (callee && callee.__builtin__) return await this._callBuiltin(callee.__builtin__, args);
        if (callee && callee.__fn__) {
          const fnEnv = this._makeEnv(callee.closure);
          callee.params.forEach((p, i) => this._envDef(fnEnv, p, args[i] ?? null));
          const r = await this.eval(callee.body, fnEnv);
          if (r instanceof ReturnSignal) return r.value;
          return null;
        }
        if (typeof callee === 'function') return await callee(...args);
        throw new Error(`'${node.callee?.name || '?'}' is not a function`);
      }
      case 'ExprStmt': {
        return await this._evalNode(node.expr, env);
      }
      case 'Page': return { __webNode__: true, type: 'Page', title: await this._evalNode(node.title, env), body: node.body, env };
      case 'WebEl': return { __webNode__: true, type: 'El', el: node.el, className: node.className, id: node.id, body: node.body, env };
      default: return null;
    }
  }

  async _callBuiltin(name, args) {
    switch (name) {
      case 'say': case 'print':
        this._emit('output', args[0]);
        return null;
      case 'input': {
        const prompt = args[0] !== undefined ? String(args[0]) : '';
        this._emit('input_prompt', prompt);
        const val = await this._waitForInput(prompt);
        this._emit('input_val', val);
        // try to coerce to number
        const n = Number(val);
        return isNaN(n) ? val : n;
      }
      case 'len':  return args[0]?.length ?? 0;
      case 'str':  return String(args[0]);
      case 'num':  return Number(args[0]);
      case 'bool': return Boolean(args[0]);
      case 'type': return typeof args[0];
      case 'push': args[0].push(args[1]); return args[0];
      case 'pop':  return args[0].pop();
      case 'join': return args[0].join(args[1] ?? ',');
      case 'split': return String(args[0]).split(args[1] ?? '');
      case 'keys': return Object.keys(args[0]);
      case 'values': return Object.values(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'ceil':  return Math.ceil(args[0]);
      case 'round': return Math.round(args[0]);
      case 'abs':   return Math.abs(args[0]);
      case 'max':   return Math.max(...args);
      case 'min':   return Math.min(...args);
      case 'sqrt':  return Math.sqrt(args[0]);
      case 'random': return Math.random();
      case 'now':   return Date.now();
      case 'log':   this._emit('log', args[0]); return null;
      case 'range': {
        const [start, end, step=1] = args;
        const arr = [];
        for (let i = start; i < end; i += step) arr.push(i);
        return arr;
      }
      default: throw new Error(`Unknown builtin: ${name}`);
    }
  }

  // ---- WEB COMPILER ----
  compileWeb(nodes) {
    let html = '', css = '', js = '';
    const compileNode = (node) => {
      if (node.type === 'Page') {
        let title = '', bodyHtml = '', bodyCss = '', bodyJs = '';
        for (const child of node.body) {
          const r = compileNode(child);
          if (child.type === 'WebEl' && child.el === 'style') bodyCss += r.css;
          else { bodyHtml += r.html || ''; bodyCss += r.css || ''; bodyJs += r.js || ''; }
        }
        return {
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${node.title}</title><style>${bodyCss}</style></head><body>${bodyHtml}<script>${bodyJs}<\/script></body></html>`,
          css: '', js: ''
        };
      }
      if (node.type === 'El' || node.type === 'WebEl') {
        return compileEl(node);
      }
      // property assignment inside element = style or attribute
      if (node.type === 'Let' || node.type === 'Assign') {
        return { html: '', css: '', js: '', prop: true };
      }
      return { html: '', css: '', js: '' };
    };

    const extractProps = (bodyNodes) => {
      const props = {};
      const rest = [];
      for (const n of bodyNodes) {
        if (n.type === 'Let') {
          // evaluate simple literal
          props[n.name] = evalLiteral(n.val);
        } else rest.push(n);
      }
      return { props, rest };
    };

    const evalLiteral = (node) => {
      if (node.type === 'Literal') return node.value;
      if (node.type === 'BinOp' && node.op === '+') return evalLiteral(node.left) + evalLiteral(node.right);
      return '';
    };

    const styleProps = { bg:'background', color:'color', padding:'padding', margin:'margin',
      width:'width', height:'height', 'font-size':'font-size', 'font-weight':'font-weight',
      border:'border', radius:'border-radius', display:'display', flex:'display:flex',
      gap:'gap', center:'text-align:center', bold:'font-weight:bold', shadow:'box-shadow' };

    const compileEl = (node) => {
      const { props, rest } = extractProps(node.body);
      let styleStr = '';
      let textContent = '';
      let onClickFn = '';
      let childHtml = '', childCss = '', childJs = '';

      for (const [k, v] of Object.entries(props)) {
        if (k === 'text') { textContent = v; continue; }
        if (k === 'on_click') { onClickFn = v; continue; }
        if (k === 'center' && v === true) { styleStr += 'text-align:center;'; continue; }
        const cssProp = styleProps[k] || k;
        const cssVal = typeof v === 'number' && !['opacity','z-index','flex'].includes(k) ? v + 'px' : v;
        styleStr += `${cssProp}:${cssVal};`;
      }

      for (const child of rest) {
        const r = compileEl(child);
        childHtml += r.html; childCss += r.css; childJs += r.js;
      }

      if (node.el === 'style') {
        // style block: convert props to CSS
        let cssOut = '';
        for (const [sel, rules] of Object.entries(props)) {
          cssOut += `${sel}{${Object.entries(typeof rules === 'object' ? rules : {}).map(([p,v]) => `${p}:${v}`).join(';')}}`;
        }
        return { html: '', css: childCss || cssOut, js: '' };
      }

      const cls = node.className ? ` class="${node.className}"` : '';
      const id  = node.id ? ` id="${node.id}"` : '';
      const style = styleStr ? ` style="${styleStr}"` : '';
      const onclick = onClickFn ? ` onclick="${onClickFn}()"` : '';
      const tag = node.el;

      const html = `<${tag}${cls}${id}${style}${onclick}>${textContent}${childHtml}</${tag}>`;
      return { html, css: childCss, js: childJs };
    };

    // find page node
    const pageNode = nodes.find(n => n.type === 'Page');
    if (pageNode) return compileNode(pageNode).html;

    // fallback: wrap everything in a basic page
    let bodyHtml = '';
    for (const n of nodes) {
      if (['WebEl'].includes(n.type)) bodyHtml += compileEl(n).html;
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${bodyHtml}</body></html>`;
  }

  async run(source) {
    this.vars = {};
    this.fns = {};
    this._output = [];
    this._inputResolvers = [];

    try {
      const tokens = this.tokenise(source);
      const ast = this.parse(tokens);
      // detect web mode
      const hasPage = ast.some(n => n.type === 'Page') ||
                      ast.some(n => ['div','h1','h2','h3','p','button'].includes(n.el));
      if (hasPage) return { mode: 'web', html: this.compileWeb(ast) };
      const env = this._makeEnv();
      await this.eval(ast, env);
      return { mode: 'script' };
    } catch(e) {
      this._emit('error', e.message);
      return { mode: 'script' };
    }
  }
}

class ReturnSignal { constructor(v) { this.value = v; } }
class BreakSignal {}

window.StructScriptInterpreter = StructScriptInterpreter;
