# Servidor web simple para desarrollo local
$port = 8000
$url = "http://localhost:$port"

Write-Host "🚀 Iniciando servidor en $url" -ForegroundColor Green
Write-Host "📂 Directorio: $PWD" -ForegroundColor Cyan
Write-Host "🌐 Abre tu navegador en: $url/venta.html" -ForegroundColor Yellow
Write-Host "⏹️  Presiona Ctrl+C para detener el servidor" -ForegroundColor Red
Write-Host ""

# Crear listener HTTP
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("$url/")
$listener.Start()

# Abrir navegador automáticamente
Start-Process "$url/venta.html"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Obtener ruta del archivo
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        $filePath = Join-Path $PWD $path.TrimStart('/')
        
        Write-Host "📄 $($request.HttpMethod) $path" -ForegroundColor Gray
        
        if (Test-Path $filePath -PathType Leaf) {
            # Determinar tipo MIME
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".gif"  { "image/gif" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }
            
            # Leer y enviar archivo
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            # 404 Not Found
            $response.StatusCode = 404
            $html = "<h1>404 - Archivo no encontrado</h1><p>$path</p>"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "🛑 Servidor detenido" -ForegroundColor Red
}
