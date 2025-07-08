const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');

// 設定ファイルの読み込み
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const proxy = httpProxy.createProxyServer({});

const TARGET = config.target || 'http://127.0.0.1:8000'; // 設定ファイルで指定、なければデフォルト

const server = http.createServer((req, res) => {
  // /[name]/*** 形式のリクエストか判定
  const match = req.url.match(/^\/(\w+)(\/.*)?$/);
  if (match && Array.isArray(config.rules)) {
    const rule = config.rules.find(r => r.name === match[1]);
    if (rule) {
      // /[name]/*** → from + *** へProxy
      const newPath = (match[2] || '');
      const targetUrl = rule.from + newPath;
      // ここでは from をURLとして扱う（例: http://a.hoge.com）
      proxy.web(req, res, { target: targetUrl, selfHandleResponse: true });
      return;
    }
  }
  // 通常のProxy
  proxy.web(req, res, { target: TARGET, selfHandleResponse: true });
});

// WebSocket対応（置換は行わず単純プロキシ）
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: TARGET });
});

proxy.on('proxyRes', function (proxyRes, req, res) {
  let body = Buffer.from('');
  proxyRes.on('data', function (data) {
    body = Buffer.concat([body, data]);
  });
  proxyRes.on('end', function () {
    let content = body.toString();
    // すべてのルールで置換: from→/[name]/*** 形式
    if (Array.isArray(config.rules)) {
      for (const rule of config.rules) {
        // fromに一致した部分を /[name]/$1 に置換
        const re = new RegExp(rule.from + '(\/[^\s"\']*)?', 'g');
        content = content.replace(re, (m, p1) => `/${rule.name}${p1 || ''}`);
      }
    }
    // CORS対応: 全て * に設定
    const headers = Object.assign({}, proxyRes.headers, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    });
    res.writeHead(proxyRes.statusCode, headers);
    res.end(content);
  });
});

server.listen(8080, () => {
  console.log('Proxy server listening on port 8080 (proxying to', TARGET, ')');
});