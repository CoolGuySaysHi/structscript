# StructScript

A clean, readable scripting language. Code that reads like English.

```
npm install -g structscript
```

## CLI usage

```bash
ss run hello.ss          # run a script
ss web index.ss          # compile web mode → HTML
ss web app.ss --serve    # compile + open in browser
ss version
```

## Language

```ss
// Variables
let name = "Thomas"
let age  = 21

// Output
say "Hello, " + name

// Input
let answer = input("What's your name? ")
say "Hey, " + answer + "!"

// Loops
count i from 1 to 10 {
  say i
}

// Functions
fn greet(name) {
  return "Hello, " + name + "!"
}
say greet("world")

// Objects & arrays
let user = { name: "Alice", age: 30 }
let nums = [1, 2, 3, 4, 5]

// Conditionals
if age >= 18 {
  say "adult"
} else {
  say "minor"
}
```

## Web mode

Compile `.ss` files to HTML/CSS:

```ss
page "My App" {
  div .hero {
    bg: "#0d1f1e"
    padding: 60
    center: true
    h1 {
      text: "Hello from StructScript"
      color: "#b8f000"
    }
    button .cta {
      text: "Get started"
      bg: "#0b7a75"
      color: "#fff"
      padding: 14
      radius: 8
      on_click: handleClick
    }
  }
}
```

```bash
ss web landing.ss            # → landing.html
ss web landing.ss --serve    # → localhost:3000
```

## Built-in functions

`say`, `print`, `input`, `len`, `str`, `num`, `bool`, `type`,
`push`, `pop`, `join`, `split`, `keys`, `values`,
`floor`, `ceil`, `round`, `abs`, `max`, `min`, `sqrt`, `pow`, `random`,
`range`, `now`, `fetch`, `fetchJson`, `fetchPost`, `log`

## Playground

[struct.coolguysayshi.uk](https://struct.coolguysayshi.uk) — run StructScript in the browser, try web mode live, share snippets via URL.

---

MIT · [coolguysayshi](https://coolguysayshi.uk)
