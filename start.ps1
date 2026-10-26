# Gods Robot Killer — локальный запуск: маленький сервер на этом компьютере (браузер не пускает игру с диска напрямую)
$root = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'game'
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.png'='image/png'; '.mp3'='audio/mpeg'; '.json'='application/json'; '.css'='text/css'; '.txt'='text/plain; charset=utf-8' }
$l = $null; $port = 0
foreach ($p in 8765..8785) { try { $t = New-Object System.Net.HttpListener; $t.Prefixes.Add("http://localhost:$p/"); $t.Start(); $l = $t; $port = $p; break } catch { } }
if (-not $l) { Write-Host 'Не получилось открыть порт 8765-8785'; Read-Host 'Enter — закрыть'; exit }
Write-Host "Игра: http://localhost:$port/   (редактор: http://localhost:$port/editor.html)"
Write-Host 'Это окно не закрывайте, пока играете.'
Start-Process "http://localhost:$port/"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/'); if ($rel -eq '') { $rel = 'index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($f.StartsWith($root) -and (Test-Path -LiteralPath $f -PathType Leaf)) {
      $b = [IO.File]::ReadAllBytes($f); $e = [IO.Path]::GetExtension($f).ToLower()
      if ($mime.ContainsKey($e)) { $c.Response.ContentType = $mime[$e] }
      $c.Response.ContentLength64 = $b.Length; $c.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { } finally { $c.Response.Close() }
}
