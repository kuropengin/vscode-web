import express from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";

const PORT = process.env.PROXY_PORT || 3000;
const VSCODE_PORT = process.env.TARGET_VSCODE_PORT || 8080;
const VSCODE_HOST = process.env.TARGET_VSCODE_HOST || "localhost";

const app = express();

/**
 * ===============================
 *  外部ドメイン用プロキシ設定
 * ===============================
 */

// vscode-unpkg.net (言語パック)
app.use("/proxy/unpkg", createProxyMiddleware({
    target: "https://www.vscode-unpkg.net/",
    changeOrigin: true,
    pathRewrite: { "^/proxy/unpkg": "" },
    onProxyRes(proxyRes) {
        proxyRes.headers["Access-Control-Allow-Origin"] = "*";
    }
}));


/**
 * ===============================
 *  serve-web 本体のプロキシ
 * ===============================
 */
app.use("/", createProxyMiddleware({
    target: `${VSCODE_HOST}:${VSCODE_PORT}`,
    changeOrigin: true,
    selfHandleResponse: true,
    ws: true,
    xfwd: true,
    onProxyReq: function(proxyReq, req, res){
        proxyReq.setHeader('Origin',proxyReq.protocol + "//" + proxyReq.host)
        proxyReq.setHeader('x-origin',proxyReq.protocol + "//" + proxyReq.host)
    },
    /**
     * HTML・JSの中のURL書き換え処理
     *  https://www.vscode-unpkg.net/..../nls.messages.js  → /proxy/unpkg
     */
    on: {
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
            const contentType = proxyRes.headers["content-type"] || "";
            if (contentType.includes("text/html")) {
                let body = responseBuffer.toString('utf8');

                // 書き換え対象
                const result = body.replace(
                    /https:\/\/www\.vscode-unpkg\.net\/[^"' ]*\/nls\.messages\.js/g,
                    (match) => {
                        return match.replace("https://www.vscode-unpkg.net", "/proxy/unpkg");
                    }
                );
                
                res.setHeader("Access-Control-Allow-Origin", "*");
                return result;
            } else {
                return responseBuffer;
            }
        })
    }
}));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`VSCode Proxy running on http://0.0.0.0:${PORT}`);
    console.log(`Forwarding VSCode serve-web (${VSCODE_HOST}:${VSCODE_PORT})`);
});