// 🔑 3. NAVEGAR Y ASEGURAR LOGIN
  console.log("🔑 Entrando al SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });

  // Si la página nos rebotó al login por no estar autenticados:
  if (page.url().includes('login')) {
    console.log("🔑 Formulario de login detectado, ingresando credenciales...");
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });
    
    // Completar usuario y contraseña
    await page.locator('input[type="text"], input[type="email"]').first().fill(SGA_USER);
    await page.locator('input[type="password"]').fill(SGA_PASS);
    
    // Hacer clic en entrar
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);
  }

  // Asegurar que estamos en propuestas y que el buscador existe antes de iterar
  if (!page.url().includes('propuestas')) {
    await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });
  }

  // Espera absoluta a que la tabla o los inputs existan en el DOM
  await page.waitForTimeout(5000);
