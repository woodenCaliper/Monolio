# Monolio document format and editing guide

A Monolio document is **one HTML file** written by Monolio, a block-based technical document editor. This page explains
how to read such a file and how to change it without breaking it. It covers format version 1.0 (the version is in the
first line of every file); older files follow the same rules without the parts marked with a version.

In short:

1. **The document is the JSON at the top of the file** (`<script id="document-manifest">`). Read and write only that. Everything after it is a rendered copy.
2. **To change the document, add a suggestion** (`suggestions`) instead of editing the content (`pages`). A person reviews it in Monolio and accepts or rejects each change.
3. **When writing the file back, replace only the JSON**, write `<` as `<`, and leave the rest of the file as it is.

---

## 1. File layout

```
<!doctype html>
<!-- Monolio document (SingleHtmlTechnicalDocument 1.0, saved by Monolio 1.0.0) … a short note about the layout and a link to this page -->
<html><head>…
<script type="application/vnd.single-html-doc.manifest+json" id="document-manifest">
{ …the document as JSON… }
</script>
<style>…</style> … the document rendered as HTML (a copy for browsers) …
<script type="application/vnd.single-html-doc.attachments+json" id="document-attachments">…attachment data (base64)…</script>
<script>…a small script for viewing in a browser…</script>
```

- **Reading the JSON is enough.** Read from the top of the file to the first `</script>`; large attachments come later.
- Inside the JSON, `<` is written as `<` so that `</script>` cannot end the script early. `JSON.parse` turns it back into `<`.
- The rendered HTML, the diagram pictures (SVG) and the attachment data are made from the JSON. **Monolio does not read
  them**; changing them has no effect, and they are rebuilt the next time Monolio saves the file. You do not need to update them.
- Do not touch the attachment data (`document-attachments`).

## 2. The document JSON

```json
{
  "format": "SingleHtmlTechnicalDocument",
  "formatVersion": "1.0",
  "generator": "Monolio 1.0.0",
  "title": "…",
  "pages": [ { "id": "…", "title": "Page title", "locked": true, "icon": "🚀", "cover": { "attachmentId": "…", "position": 50 }, "blocks": [ … ] } ],
  "suggestions": [ … ],
  "settings": { "headingNumbers": true, "fontStyle": "serif", "smallText": true },
  "fonts": [ … ],
  "attachments": [ { "id": "…", "name": "a.png", "mime": "image/png", "size": 1234, "sha256": "…" } ]
}
```

- `formatVersion` is the **format version** (`"1.0"`). It is the number that matters when opening: a newer format than the app
  knows shows a notice. From 1.0 on, files stay readable by later Monolio versions; adding things raises the minor number
  (1.1), a change that older apps cannot read raises the major number (2.0). The `0.8.x` marks below are versions before 1.0.
- `generator` (`"Monolio 1.0.0"`) is the **app version** that saved the file. It is for information only (Monolio does not read it
  when opening), and the same text is in `<meta name="generator">` and in the first-line comment. It is a different number from the format version.

- `pages` is the content. Pages can be nested; a block of type `page` (`pageId`) links to a child page. A page with
  `locked: true` was locked by its owner: do not change it (suggestions for it cannot be accepted either).
- A page may have an `icon` (one emoji shown above the title, in the page list and on links to the page) and a `cover`
  (an image attachment shown as a band above the title; `position` is the vertical position of the image, 0–100 %). 0.8.21.
- `settings` holds document-wide options, written only when on: `headingNumbers`, `fontStyle` (`"serif"` or `"mono"`;
  missing = the default sans-serif) and `smallText` (smaller body text). 0.8.21 added the last two.
- The top-level `title` is a copy of the first page's title. To rename, change the page's `title`.
- `suggestions` holds proposed changes (section 3). It may be missing.
- `derived` on a block holds **display values for reading only** (formula results `values`, table/figure numbers `label`,
  heading numbers `number`). It is thrown away when the file is opened and rebuilt on save.

### Blocks

Every block has an `id` (letters, digits, `-` and `_`, up to 128 characters, unique in the document) and a `type`.
**Never change an id**: references, suggestions and charts point to blocks by id.

| type | fields |
|---|---|
| `paragraph` | `text`, and `html` when it has formatting |
| `heading1` … `heading5` | `text` (`html`). `derived.number` when heading numbers are on |
| `bullet` / `numbered` | `text` (`html`), `indent` (0 or more). `numbered` may have `listStyle`: `"nested"` (1. → 1.1 → 1.1.1), `"decimal"` (1.), `"alpha"` (a.) or `"roman"` (i.); the first item of a run of items at the same level decides the style of the run. Without it, a nested run follows its parent: 1. → a. → i. by depth under a decimal, alpha or roman parent, otherwise nested (0.8.20) |
| `todo` | `text`, `checked` (true / false) |
| `toggle` / `toggleHeading1` … `toggleHeading5` | `text`, `open`. The blocks after it with a deeper `indent` are its contents |
| `quote` | `text` |
| `code` | `text` (code as written), `language` (the language for syntax colors: `"javascript"`, `"typescript"`, `"python"`, `"c"`, `"cpp"`, `"csharp"`, `"java"`, `"go"`, `"rust"`, `"json"`, `"html"`, `"xml"`, `"css"`, `"sql"`, `"bash"`, `"yaml"` or `"markdown"`; without it, plain text; 0.8.21) |
| `callout` | `text` (`html`), `icon` (one emoji shown at the left of the tinted box; without it 💡; 0.8.20) |
| `math` | `text` in TeX (`\int_0^1 x^2\,dx`) |
| `mermaid` | `text` with Mermaid code, `caption` |
| `chart` | `text` with chart code (`table(id="<table block id>")` picks the table; `scatter(A1:A20, B1:B20)`, `plot`, `bar`, `barh`, `hist`, `pie`, `title("…")`, `xlabel("…")`, `ylabel("…")`), `caption` |
| `table` | `rows` (below), `caption`, `tableHeader` (first row is a header), `tableHeaderColumn` (first column is a header) |
| `attachment` | `attachmentId` (an id in `attachments`), `caption`, `imageWidth`, `imageAlign` (width and alignment for images, videos and PDFs), `attachmentView: "file"` (show an image, video, audio or PDF as a plain file card; 0.8.16; audio plays in place since 0.8.20) or `"read"` (a PDF shown in a short scrolling frame; without it a PDF shows a small first-page preview; 0.8.19), `viewHeight` (px height of that frame, 80 or more; default 300; 0.8.19) |
| `page` | `pageId` (link to a child page) |
| `divider` / `pagebreak` / `toc` | no content (rule, page break, table of contents) |

Any block may also have `indent` and `columnGroup` / `columnIndex` / `columnWidth` (blocks with the same `columnGroup`
sit side by side). Text blocks (`paragraph`, headings, `bullet`, `numbered`, `todo`, toggles, `quote`, `callout`) may have
`color` for the whole block: `gray` `brown` `orange` `yellow` `green` `blue` `purple` `pink` `red` (text color), or one of
these with `_background` such as `"red_background"` (background color). One value only, like Notion (0.8.20).
Keep every field you do not know as it is.

### Text and formatting (`text` and `html`)

- `text` is the text. `html` (optional) is the same text with inline formatting. A block can have `html` even without visible formatting.
- `html` may use `b` `strong` `i` `em` `s` `del` `u` (underline; 0.8.17) `span` (style: color, background color, font size, font family) `code`
  `br` `a` (`href`: http, https or mailto only), and the reference mark
  `<span class="figure-ref" data-ref="<block id>">Table 1</span>` (since 0.8.18 `data-ref` can also be a page id: a link to that page, shown as the page title; since 0.8.20 a mark with `data-ref-kind="block"` is a link to any block, shown as the start of that block's text). Since 0.8.20 a date is
  `<span class="date-mention" data-date="2026-10-30">2026年10月30日</span>`: `data-date` (ISO year-month-day) is the value, and the shown text
  (also in `text`) is made from it as "YYYY年M月D日". Anything else is removed when the file is opened.
- Inside `text`: `` `code` `` is inline code, `$$E = mc^2$$` is inline math, and `\n` is a line break.
- **`text` and `html` must contain the same characters.** If you change the text of a block that has `html`, change both,
  or (better) use a suggestion: Monolio then changes the characters and keeps the formatting.

### Tables

```json
{ "id": "t1", "type": "table", "caption": "Test conditions", "tableHeader": true,
  "rows": [
    [ { "text": "Case" }, { "text": "Voltage" }, { "text": "Power" } ],
    [ { "text": "A" },    { "text": "12" },      { "text": "=B2*0.5" } ]
  ],
  "derived": { "label": "Table 1", "values": [["Case","Voltage","Power"],["A","12","6"]] } }
```

- `rows` is an array of rows; each row is an array of cells `{ "text": "…" }`, and all rows have the same number of cells.
  Positions count from 0: `row: 0` is the first row, including a header row.
- A cell whose text starts with `=` is a formula, as in a spreadsheet: `=B2*2`, `=SUM(B2:B5)`, `A:A`, `$A$1`.
  Functions: SUM AVERAGE MIN MAX COUNT COUNTA ROUND ROUNDUP ROUNDDOWN INT ABS IF IFERROR AND OR NOT TRUE FALSE COUNTIF SUMIF.
  The results are in `derived.values`.
- **Formulas read cells as numbers.** A cell with a unit, such as `12.0 V`, is text and counts as 0, so formulas that use
  it silently give wrong results. Keep numbers in cells that formulas use and put units in the header (`Voltage (V)`),
  or ask the person first.
- Merged cells: `colSpan` / `rowSpan` on the top-left cell, `covered: true` on the cells it hides. Avoid changing the shape of a table with merged cells.
- Cells may also have `align`, `numberFormat` (`{ "decimals": 1 }` shows one decimal place without changing the value),
  `color`, `background`, `link`; tables may have `database`, `tableFilter` and more. Keep them as they are.
- A cell's `link` is where the cell points to (`https://…`, the file name of an HTML file in the same folder, or a page of this document as `#page-<page id>`); the cell's text is its title. Any table cell may have one, not only the link columns of a database.
- A database table has `database: { "columns": [{ "type": "…" }, …] }` (one entry per column; row 0 holds the column names). Every value
  is still the cell's `text`; the type only changes how it is shown: `text` `number` `date` `select` `check` (`✓` or empty) `link`, and since
  0.8.21 `multi` (names separated by `,`: `"design, urgent"`), `status` (a name; `未着手` / `進行中` / `完了` and similar names set its group),
  `url` `email` `phone` (the text is the address), `file` (`link` is `#block-<attachment block id>`, the text is the file name), and
  `created` / `edited` (`"2026-10-26 14:05"`, local time; Monolio writes these when a row is added or changed — keep them as they are).
- `tableGroupBy: { "column": 2, "collapsed": ["完了"] }` (0.8.21) shows the rows grouped by the values of that column. It only changes the view:
  the order of `rows`, formulas and charts stay the same. `derived.groups` lists the shown groups and their row positions.

---

## 3. Changing the document: add a suggestion (recommended)

Do this whenever you are asked to change, fix or edit a Monolio file, unless the person explicitly asks you to apply the
changes without review. **Do not edit `pages`.** Append **one** object to `suggestions` (create the array if it is
missing). The person sees the differences in Monolio and accepts or rejects them, per change or all at once.

```json
"suggestions": [
  {
    "author": { "name": "Claude", "kind": "ai" },
    "title": "Align the test conditions with the standard",
    "reason": "The in-house standard specifies 23 ±2 °C and five measurements.",
    "changes": [
      { "op": "setText", "block": "p1", "text": "The test was run at 23±2℃, measuring each case five times." },
      { "op": "setCell", "block": "t1", "row": 1, "col": 1, "text": "12.0" },
      { "op": "insertBlock", "after": "t1", "item": { "type": "paragraph", "text": "Warm up the unit before measuring." } },
      { "op": "deleteBlock", "block": "p2" }
    ]
  }
]
```

| op | fields | does |
|---|---|---|
| `setText` | `block`, `text` (the **whole** new text) | replaces the text of a block. Monolio shows the difference word by word |
| `setCell` | `block` (table id), `row`, `col`, `text` | replaces a table cell (formulas allowed) |
| `insertBlock` | `after` (id of the block before it), `item` (the new block) | adds a block. To add at the top of a page, omit `after` and give `page` (page id) |
| `deleteBlock` | `block` | removes a block |

- **One suggestion may hold any number of changes** (paragraphs and tables together). The person can accept a whole
  suggestion, one block or one table column, or a single change. Put unrelated changes in separate suggestions.
- `author.kind` is `"ai"`, `"human"` or `"tool"`. Keep `title` short and give the reason in `reason`.
- **`id` and `before` (the value before the change) may be omitted**; Monolio fills them in. If you give `before`, give
  the current value exactly. If the person has changed that place since, the change is shown as outdated and cannot be accepted.
- `item` in `insertBlock` is a block as in section 2 (`id` may be omitted). Do not give column fields (it joins the
  column of the block before it). An `attachment` block must use an id that exists in `attachments`.
- Several `insertBlock` with the same `after` are inserted in the order you list them. `after` must be an existing block,
  not a block added by another change.
- Adding `html` (the formatted new text) to `setText` replaces the whole paragraph with that formatting; its characters
  must equal `text`, or the change cannot be accepted. Leave `html` out when the formatting stays the same.
- Not possible with suggestions: adding or removing table rows or columns, moving blocks, adding pages, renaming pages,
  changing a block's type (add a new block with `insertBlock` and remove the old one with `deleteBlock` instead).

### Reading the results

When the person decides, Monolio writes the results the next time it saves:

- `result` on each change: `"accepted"`, `"rejected"` or `"partial"` (only some words of a text change were accepted;
  the per-word results are in `hunkResults`). No `result` yet means undecided.
- A suggestion that is fully decided gets `"status": "done"`. An accepted `insertBlock` gets `insertedId` (the id of the added block).
- Decided suggestions stay in the file. Add new suggestions after them; do not edit or remove existing ones.

---

## 4. Editing `pages` directly

Only when the person asks you to apply changes without review:

- Keep every id. Give new blocks ids that are unique in the document (a UUID works).
- Keep `text` and `html` consistent (section 2). Keep fields you do not know. Do not update `derived`.
- The rendered HTML stays old until Monolio saves the file again, so a browser opening the file directly still shows the old text.
- If the file is open in Monolio (opened with File → Open), Monolio notices the change and shows it to the person as a
  suggestion (it is not applied until accepted, and rejected changes disappear when the person saves).

---

## 5. Writing the file back

Replace only the JSON. For example, in Node.js:

```js
import { readFileSync, writeFileSync } from "node:fs";
const file = "document.html";
const html = readFileSync(file, "utf8");
const marker = 'id="document-manifest">';
const start = html.indexOf(marker) + marker.length;
const end = html.indexOf("</script>", start);
const doc = JSON.parse(html.slice(start, end));

doc.suggestions = [...(doc.suggestions || []), {
  author: { name: "Claude", kind: "ai" },
  title: "Show voltages with one decimal place",
  reason: "Make the voltage column consistent.",
  changes: [{ op: "setCell", block: "t1", row: 1, col: 1, text: "12.0" }],
}];

const json = JSON.stringify(doc, null, 2).replace(/</g, "\\u003c");
writeFileSync(file, html.slice(0, start) + json + html.slice(end), "utf8");
```

- Always write `<` as `<`. Otherwise `</script>` inside the text ends the JSON early and the file no longer opens.
- Parse the JSON again after writing to check it.
- Monolio may read the file while you are writing it; that is safe (it reads again once the file is complete).

## 6. Do not

- Edit the rendered HTML, the diagram pictures or the attachment data (they are not read, and the copy drifts from the content).
- Change or reuse block ids, or change `format`.
- Change or remove what people decided (`result` and so on) or other people's suggestions.
- Change `formatVersion` or `generator` (Monolio writes them when it saves).
