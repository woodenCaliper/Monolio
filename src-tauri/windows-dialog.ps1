# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) woodenCaliper
# windows-save-e2e.mjs が使う(v281)。Windows の OS の画面(開く・名前を付けて保存・確認)を、題名とクラス(#32770)で探して前に出し、打つ。
#   windows-dialog.ps1 -Title 開く -Path C:\...\a.html   … ファイル名の欄に場所を貼って Enter(日本語でも崩れないよう、クリップボードで貼る。前の文字は戻す)
#   windows-dialog.ps1 -Title Monolio -Keys "{ESC}"      … 確認の画面を前に出してキーを送る(Enter・Esc の決まりを見る)
param([string]$Title, [string]$Path = "", [string]$Keys = "", [int]$TimeoutMs = 10000)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class Dlg {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static IntPtr Find(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(64); GetClassName(h, c, 64);
      if (t.ToString() == title && c.ToString() == "#32770") { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
$deadline = (Get-Date).AddMilliseconds($TimeoutMs)
$h = [IntPtr]::Zero
while ((Get-Date) -lt $deadline -and $h -eq [IntPtr]::Zero) { $h = [Dlg]::Find($Title); if ($h -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 200 } }
if ($h -eq [IntPtr]::Zero) { "notfound"; exit 1 }
[Dlg]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 600
if ($Path) {
  $before = $null
  try { $before = Get-Clipboard -Raw -ErrorAction Stop } catch {}
  Set-Clipboard -Value $Path
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Start-Sleep -Milliseconds 500
  if ($null -ne $before) { Set-Clipboard -Value $before }
}
if ($Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
"ok"
