const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Bot iniciado en la nube");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;
  const SGA_USER = process.env.SGA_USER;
  const SGA_PASS = process.env.SGA_PASS;

  // 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();
  console.log("📥 Códigos cargados:", codigos);

  // 2. ABRIR NAVEGADOR
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 3. LOGIN EN SGA
  console.log("🔑 Iniciando sesión en SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/login', { waitUntil: 'domcontentloaded' });

  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.fill('input[type="text"], input[type="email"]', SGA_USER);
    await passwordInput.fill(SGA_PASS);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  // 4. IR A PROPUESTAS
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // 5. LOOP DE CÓDIGOS
  for (const codigoBase of codigos) {
    console.log("\n🔎 Buscando:", codigoBase);

    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.fill('');
    await input.fill(codigoBase);

    await page.waitForTimeout(4000);

    const filas = page.locator('tr', { hasText: codigoBase });
    const count = await filas.count();

    console.log(`📊 Filas encontradas para ${codigoBase}:`, count);

    if (count === 0) {
      console.log("⚠️ No se encontraron filas");
      continue;
    }

    const loteResultados = [];

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
      loteResultados.push({ codigo, confirmados });
    }

    if (loteResultados.length > 0) {
      const postRes = await fetch(SHEETS_POST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loteResultados)
      });
      console.log("STATUS:", postRes.status);
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado con éxito");
  await browser.close();
})();
