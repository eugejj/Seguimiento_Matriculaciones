// 🔑 3. LOGIN EN SGA Y NAVEGACIÓN SEGURA
  console.log("🔑 Iniciando sesión en SGA...");
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/login', { waitUntil: 'domcontentloaded' });

  // Si aparecen los campos de login, completar credenciales
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.fill('input[type="text"], input[type="email"]', SGA_USER);
    await passwordInput.fill(SGA_PASS);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  // Ir a la sección de propuestas y esperar a que el buscador exista
  await page.goto('https://sga-escuelademaestros.buenosaires.gob.ar/capacitadores/propuestas', { waitUntil: 'networkidle' });
  
  // Espera crítica: aguardar a que la tabla o el buscador estén efectivamente presentes
  await page.waitForSelector('input', { timeout: 30000 });
