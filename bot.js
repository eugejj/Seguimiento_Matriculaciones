const { chromium } = require('playwright');

(async () => {

  console.log("🚀 Bot iniciado en la nube");

  // 📥 LEER CÓDIGOS Y URLS DE ENTORNO
  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;
  const SGA_USER = process.env.SGA_USER;
  const SGA_PASS = process.env.SGA_PASS;

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

  // 🧠 2. ABRIR NAVEGADOR (Modo Nube)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 🔑 3. LOGIN EN SGA
  console.log("🔑 Iniciando sesión en SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/login'); // O la URL de tu login
  await page.waitForLoadState('networkidle');

  // Si pide credenciales:
  if (await page.locator('input[type="password"]').isVisible()) {
    await page.fill('input[type="text"], input[type="email"]', SGA_USER);
    await page.fill('input[type="password"]', SGA_PASS);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  // Navegar a la lista
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
  await page.waitForLoadState('networkidle');

  // 🔁 4. LOOP DE CÓDIGOS (TU LÓGICA EXACTA QUE FUNCIONABA)
  for (const codigoBase of codigos) {

    console.log("\n🔎 buscando:", codigoBase);

    // Esperar a que el buscador esté listo y sea visible
    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.fill('');
    await input.fill(codigoBase);

    // 🔥 esperar render del filtro (CRÍTICO)
    await page.waitForTimeout(4000);

    // 🔥 buscar filas (SIN regex)
    const filas = page.locator('tr', { hasText: codigoBase });
    const count = await filas.count();

    console.log(`📊 filas encontradas para ${codigoBase}:`, count);

    if (count === 0) {
      console.log("⚠️ No se encontraron filas");
      continue;
    }

    // Array para juntar los resultados y enviarlos de golpe
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

    // 📤 Enviar lote a Apps Script
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
