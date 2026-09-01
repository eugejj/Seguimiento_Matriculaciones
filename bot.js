const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Bot iniciado");

  // 📥 LEER URLS Y CREDENCIALES
  const SHEETS_GET = process.env.SHEETS_GET || "https://script.google.com/macros/s/AKfycbzp-jqq8O7yhevZSxo034L59tJl5paEayUR6AG_s661LRmLF_0h-UdnjJ7u-StBp_6H/exec";
  const SHEETS_POST = process.env.SHEETS_POST || "https://script.google.com/macros/s/AKfycbyP9W0kC0bBGoy9_yDU5LFoz0WtYOr2qXw8TjcXaFLTTBAPrBx_xbZaoYu8lNal_3Mk2Q/exec";
  const SGA_USER = process.env.SGA_USER;
  const SGA_PASS = process.env.SGA_PASS;

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET, { redirect: 'follow' });
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No se encontraron códigos para procesar.");
    return;
  }

  // 🧠 2. ABRIR NAVEGADOR
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 🔑 3. LOGIN EN SGA
  console.log("🔑 Yendo a pantalla de login...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/login', { waitUntil: 'networkidle' });

  console.log("📍 URL actual:", page.url());

  // Esperar a que los elementos DOM existan
  const inputUsuario = page.locator('input').first();
  await inputUsuario.waitFor({ state: 'attached', timeout: 30000 });

  // Rellenar datos
  await page.locator('input').nth(0).fill(SGA_USER || '');
  await page.locator('input[type="password"]').fill(SGA_PASS || '');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    page.locator('button, input[type="submit"]').first().click()
  ]);

  console.log("✅ Sesión iniciada. URL posterior:", page.url());

  // Ir a propuestas
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
  await page.waitForLoadState('networkidle');

  // 🔁 4. LOOP DE CÓDIGOS
  for (const codigoBase of codigos) {
    console.log("\n🔎 buscando:", codigoBase);

    try {
      const input = page.locator('input:visible').first();
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

        // 📤 ENVIAR A SHEETS
        const postRes = await fetch(SHEETS_POST, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          redirect: 'follow',
          body: JSON.stringify({ codigo, confirmados })
        });

        console.log("STATUS:", postRes.status);
        console.log("RESP:", await postRes.text());
      }
    } catch (err) {
      console.log(`❌ Error procesando ${codigoBase}: ${err.message}`);
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado");
  await browser.close();
})();
