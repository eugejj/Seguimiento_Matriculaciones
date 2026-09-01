const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 10000;

// Memoria temporal para guardar los resultados extraídos
let ultimosResultados = { estado: "idle", datos: [], error: null };

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ENDPOINT 1: Consultar estado/resultados
  if (url.pathname === '/resultados') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(ultimosResultados));
    return;
  }

  // ENDPOINT 2: Iniciar proceso
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, mensaje: "Bot iniciado en segundo plano." }));

  // Iniciar Scraping en segundo plano
  if (ultimosResultados.estado !== "procesando") {
    ultimosResultados = { estado: "procesando", datos: [], error: null };
    ejecutarScraper()
      .then(res => { ultimosResultados = { estado: "finalizado", datos: res, error: null }; })
      .catch(err => { ultimosResultados = { estado: "error", datos: [], error: err.message }; });
  }

}).listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});

async function ejecutarScraper() {
  console.log("🚀 Iniciando extracción en SGA...");
  const SHEETS_GET = process.env.SHEETS_GET;
  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();

  if (!codigos || codigos.length === 0) return [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // Autenticación automática
  const passInput = page.locator('input[type="password"]');
  if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.locator('input[type="text"], input[name="username"], input[name="user"]').first().fill(process.env.SGA_USER || '');
    await passInput.first().fill(process.env.SGA_PASS || '');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
  }

  const resultados = [];

  for (const codigoBase of codigos) {
    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible', timeout: 60000 });

    await input.fill('');
    await input.fill(codigoBase);
    await page.waitForTimeout(4000);

    const filas = page.locator('tr', { hasText: codigoBase });
    const count = await filas.count();

    for (let i = 0; i < count; i++) {
      const fila = filas.nth(i);
      const tds = fila.locator('td');
      const columnas = await tds.count();

      if (columnas === 0) continue;

      const codigo = (await tds.nth(1).innerText()).trim();
      let confirmados = "0";

      if (columnas > 11) {
        confirmados = (await tds.nth(11).innerText()).trim();
      }

      resultados.push({ codigo, confirmados });
    }
  }

  await browser.close();
  return resultados;
}
