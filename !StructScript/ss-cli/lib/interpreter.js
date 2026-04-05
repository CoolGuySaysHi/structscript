'use strict';

/**
 * StructScript Interpreter — lib/interpreter.js
 * Node.js-compatible. Also used as the base for the browser playground.
 */

class StructScriptInterpreter {
  constructor() {
    this.features = { arrays: true, match: false, classes: false, async: false, web: true };
    this._inputResolvers = [];
    this._output = [];
    this._onOutput = null;
    this._onInputRequest = null;
  }

  setFeatures(f) { this.features = { ...this.features, ...f }; }
  onOutput(cb)   { this._onOutput = cb; }
  onInputRequest(cb) { this._onInputRequest = cb; }

  _emit(type, value) {
    const entry = { type, value };
    this._output.push(entry);
    if (this._onOutput) this._onOutput(entry);
  }

  provideInput(val) {
    if (this._inputResolvers.length > 0) this._inputResolvers.shift()(val);
  }

  _waitForInput(prompt) {
    return new Promise(resolve => {
      this._inputResolvers.push(resolve);
      if (this._onInputRequest) this._onInputRequest(prompt);
    });
  }

  // ───────────────────────────── TOKENISER ─────────────────────────────
  tokenise(src) {
    const tokens = [];
    const lines  = src.split('\n');

    for (let ln = 0; ln < lines.length; ln++) {
      const line = lines[ln];
      let col = 0;

      while (col < line.length) {
        if (/\s/.test(line[col])) { col++; continue; }

        // comment
        if (line[col] === '/' && line[col+1] === '/') {
          tokens.push({ type: 'COMMENT', val: line.slice(col), ln, col });
          break;
        }

        // string
        if (line[col] === '"' || line[col] === "'") {
          const q = line[col]; let s = ''; col++;
          while (col < line.length && line[col] !== q) {
            if (line[col] === '\\') { col++; s += ({ n:'\n',t:'\t',r:'\r' }[line[col]] || line[col]); col++; }
            else s += line[col++];
          }
          col++;
          tokens.push({ type: 'STRING', val: s, ln, col });
          continue;
        }

        // number
        if (/\d/.test(line[col])) {
          let n = '';
          while (col < line.length && /[\d.]/.test(line[col])) n += line[col++];
          tokens.push({ type: 'NUMBER', val: parseFloat(n), ln, col });
          continue;
        }

        // two-char operators
        const two = line.slice(col, col+2);
        if (['==','!=','<=','>=','&&','||','+=','-=','*=','/=','->','**'].includes(two)) {
          tokens.push({ type: 'OP', val: two, ln, col }); col += 2; continue;
        }

        // single-char operators / punctuation
        if ('+-*/%<>=!&|^~(){}[],:.#@'.includes(line[col])) {
          tokens.push({ type: 'OP', val: line[col], ln, col }); col++; continue;
        }

        // identifier / keyword
        if (/[a-zA-Z_]/.test(line[col])) {
          let id = '';
          while (col < line.length && /[a-zA-Z0-9_]/.test(line[col])) id += line[col++];
          const KWS = new Set(['let','fn','return','if','else','while','for','in','from','to',
            'count','say','print','input','true','false','null','and','or','not','is',
            'import','page','div','h1','h2','h3','h4','h5','h6','p','button','style',
            'span','ul','ol','li','img','a','form','section','nav','header','footer',
            'match','class','new','this','async','await','break','continue','throw','try','catch']);
          tokens.push({ type: KWS.has(id) ? 'KW' : 'ID', val: id, ln, col });
          continue;
        }

        col++;
      }
      tokens.push({ type: 'NEWLINE', val: '\n', ln, col: line.length });
    }
    return tokens;
  }

  // ───────────────────────────── PARSER ─────────────────────────────
  parse(tokens) {
    const toks = tokens.filter(t => t.type !== 'COMMENT');
    let i = 0;

    const peek  = (n=0) => toks[i+n];
    const eat   = (type, val) => {
      const t = toks[i];
      if (!t) throw new Error('Unexpected end of input');
      if (type && t.type !== type) throw new Error(`Line ${(t.ln||0)+1}: Expected ${type}, got '${t.val}'`);
      if (val  !== undefined && t.val !== val) throw new Error(`Line ${(t.ln||0)+1}: Expected '${val}', got '${t.val}'`);
      return toks[i++];
    };
    const skip  = () => { while (toks[i]?.type === 'NEWLINE') i++; };

    const PREC = {'+':6,'-':6,'*':7,'/':7,'%':7,'**':8,'<':4,'>':4,'<=':4,'>=':4,'==':3,'!=':3,'&&':2,'||':1,'and':2,'or':1};

    const parseExpr = (minP=0) => {
      let left = parsePrimary();
      while (true) {
        const op = peek();
        if (!op || op.type === 'NEWLINE' || op.type === 'COMMENT') break;
        const p = PREC[op.val];
        if (p === undefined || p < minP) break;
        i++;
        const right = parseExpr(p + 1);
        left = { type:'BinOp', op:op.val, left, right };
      }
      return left;
    };

    const parsePrimary = () => {
      skip();
      const t = peek();
      if (!t) throw new Error('Unexpected end');

      if (t.type === 'KW' && t.val === 'not') { i++; return { type:'UnaryOp', op:'not', operand:parsePrimary() }; }
      if (t.type === 'OP' && t.val === '!')   { i++; return { type:'UnaryOp', op:'!',   operand:parsePrimary() }; }
      if (t.type === 'OP' && t.val === '-' && peek(1)?.type === 'NUMBER') { i++; i++; return { type:'Literal', value: -toks[i-1].val }; }
      if (t.type === 'OP' && t.val === '-')   { i++; return { type:'UnaryOp', op:'-',   operand:parsePrimary() }; }

      if (t.type === 'NUMBER') { i++; return { type:'Literal', value:t.val }; }
      if (t.type === 'STRING') { i++; return { type:'Literal', value:t.val }; }
      if (t.type === 'KW' && t.val === 'true')  { i++; return { type:'Literal', value:true }; }
      if (t.type === 'KW' && t.val === 'false') { i++; return { type:'Literal', value:false }; }
      if (t.type === 'KW' && t.val === 'null')  { i++; return { type:'Literal', value:null }; }

      if (t.type === 'OP' && t.val === '[') {
        i++; const items = [];
        while (peek()?.val !== ']') { items.push(parseExpr()); if (peek()?.val === ',') i++; }
        i++;
        return { type:'ArrayLiteral', items };
      }

      if (t.type === 'OP' && t.val === '{') {
        i++; skip(); const pairs = [];
        while (peek()?.val !== '}') {
          skip();
          const key = eat();
          eat('OP', ':');
          const val = parseExpr();
          pairs.push({ key:key.val, val });
          if (peek()?.val === ',') i++;
          skip();
        }
        i++;
        return { type:'ObjLiteral', pairs };
      }

      if (t.type === 'OP' && t.val === '(') {
        i++; const expr = parseExpr(); eat('OP', ')'); return expr;
      }

      if (t.type === 'ID' || t.type === 'KW') {
        i++;
        let node = { type:'Var', name:t.val };
        while (true) {
          if (peek()?.val === '(') {
            i++; const args = [];
            while (peek()?.val !== ')') { args.push(parseExpr()); if (peek()?.val === ',') i++; }
            i++;
            node = { type:'Call', callee:node, args };
          } else if (peek()?.val === '[') {
            i++; const idx = parseExpr(); eat('OP', ']');
            node = { type:'Index', obj:node, idx };
          } else if (peek()?.val === '.') {
            i++; const prop = eat();
            if (peek()?.val === '(') {
              i++; const args = [];
              while (peek()?.val !== ')') { args.push(parseExpr()); if (peek()?.val === ',') i++; }
              i++;
              node = { type:'MethodCall', obj:node, method:prop.val, args };
            } else {
              node = { type:'Prop', obj:node, prop:prop.val };
            }
          } else break;
        }
        return node;
      }

      throw new Error(`Line ${(t.ln||0)+1}: Unexpected token '${t.val}'`);
    };

    const parseBlock = () => {
      skip(); eat('OP', '{'); skip();
      const stmts = [];
      while (peek()?.val !== '}') { skip(); if (peek()?.val === '}') break; stmts.push(parseStmt()); skip(); }
      eat('OP', '}');
      return stmts;
    };

    const WEB_ELS = new Set(['div','h1','h2','h3','h4','h5','h6','p','button','style','span',
      'ul','ol','li','img','a','form','section','nav','header','footer','input']);

    const parseStmt = () => {
      skip();
      const t = peek();
      if (!t) return null;

      if (t.type === 'KW' && t.val === 'let') {
        i++; const name = eat('ID').val; eat('OP','='); return { type:'Let', name, val:parseExpr() };
      }
      if (t.type === 'KW' && t.val === 'fn') {
        i++; const name = eat('ID').val; eat('OP','(');
        const params = [];
        while (peek()?.val !== ')') { params.push(eat('ID').val); if (peek()?.val === ',') i++; }
        eat('OP',')');
        return { type:'FnDef', name, params, body:parseBlock() };
      }
      if (t.type === 'KW' && t.val === 'return') {
        i++;
        if (peek()?.type === 'NEWLINE' || peek()?.val === '}') return { type:'Return', val:{ type:'Literal', value:null } };
        return { type:'Return', val:parseExpr() };
      }
      if (t.type === 'KW' && t.val === 'if') {
        i++; const cond = parseExpr(); const then = parseBlock();
        skip();
        let els = null;
        if (peek()?.val === 'else') {
          i++; skip();
          els = peek()?.val === 'if' ? [parseStmt()] : parseBlock();
        }
        return { type:'If', cond, then, els };
      }
      if (t.type === 'KW' && t.val === 'while') {
        i++; return { type:'While', cond:parseExpr(), body:parseBlock() };
      }
      if (t.type === 'KW' && (t.val === 'for' || t.val === 'count')) {
        i++; const varName = eat('ID').val;
        if (peek()?.val === 'from') {
          i++; const from = parseExpr(); eat('KW','to'); const to = parseExpr();
          return { type:'CountFrom', var:varName, from, to, body:parseBlock() };
        }
        eat('KW','in');
        return { type:'ForIn', var:varName, iter:parseExpr(), body:parseBlock() };
      }
      if (t.type === 'KW' && (t.val === 'say' || t.val === 'print')) {
        i++;
        if (peek()?.val === '(') { i++; const v = parseExpr(); eat('OP',')'); return { type:'Say', val:v }; }
        return { type:'Say', val:parseExpr() };
      }
      if (t.type === 'KW' && t.val === 'break')    { i++; return { type:'Break' }; }
      if (t.type === 'KW' && t.val === 'continue') { i++; return { type:'Continue' }; }

      // web: page
      if (t.type === 'KW' && t.val === 'page') {
        i++; const title = parseExpr(); return { type:'Page', title, body:parseBlock() };
      }
      // web: elements
      if (WEB_ELS.has(t.val)) {
        i++;
        let className = null, id = null;
        if (peek()?.val === '.') { i++; className = eat().val; }
        if (peek()?.val === '#') { i++; id = eat().val; }
        return { type:'WebEl', el:t.val, className, id, body:parseBlock() };
      }

      const expr = parseExpr();
      const ASSIGNS = new Set(['=','+=','-=','*=','/=']);
      if (peek() && ASSIGNS.has(peek().val)) {
        const op = eat('OP').val;
        return { type:'Assign', target:expr, op, val:parseExpr() };
      }
      return { type:'ExprStmt', expr };
    };

    const nodes = [];
    while (i < toks.length) {
      skip();
      if (i >= toks.length) break;
      const s = parseStmt();
      if (s) nodes.push(s);
    }
    return nodes;
  }

  // ───────────────────────────── EVALUATOR ─────────────────────────────
  async run(source) {
    this._output = [];
    this._inputResolvers = [];
    try {
      const tokens = this.tokenise(source);
      const ast    = this.parse(tokens);
      const hasWeb = ast.some(n => n.type === 'Page' || n.type === 'WebEl');
      if (hasWeb) return { mode:'web', html:this.compileWeb(ast) };
      await this._evalNodes(ast, this._makeEnv());
      return { mode:'script' };
    } catch(e) {
      this._emit('error', e.message);
      return { mode:'script' };
    }
  }

  _makeEnv(parent) { return { vars:{}, parent }; }

  _get(env, name) {
    if (name in env.vars) return env.vars[name];
    if (env.parent) return this._get(env.parent, name);
    throw new Error(`Undefined variable: '${name}'`);
  }
  _set(env, name, val) {
    if (name in env.vars) { env.vars[name] = val; return; }
    if (env.parent) { this._set(env.parent, name, val); return; }
    env.vars[name] = val;
  }
  _def(env, name, val) { env.vars[name] = val; }

  async _evalNodes(nodes, env) {
    for (const node of nodes) {
      const r = await this._eval(node, env);
      if (r instanceof Signal) return r;
    }
  }

  async _eval(node, env) {
    if (!node) return null;
    switch (node.type) {
      case 'Literal':      return node.value;
      case 'ArrayLiteral': return await Promise.all(node.items.map(n => this._eval(n, env)));
      case 'ObjLiteral': {
        const o = {};
        for (const p of node.pairs) o[p.key] = await this._eval(p.val, env);
        return o;
      }
      case 'Var': {
        const BUILTINS = new Set(['say','print','input','len','range','type','str','num','bool',
          'push','pop','shift','unshift','join','split','keys','values','entries',
          'floor','ceil','round','abs','max','min','sqrt','pow','random','now',
          'log','fetch','fetchJson','fetchPost','parseInt','parseFloat','isNaN']);
        if (BUILTINS.has(node.name)) return { __builtin__:node.name };
        if (node.name === 'true')  return true;
        if (node.name === 'false') return false;
        if (node.name === 'null')  return null;
        if (node.name === 'Math')  return Math;
        if (node.name === 'JSON')  return JSON;
        if (node.name === 'Date')  return Date;
        return this._get(env, node.name);
      }
      case 'Prop': {
        const obj = await this._eval(node.obj, env);
        if (obj === null || obj === undefined) throw new Error(`Cannot access '${node.prop}' of null`);
        return obj[node.prop];
      }
      case 'Index': {
        const obj = await this._eval(node.obj, env);
        const idx = await this._eval(node.idx, env);
        return obj?.[idx];
      }
      case 'BinOp': {
        const l = await this._eval(node.left,  env);
        const r = await this._eval(node.right, env);
        switch(node.op) {
          case '+':  return typeof l === 'string' || typeof r === 'string' ? String(l)+String(r) : l+r;
          case '-':  return l-r; case '*':  return l*r;
          case '/':  if(r===0) throw new Error('Division by zero'); return l/r;
          case '%':  return l%r; case '**': return l**r;
          case '<':  return l<r; case '>':  return l>r;
          case '<=': return l<=r; case '>=': return l>=r;
          case '==': return l==r; case '!=': return l!=r;
          case '&&': case 'and': return l&&r;
          case '||': case 'or':  return l||r;
        }
        break;
      }
      case 'UnaryOp': {
        const v = await this._eval(node.operand, env);
        if (node.op==='not'||node.op==='!') return !v;
        if (node.op==='-') return -v;
        break;
      }
      case 'Let': {
        const v = await this._eval(node.val, env);
        this._def(env, node.name, v);
        return null;
      }
      case 'Assign': {
        const v = await this._eval(node.val, env);
        const applyOp = (cur, op, val) => {
          if(op==='=')  return val;
          if(op==='+=') return (typeof cur==='string'||typeof val==='string') ? String(cur)+String(val) : cur+val;
          if(op==='-=') return cur-val;
          if(op==='*=') return cur*val;
          if(op==='/=') return cur/val;
        };
        if (node.target.type === 'Var') {
          let cur; try { cur = this._get(env, node.target.name); } catch { cur = 0; }
          const nv = applyOp(cur, node.op, v);
          try { this._set(env, node.target.name, nv); } catch { this._def(env, node.target.name, nv); }
        } else if (node.target.type === 'Index') {
          const obj = await this._eval(node.target.obj, env);
          const idx = await this._eval(node.target.idx, env);
          obj[idx] = applyOp(obj[idx], node.op, v);
        } else if (node.target.type === 'Prop') {
          const obj = await this._eval(node.target.obj, env);
          obj[node.target.prop] = applyOp(obj[node.target.prop], node.op, v);
        }
        return null;
      }
      case 'FnDef': {
        this._def(env, node.name, { __fn__:true, params:node.params, body:node.body, closure:env });
        return null;
      }
      case 'Return': return new Signal('return', await this._eval(node.val, env));
      case 'Break':  return new Signal('break');
      case 'Continue': return new Signal('continue');
      case 'Say': { const v = await this._eval(node.val, env); this._emit('output', v); return null; }
      case 'If': {
        const cond = await this._eval(node.cond, env);
        if (cond) {
          const r = await this._evalNodes(node.then, this._makeEnv(env));
          if (r instanceof Signal) return r;
        } else if (node.els) {
          const r = await this._evalNodes(node.els, this._makeEnv(env));
          if (r instanceof Signal) return r;
        }
        return null;
      }
      case 'While': {
        let guard = 0;
        while (await this._eval(node.cond, env)) {
          if (++guard > 1000000) throw new Error('Infinite loop detected (>1M iterations)');
          const r = await this._evalNodes(node.body, this._makeEnv(env));
          if (r instanceof Signal) {
            if (r.type === 'return') return r;
            if (r.type === 'break')  break;
          }
        }
        return null;
      }
      case 'CountFrom': {
        const from = await this._eval(node.from, env);
        const to   = await this._eval(node.to,   env);
        for (let v = from; v <= to; v++) {
          const e = this._makeEnv(env);
          this._def(e, node.var, v);
          const r = await this._evalNodes(node.body, e);
          if (r instanceof Signal) {
            if (r.type === 'return') return r;
            if (r.type === 'break')  break;
          }
        }
        return null;
      }
      case 'ForIn': {
        const iter  = await this._eval(node.iter, env);
        const items = Array.isArray(iter) ? iter : typeof iter === 'string' ? iter.split('') : Object.keys(iter);
        for (const item of items) {
          const e = this._makeEnv(env);
          this._def(e, node.var, item);
          const r = await this._evalNodes(node.body, e);
          if (r instanceof Signal) {
            if (r.type === 'return') return r;
            if (r.type === 'break')  break;
          }
        }
        return null;
      }
      case 'Call': {
        const callee = await this._eval(node.callee, env);
        const args   = await Promise.all(node.args.map(a => this._eval(a, env)));
        if (callee?.__builtin__) return await this._builtin(callee.__builtin__, args);
        if (callee?.__fn__) {
          const e = this._makeEnv(callee.closure);
          callee.params.forEach((p, i) => this._def(e, p, args[i] ?? null));
          const r = await this._evalNodes(callee.body, e);
          return r instanceof Signal && r.type === 'return' ? r.value : null;
        }
        if (typeof callee === 'function') return await callee(...args);
        throw new Error(`'${node.callee?.name || '(expr)'}' is not callable`);
      }
      case 'MethodCall': {
        const obj    = await this._eval(node.obj, env);
        const args   = await Promise.all(node.args.map(a => this._eval(a, env)));
        if (obj === null || obj === undefined) throw new Error(`Cannot call method '${node.method}' on null`);
        if (typeof obj[node.method] !== 'function') throw new Error(`'${node.method}' is not a method`);
        return obj[node.method](...args);
      }
      case 'ExprStmt': return await this._eval(node.expr, env);
      case 'Page':  return null;
      case 'WebEl': return null;
      default: return null;
    }
  }

  async _builtin(name, args) {
    switch(name) {
      case 'say': case 'print': this._emit('output', args[0]); return null;
      case 'input': {
        const prompt = args[0] !== undefined ? String(args[0]) : '';
        this._emit('input_prompt', prompt);
        const val = await this._waitForInput(prompt);
        this._emit('input_val', val);
        const n = Number(val);
        return (!isNaN(n) && val.toString().trim() !== '') ? n : val;
      }
      case 'len':        return args[0]?.length ?? 0;
      case 'str':        return String(args[0]);
      case 'num':        return Number(args[0]);
      case 'bool':       return Boolean(args[0]);
      case 'type':       return Array.isArray(args[0]) ? 'array' : typeof args[0];
      case 'push':       args[0].push(args[1]); return args[0];
      case 'pop':        return args[0].pop();
      case 'shift':      return args[0].shift();
      case 'unshift':    args[0].unshift(args[1]); return args[0];
      case 'join':       return (args[0] ?? []).join(args[1] ?? ',');
      case 'split':      return String(args[0]).split(args[1] ?? '');
      case 'keys':       return Object.keys(args[0]);
      case 'values':     return Object.values(args[0]);
      case 'entries':    return Object.entries(args[0]);
      case 'floor':      return Math.floor(args[0]);
      case 'ceil':       return Math.ceil(args[0]);
      case 'round':      return Math.round(args[0]);
      case 'abs':        return Math.abs(args[0]);
      case 'max':        return Math.max(...(Array.isArray(args[0]) ? args[0] : args));
      case 'min':        return Math.min(...(Array.isArray(args[0]) ? args[0] : args));
      case 'sqrt':       return Math.sqrt(args[0]);
      case 'pow':        return Math.pow(args[0], args[1]);
      case 'random':     return Math.random();
      case 'now':        return Date.now();
      case 'parseInt':   return parseInt(args[0], args[1] ?? 10);
      case 'parseFloat': return parseFloat(args[0]);
      case 'isNaN':      return isNaN(args[0]);
      case 'range': {
        const [s, e, step=1] = args;
        const arr = [];
        for (let i = s; step > 0 ? i < e : i > e; i += step) arr.push(i);
        return arr;
      }
      case 'log': this._emit('log', args[0]); return null;
      case 'fetch': case 'fetchJson': case 'fetchPost': {
        // Sync HTTP using child_process (existing pattern)
        try {
          const { execFileSync } = require('child_process');
          const method = name === 'fetchPost' ? 'POST' : 'GET';
          const body   = name === 'fetchPost' ? JSON.stringify(args[1] || {}) : null;
          const script = `
            const h = require('https'), u = require('url').parse(${JSON.stringify(args[0])});
            const opt = { hostname:u.hostname, path:u.path, method:'${method}',
              headers:{'Content-Type':'application/json','User-Agent':'StructScript/1.2'} };
            const req = h.request(opt, res => {
              let d=''; res.on('data',c=>d+=c); res.on('end',()=>process.stdout.write(d));
            });
            req.on('error',e=>process.stdout.write(JSON.stringify({error:e.message})));
            ${body ? `req.write(${JSON.stringify(body)});` : ''} req.end();
          `;
          const result = execFileSync(process.execPath, ['-e', script], { timeout:10000 }).toString();
          return name === 'fetch' ? result : JSON.parse(result);
        } catch(e) { throw new Error(`fetch failed: ${e.message}`); }
      }
      default: throw new Error(`Unknown builtin: '${name}'`);
    }
  }

  // ───────────────────────────── WEB COMPILER ─────────────────────────────
  compileWeb(ast) {
    const evalLit = (node) => {
      if (!node) return '';
      if (node.type === 'Literal') return node.value;
      if (node.type === 'BinOp' && node.op === '+') return String(evalLit(node.left)) + String(evalLit(node.right));
      return '';
    };

    const extractProps = (body) => {
      const props = {}, rest = [];
      for (const n of body) {
        if (n.type === 'Let') props[n.name] = evalLit(n.val);
        else rest.push(n);
      }
      return { props, rest };
    };

    const CSS_MAP = {
      bg:'background', color:'color', padding:'padding', margin:'margin',
      width:'width', height:'height', radius:'border-radius', border:'border',
      display:'display', gap:'gap', shadow:'box-shadow', opacity:'opacity',
      'font-size':'font-size', 'font-weight':'font-weight',
      'line-height':'line-height', 'letter-spacing':'letter-spacing',
      'text-decoration':'text-decoration', 'overflow':'overflow',
      'flex-direction':'flex-direction', 'align-items':'align-items',
      'justify-content':'justify-content', 'flex-wrap':'flex-wrap',
      'max-width':'max-width', 'min-height':'min-height',
      'position':'position', 'top':'top', 'left':'left',
      'right':'right', 'bottom':'bottom', 'z-index':'z-index',
      'cursor':'cursor', 'transition':'transition',
    };

    const toCSS = (k, v) => {
      if (k === 'center' && v === true)  return 'text-align:center;';
      if (k === 'center' && v === 'x')   return 'margin-left:auto;margin-right:auto;';
      if (k === 'bold'   && v === true)  return 'font-weight:700;';
      if (k === 'italic' && v === true)  return 'font-style:italic;';
      if (k === 'flex'   && v === true)  return 'display:flex;';
      if (k === 'grid'   && v === true)  return 'display:grid;';
      if (k === 'hidden' && v === true)  return 'display:none;';
      const cssProp = CSS_MAP[k] || k;
      const cssVal  = typeof v === 'number' && !['opacity','z-index','flex','order'].includes(k)
        ? v + 'px' : v;
      return `${cssProp}:${cssVal};`;
    };

    const compileEl = (node) => {
      if (!node || node.type === 'ExprStmt') return { html:'', css:'', js:'' };
      const { props, rest } = extractProps(node.body || []);
      let styleStr = '', text = '', onclick = '', href = '', src = '', alt = '';
      let childHtml = '', childCss = '', childJs = '';

      for (const [k, v] of Object.entries(props)) {
        if (k === 'text')     { text = String(v); continue; }
        if (k === 'on_click') { onclick = String(v); continue; }
        if (k === 'href')     { href = String(v); continue; }
        if (k === 'src')      { src  = String(v); continue; }
        if (k === 'alt')      { alt  = String(v); continue; }
        styleStr += toCSS(k, v);
      }

      for (const child of rest) {
        const r = compileEl(child);
        childHtml += r.html; childCss += r.css; childJs += r.js;
      }

      if (node.el === 'style') {
        // raw CSS block
        return { html:'', css:childCss, js:'' };
      }

      const cls   = node.className ? ` class="${node.className}"` : '';
      const id    = node.id        ? ` id="${node.id}"`           : '';
      const style = styleStr       ? ` style="${styleStr}"`        : '';
      const oc    = onclick        ? ` onclick="${onclick}()"`     : '';
      const hrf   = href           ? ` href="${href}"`             : '';
      const sr    = src            ? ` src="${src}"`               : '';
      const at    = alt            ? ` alt="${alt}"`               : '';

      const VOID = new Set(['img','input','br','hr','meta','link']);
      const tag  = node.el;
      const html = VOID.has(tag)
        ? `<${tag}${cls}${id}${style}${sr}${at}>`
        : `<${tag}${cls}${id}${style}${oc}${hrf}>${text}${childHtml}</${tag}>`;

      return { html, css:childCss, js:childJs };
    };

    const pageNode = ast.find(n => n.type === 'Page');
    const title    = pageNode ? String(evalLit(pageNode.title)) : 'StructScript App';
    const body     = pageNode ? pageNode.body : ast.filter(n => n.type === 'WebEl');

    let bodyHtml = '', bodyCss = '', bodyJs = '';
    for (const node of body) {
      const r = compileEl(node);
      if (node.el === 'style') bodyCss += r.css;
      else { bodyHtml += r.html; bodyCss += r.css; bodyJs += r.js; }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
${bodyCss}
</style>
</head>
<body>
${bodyHtml}
${bodyJs ? `<script>${bodyJs}<\/script>` : ''}
</body>
</html>`;
  }
}

class Signal { constructor(type, value) { this.type = type; this.value = value; } }

module.exports = StructScriptInterpreter;
