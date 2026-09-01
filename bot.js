const http = require('http');
const { chromium } = require('playwright');

// Servidor HTTP dummy para mantener vivo el Web Service en Render
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot activo');
}).listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});

(async () => {
  console.log("🚀 Bot iniciado en Render");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;

  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();
  console.log("📥 Códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No hay códigos para procesar.");
    return;
  }

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

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // PASO CRÍTICO: Detectar e iniciar sesión si la página redirige al login
  const passInput = page.locator('input[type="password"]');
  if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("🔑 Pantalla de login detectada. Autenticando...");
    
    // Rellena usuario y contraseña desde las Variables de Entorno de Render
    await page.locator('input[type="text"], input[name="username"], input[name="user"]').first().fill(process.env.SGA_USER);
    await passInput.first().fill(process.env.SGA_PASS);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
    console.log("✅ Sesión iniciada correctamente.");
  }

  // LOOP DE BÚSQUEDA
  for (const codigoBase of codigos) {
    console.log("\n🔎 buscando:", codigoBase);

    // Esperar a que el buscador del SGA esté listo tras estar logueado
    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible', timeout: 60000 });

    await input.fill('');
    await input.fill(codigoBase);

    await page.waitForTimeout(4000);

    const filas = page.locator('tr', { hasText: codigoBase });
    const count = await filas.count();

    console.log(`📊 filas encontradas para ${codigoBase}:`, count);

    if (count === 0) {
      console.log("⚠️ No se encontraron filas");
      continue;
    }

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

      console.log({ codigo, confirmados });

      await fetch(SHEETS_POST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, confirmados })
      });
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado con éxito");
  await browser.close();
})();
