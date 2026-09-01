const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log("🚀 Bot iniciado");

  const SHEETS_GET = process.env.SHEETS_GET;
  const SHEETS_POST = process.env.SHEETS_POST;

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET, { redirect: 'follow' });
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

  // 🔐 RESTAURAR SESIÓN DESDE GITHUB SECRETS
  if (process.env.STORAGE_STATE) {
    fs.writeFileSync('state.json', process.env.STORAGE_STATE);
  }

  // 🧠 2. ABRIR NAVEGADOR CON LA SESIÓN GUARDADA
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: fs.existsSync('state.json') ? 'state.json' : undefined
  });
  const page = await context.newPage();

  // 🔑 IR DIRECTO A PROPUESTAS (YA LOGUEADO)
  console.log("🔑 Ingresando a la plataforma...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // 🔁 3. LOOP DE CÓDIGOS (TU CÓDIGO EXACTO)
  for (const codigoBase of codigos) {
    console.log("\n🔎 buscando:", codigoBase);

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

      const postRes = await fetch(SHEETS_POST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: 'follow',
        body: JSON.stringify({ codigo, confirmados })
      });

      console.log("STATUS:", postRes.status);
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado");
  await browser.close();
})();
