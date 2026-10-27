# Monolio (PWA)

This is the PWA version of Monolio, the single HTML document editor.

Run locally:

```powershell
npm run pwa:serve
```

Open:

```text
http://127.0.0.1:4173/
```

The app can be installed from Chrome or Edge. It captures `Ctrl+S`; browsers
with the File System Access API can save back to an opened file, while other
browsers fall back to downloading the exported `.html`.

Test:

```powershell
npm run pwa:test
```
