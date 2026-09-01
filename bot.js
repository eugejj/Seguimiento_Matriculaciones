require('dotenv').config();
const { chromium } = require('playwright');

(async () => {

  console.log("🚀 Bot iniciado");

const SHEETS_GET = process.env.SHEETS_GET;
const SHEETS_POST = process.env.SHEETS_POST;

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

// 🧠 2. ABRIR NAVEGADOR
  const context = await chromium.launchPersistentContext('./perfil-sga', {
    headless: true
  });

  const page = await context.newPage();

  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas');

  await page.waitForLoadState('networkidle');

  // 🔁 3. LOOP DE CÓDIGOS
  for (const codigoBase of codigos) {

    console.log("\n🔎 buscando:", codigoBase);

    // limpiar input antes de escribir
    const input = page.locator('input:visible').first();
    await input.fill('');
    await input.fill(codigoBase);

    // 🔥 esperar render del filtro (CRÍTICO)
    await page.waitForTimeout(4000);

    // 🔥 buscar filas (SIN regex)
    const filas = page.locator('tr', {
      hasText: codigoBase
    });

    const count = await filas.count();

    console.log(`📊 filas encontradas para ${codigoBase}:`, count);

    if (count === 0) {
      console.log("⚠️ No se encontraron filas");
      continue;
    }

    // 🔁 4. recorrer todas las variantes (C0766-01, etc.)
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          codigo,
          confirmados
        })
      });

      console.log("STATUS:", postRes.status);
      console.log("RESP:", await postRes.text());
    }

    await page.waitForTimeout(2000);
  }

  console.log("\n✅ Bot terminado");

  await context.close();

})();