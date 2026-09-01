const { chromium } = require('playwright');

(async () => {
  console.log("🚀 Bot iniciado");

  // Toma las URLs directo de los Secrets cargados en GitHub
  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET, { redirect: 'follow' });
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No se encontraron códigos para procesar.");
    return;
  }

  // 🧠 2. ABRIR NAVEGADOR EN MODO NUBE
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');
  await page.waitForLoadState('networkidle');

  // Autenticación si pide credenciales
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

  // 🔁 3. LOOP DE CÓDIGOS (TU LÓGICA ORIGINAL)
  for (const codigoBase of codigos) {
    console.log("\n🔎 buscando:", codigoBase);

    const input = page.locator('input:visible').first();
    await input.fill('');
    await input.fill(codigoBase);

    // Esperar render del filtro (CRÍTICO)
    await page.waitForTimeout(4000);

    const filas = page.locator('tr', {
      hasText: codigoBase
    });

    const count = await filas.count();
    console.log(`📊 filas encontradas para ${codigoBase}:`, count);

    if (count === 0) {
      console.log("⚠️ No se encontraron filas");
      continue;
    }

    // 🔁 4. recorrer todas las variantes
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

      // 📤 enviar a Sheets
      const postRes = await fetch(SHEETS_POST, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          codigo,
          confirmados
        }),
        redirect: 'follow'
      });

      console.log("STATUS:", postRes.status);
      console.log("RESP:", await postRes.text());
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado");
  await browser.close();
})();
