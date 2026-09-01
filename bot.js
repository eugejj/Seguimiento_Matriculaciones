const { chromium } = require('playwright');

async function ejecutarScraper() {
  console.log("🚀 Bot iniciado en GitHub Actions...");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;

  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();
  console.log("📥 Códigos a procesar desde Sheets:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No hay códigos para procesar.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // Autenticación automática
  const passInput = page.locator('input[type="password"]');
  if (await passInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("🔑 Iniciando sesión...");
    await page.locator('input[type="text"], input[name="username"], input[name="user"]').first().fill(process.env.SGA_USER || '');
    await passInput.first().fill(process.env.SGA_PASS || '');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
  }

  // Recorrido de búsqueda
  for (const codigoBase of codigos) {
    console.log("🔎 Buscando código:", codigoBase);
    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible' });
    await input.fill(codigoBase);
    await page.waitForTimeout(3000);

    const filas = page.locator('tr', { hasText: codigoBase });
    const count = await filas.count();

    for (let i = 0; i < count; i++) {
      const tds = filas.nth(i).locator('td');
      if (await tds.count() === 0) continue;

      const codigo = (await tds.nth(1).innerText()).trim();
      const confirmados = (await tds.count() > 11) ? (await tds.nth(11).innerText()).trim() : "0";

      console.log(`📤 Guardando en planilla: ${codigo} -> ${confirmados}`);

      await fetch(SHEETS_POST, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ codigo, confirmados }),
        redirect: 'follow'
      });
    }
  }

  await browser.close();
  console.log("✅ Extracción finalizada con éxito.");
}

ejecutarScraper().catch(err => {
  console.error("❌ Error en la ejecución:", err);
  process.exit(1);
});
