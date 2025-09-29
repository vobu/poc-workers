import http from 'http';
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('its alive, muahahaha')
    return
  }
  res.writeHead(418)
  res.end()
}).listen(process.env.PORT || 3000, () => {
  console.log(`Health check server running on port ${process.env.PORT || 3000}`)
})