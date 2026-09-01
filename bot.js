const { chromium } = require('playwright');

(async () => {

  console.log("🚀 Bot iniciado en Render");

  // 📥 LEER CÓDIGOS Y POSTEAR DESDE ENV
  const SHEETS_GET = process.env.SHEETS_GET || "https://script.google.com/macros/s/AKfycbw5ReP1DrK1zW7Xjn9qJcWlVYivcz0-CxbN3ZAa3Kp6HiVYPMdpA3-XA3vHVMRq2Ste/exec";
  const SHEETS_POST = process.env.SHEETS_POST || "https://script.google.com/macros/s/AKfycbw5ReP1DrK1zW7Xjn9qJcWlVYivcz0-CxbN3ZAa3Kp6HiVYPMdpA3-XA3vHVMRq2Ste/exec";

  // 🔥 1. TRAER CÓDIGOS
  const res = await fetch(SHEETS_GET);
  const codigos = await res.json();

  console.log("📥 códigos cargados:", codigos);

  if (!codigos || codigos.length === 0) {
    console.log("⚠️ No hay códigos para procesar.");
    return;
  }

  // 🧠 2. ABRIR NAVEGADOR (Modo Cloud / Headless)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000); // 60s timeout para Render

  console.log("🌐 Navegando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // 🔐 MANEJO DE LOGIN EN NUBE (Si solicita credenciales)
  const usuarioInput = page.locator('input[type="text"], input[name="username"], input[name="user"]').first();
  if (await usuarioInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("🔑 Iniciando sesión en el SGA...");
    await usuarioInput.fill(process.env.SGA_USER);
    await page.locator('input[type="password"]').fill(process.env.SGA_PASS);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"], button:has-text("Ingresar")')
    ]);
    console.log("✅ Sesión iniciada.");
  }

  // 🔁 3. LOOP DE CÓDIGOS
  for (const codigoBase of codigos) {

    console.log("\n🔎 buscando:", codigoBase);

    // Esperar a que el buscador esté listo y visible
    const input = page.locator('input:visible').first();
    await input.waitFor({ state: 'visible', timeout: 60000 });
    
    // Limpiar e ingresar el código
    await input.fill('');
    await input.fill(codigoBase);

    // 🔥 esperar render del filtro
    await page.waitForTimeout(4000);

    // 🔥 buscar filas
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

  await browser.close();

})();
