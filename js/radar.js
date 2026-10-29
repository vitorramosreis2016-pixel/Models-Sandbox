
"use strict";

(() => {
  const canvas = document.getElementById("radarCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  if (!ctx) {
    document.getElementById("runState").textContent =
      "Canvas indisponível";
    return;
  }

  const $ = (id) => document.getElementById(id);

  const playButton = $("playButton");
  const resetButton = $("resetButton");
  const intensityInput = $("intensity");
  const speedInput = $("speed");

  const intensityValue = $("intensityValue");
  const speedValue = $("speedValue");
  const maxDbz = $("maxDbz");
  const echoArea = $("echoArea");
  const frameCount = $("frameCount");
  const runState = $("runState");
  const stormReadout = $("stormReadout");
  const frameLabel = $("frameLabel");
  const legend = $("legend");
  const legendTicks = $("legendTicks");
  const productSelect = $("productSelect");
  const productTitle = $("productTitle");
  const legendName = $("legendName");
  const infoProductTitle = $("infoProductTitle");
  const motionToggle = $("motionToggle");
  let product = "reflectivity";
  const stormTrack = [];

  // Resolução interna do campo sintético.
  // A imagem é ampliada no Canvas para manter a renderização leve.
  const GRID = 512;
  const MAX_DBZ = 75;
  const PIXELS = GRID * GRID;

  const palette = [
    [0,   [8,  15, 24]],
    [5,   [17, 35, 68]],
    [10,  [32, 70, 155]],
    [15,  [43, 133, 207]],
    [20,  [48, 187, 198]],
    [25,  [42, 176, 93]],
    [30,  [85, 201, 61]],
    [35,  [171, 218, 50]],
    [40,  [246, 226, 53]],
    [45,  [255, 177, 43]],
    [50,  [246, 112, 35]],
    [55,  [226, 53,  43]],
    [60,  [196, 36,  91]],
    [65,  [215, 118, 183]],
    [70,  [239, 190, 239]],
    [75,  [255, 255, 255]]
  ];

  const image = ctx.createImageData(GRID, GRID);
  const field = new Float32Array(PIXELS);

  let running = true;
  let simTime = 0;
  let frames = 0;
  let lastTimestamp = 0;
  let lastStatsUpdate = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;

  let intensity = Number(intensityInput.value);
  let speed = Number(speedInput.value);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function gaussian(x, y, cx, cy, sx, sy, angle = 0) {
    const dx = x - cx;
    const dy = y - cy;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;

    return Math.exp(
      -0.5 * ((u / sx) ** 2 + (v / sy) ** 2)
    );
  }

  const productInfo = {
    reflectivity: {title:"Super-Res Reflectivity",unit:"dBZ",legend:"REFLECTIVIDADE",min:0,max:75,ticks:[0,10,20,30,40,50,60,75],colors:[[0,[8,15,24]],[5,[17,35,68]],[10,[32,70,155]],[15,[43,133,207]],[20,[48,187,198]],[25,[42,176,93]],[30,[85,201,61]],[35,[171,218,50]],[40,[246,226,53]],[45,[255,177,43]],[50,[246,112,35]],[55,[226,53,43]],[60,[196,36,91]],[65,[215,118,183]],[70,[239,190,239]],[75,[255,255,255]]]},
    velocity:{title:"Base Velocity",unit:"kt",legend:"VELOCIDADE RADIAL (SIMULADA)",min:-60,max:60,ticks:[-60,-40,-20,0,20,40,60],colors:[[-60,[0,40,180]],[-40,[40,130,255]],[-20,[135,205,255]],[-1,[220,230,235]],[1,[245,225,220]],[20,[255,150,100]],[40,[230,55,45]],[60,[150,0,20]]]},
    srv:{title:"Storm Relative Velocity",unit:"kt",legend:"VELOCIDADE RELATIVA À TEMPESTADE (SIMULADA)",min:-60,max:60,ticks:[-60,-40,-20,0,20,40,60],colors:[[-60,[0,30,150]],[-40,[35,105,230]],[-20,[120,190,255]],[-1,[225,235,240]],[1,[245,225,220]],[20,[255,140,95]],[40,[225,45,35]],[60,[125,0,15]]]},
    spectrum:{title:"Spectrum Width",unit:"kt",legend:"LARGURA ESPECTRAL (SIMULADA)",min:0,max:30,ticks:[0,5,10,15,20,25,30],colors:[[0,[8,15,24]],[3,[30,65,110]],[6,[30,145,160]],[10,[65,190,95]],[15,[220,220,65]],[20,[245,140,45]],[25,[220,55,55]],[30,[245,220,245]]]},
    vil:{title:"Vertically Integrated Liquid",unit:"kg/m²",legend:"VIL (DERIVADO, SIMULADO)",min:0,max:70,ticks:[0,10,20,30,40,50,60,70],colors:[[0,[8,15,24]],[5,[20,65,150]],[10,[30,160,200]],[20,[40,190,80]],[30,[220,220,50]],[40,[255,145,35]],[50,[225,35,35]],[60,[190,40,170]],[70,[255,255,255]]]},
    tops:{title:"Echo Tops",unit:"kft",legend:"TOPO DOS ECOS (ESTIMADO)",min:0,max:60,ticks:[0,10,20,30,40,50,60],colors:[[0,[8,15,24]],[5,[25,75,160]],[10,[35,160,200]],[20,[45,185,90]],[30,[230,220,50]],[40,[255,140,35]],[50,[220,45,45]],[60,[250,230,250]]]},
    stormtotal:{title:"Storm Total",unit:"in",legend:"ACUMULAÇÃO TOTAL (SIMULADA)",min:0,max:5,ticks:[0,1,2,3,4,5],colors:[[0,[8,15,24]],[0.25,[30,90,170]],[0.5,[40,170,190]],[1,[50,180,80]],[2,[225,220,50]],[3,[255,140,35]],[4,[220,45,45]],[5,[250,220,250]]]},
    accumulation:{title:"Accumulation",unit:"in",legend:"ACUMULAÇÃO EM JANELA (SIMULADA)",min:0,max:2,ticks:[0,0.25,0.5,1,1.5,2],colors:[[0,[8,15,24]],[0.1,[30,90,170]],[0.25,[40,170,190]],[0.5,[50,180,80]],[1,[225,220,50]],[1.5,[255,140,35]],[2,[220,45,45]]]}
  };

  function colorFor(dbz) {
    const activePalette = productInfo[product].colors;
    const value = clamp(dbz, productInfo[product].min, productInfo[product].max);

    for (let i = 1; i < activePalette.length; i++) {
      const [upper, upperColor] = activePalette[i];
      const [lower, lowerColor] = activePalette[i - 1];

      if (value <= upper) {
        const t = (value - lower) / (upper - lower);

        return [
          Math.round(lowerColor[0] +
            t * (upperColor[0] - lowerColor[0])),
          Math.round(lowerColor[1] +
            t * (upperColor[1] - lowerColor[1])),
          Math.round(lowerColor[2] +
            t * (upperColor[2] - lowerColor[2]))
        ];
      }
    }

    return activePalette[activePalette.length - 1][1];
  }

  function buildLegend() {
    legend.replaceChildren();
    legendTicks.replaceChildren();

    const info = productInfo[product];
    for (let i = 0; i < 16; i++) {
      const start = info.min + i * (info.max - info.min) / 16;
      const end = info.min + (i + 1) * (info.max - info.min) / 16;
      const midpoint = (start + end) / 2;
      const color = colorFor(midpoint);

      const swatch = document.createElement("span");
      swatch.style.backgroundColor =
        `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

      legend.appendChild(swatch);
    }

    info.ticks.forEach((value) => {
      const tick = document.createElement("span");
      tick.textContent = value;
      legendTicks.appendChild(tick);
    });
    legendName.textContent = info.legend;
    productTitle.innerHTML = `${info.title} <span class="unit">${info.unit}</span>`;
    infoProductTitle.textContent = info.title;
  }

  // Tempestade inteiramente sintética:
  // núcleo convectivo, ecos ao redor e estrutura curva tipo gancho.
  function generateField() {
    field.fill(0);

    const t = simTime;

    // Movimento contínuo da tempestade.
    const driftX = 0.045 * Math.sin(t * 0.10);
    const driftY = 0.035 * Math.sin(t * 0.07 + 1.2);

    const cx = 0.57 + driftX;
    const cy = 0.48 + driftY;

    // Núcleo principal e núcleos secundários.
    const cells = [
      {
        x: cx,
        y: cy,
        sx: 0.073,
        sy: 0.061,
        amp: 55,
        angle: -0.48
      },
      {
        x: cx - 0.085,
        y: cy + 0.070,
        sx: 0.100,
        sy: 0.058,
        amp: 28,
        angle: 0.65
      },
      {
        x: cx + 0.105,
        y: cy - 0.105,
        sx: 0.052,
        sy: 0.042,
        amp: 21,
        angle: -0.4
      },
      {
        x: cx - 0.19,
        y: cy - 0.055,
        sx: 0.055,
        sy: 0.036,
        amp: 13,
        angle: -0.6
      }
    ];

    const wobble = 1 + 0.055 * Math.sin(t * 0.65);
    const coreStrength = intensity * wobble;

    for (let py = 0; py < GRID; py++) {
      const y = py / (GRID - 1);

      for (let px = 0; px < GRID; px++) {
        const x = px / (GRID - 1);

        let dbz = 0;

        for (const cell of cells) {
          const pulse =
            cell.amp === 55
              ? coreStrength
              : intensity * (0.96 + 0.04 * Math.sin(t * 0.3));

          dbz += cell.amp * pulse * gaussian(
            x, y,
            cell.x, cell.y,
            cell.sx, cell.sy,
            cell.angle
          );
        }

        // Eco curvo estilizado: componente visual sintética.
        // Não representa uma reconstrução física de um hook echo.
        const hx = x - (cx + 0.03);
        const hy = y - (cy + 0.025);

        const radius = Math.sqrt(hx * hx + hy * hy);
        const angle = Math.atan2(hy, hx);

        const hookAngle = -1.1 + 0.20 * Math.sin(t * 0.18);
        let angleDiff = Math.atan2(
          Math.sin(angle - hookAngle),
          Math.cos(angle - hookAngle)
        );

        // Curva em forma de arco em torno do núcleo.
        const arcRadius = 0.105;
        const arcDistance = Math.abs(radius - arcRadius);
        const arcWidth = 0.022;

        const angleMask =
          smoothstep(-1.1, -0.4, angleDiff) *
          (1 - smoothstep(0.55, 1.2, angleDiff));

        const hook =
          20 *
          Math.exp(-0.5 * (arcDistance / arcWidth) ** 2) *
          angleMask *
          intensity;

        dbz += hook;

        // Ecos de fundo discretos, sem ruído aleatório por quadro.
        const texture =
          1.3 * Math.sin(x * 83 + y * 31) *
          Math.sin(y * 61 - x * 22);

        dbz += texture * smoothstep(8, 25, dbz);

        const index = py * GRID + px;
        field[index] = clamp(dbz, 0, MAX_DBZ);
      }
    }
  }

  function drawRadarBackground() {
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.455;

    // Grade cartográfica esquemática sobre fundo escuro.
    ctx.save();
    ctx.strokeStyle = "rgba(126, 156, 184, 0.17)";
    ctx.lineWidth = Math.max(0.7, dpr * 0.65);

    for (let i = -4; i <= 4; i++) {
      const x = cx + (i / 4) * radius;
      const y = cy + (i / 4) * radius;

      ctx.beginPath();
      ctx.moveTo(x, cy - radius);
      ctx.lineTo(x, cy + radius);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - radius, y);
      ctx.lineTo(cx + radius, y);
      ctx.stroke();
    }

    // Limites cartográficos esquemáticos, não fronteiras geográficas exatas.
    ctx.strokeStyle = "rgba(210, 210, 210, 0.28)";
    ctx.lineWidth = Math.max(0.8, dpr * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, cy - radius * 0.25);
    ctx.lineTo(width * 0.34, cy - radius * 0.25);
    ctx.lineTo(width * 0.34, cy + radius * 0.55);
    ctx.lineTo(width * 0.62, cy + radius * 0.55);
    ctx.lineTo(width * 0.62, height);
    ctx.moveTo(width * 0.72, 0);
    ctx.lineTo(width * 0.72, cy - radius * 0.1);
    ctx.lineTo(width, cy - radius * 0.1);
    ctx.moveTo(width * 0.12, cy - radius);
    ctx.lineTo(width * 0.12, height);
    ctx.stroke();

    // Anéis de alcance esquemáticos.
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * i / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(70, 155, 220, 0.55)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.24);
    ctx.bezierCurveTo(width * 0.28, height * 0.35, width * 0.18, height * 0.56, width * 0.42, height * 0.71);
    ctx.bezierCurveTo(width * 0.55, height * 0.79, width * 0.72, height * 0.68, width * 0.91, height * 0.86);
    ctx.stroke();
    ctx.fillStyle = "rgba(220, 232, 242, 0.8)";
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`;
    [["SPRINGFIELD",0.18,0.29],["RIVER CITY",0.72,0.23],["OAK RIDGE",0.77,0.76]].forEach(([name,x,y]) => { ctx.fillText(name, width*x, height*y); });

    // Marcador central do radar.
    ctx.strokeStyle = "rgba(207, 224, 240, 0.7)";
    ctx.beginPath();
    ctx.moveTo(cx - 7 * dpr, cy);
    ctx.lineTo(cx + 7 * dpr, cy);
    ctx.moveTo(cx, cy - 7 * dpr);
    ctx.lineTo(cx, cy + 7 * dpr);
    ctx.stroke();

    ctx.restore();
  }

  function drawField() {
    for (let i = 0; i < PIXELS; i++) {
      const x = (i % GRID) / (GRID - 1);
      const y = Math.floor(i / GRID) / (GRID - 1);
      const dbz = field[i];
      let value = dbz;
      if (product === "velocity") value = (x - 0.57) * 95 + (y - 0.48) * 28 + 18 * Math.sin(simTime * 0.4);
      else if (product === "srv") value = (x - 0.57) * 115 + (y - 0.48) * 20;
      else if (product === "spectrum") value = clamp((dbz - 8) * 0.42 + 2.5 * Math.abs(Math.sin(x * 35 + y * 19)), 0, 30);
      else if (product === "vil") value = Math.max(0, (dbz - 12) * 1.08);
      else if (product === "tops") value = Math.max(0, (dbz - 5) * 0.82);
      else if (product === "stormtotal") value = Math.max(0, (dbz - 18) / 12 * Math.min(1, simTime / 45));
      else if (product === "accumulation") value = Math.max(0, (dbz - 25) / 25 * Math.min(1, simTime / 25));
      const color = colorFor(value);
      const p = i * 4;

      image.data[p] = color[0];
      image.data[p + 1] = color[1];
      image.data[p + 2] = color[2];
      image.data[p + 3] = 255;
    }

    // Renderiza primeiro em baixa resolução.
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = GRID;
    tempCanvas.height = GRID;

    const tempCtx = tempCanvas.getContext("2d", {
      alpha: false
    });

    tempCtx.putImageData(image, 0, 0);

    // Renderização retangular tipo produto radar Super-Res:
    // grade de maior resolução, sem limitar os ecos a um círculo decorativo.
    // O campo continua sendo sintético, não um mosaico de dados NEXRAD reais.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, width, height);
    ctx.restore();
  }

  function drawMapLabels() {
    ctx.save();
    ctx.fillStyle = "rgba(230, 239, 247, 0.88)";
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`;
    [["SPRINGFIELD",0.18,0.29],["RIVER CITY",0.72,0.23],["OAK RIDGE",0.77,0.76]].forEach(([name,x,y]) => { ctx.fillText(name, width*x, height*y); });
    ctx.restore();
  }

  function drawStormMotion() {
    if (!motionToggle.checked) return;
    const cx = width * (0.57 + 0.045 * Math.sin(simTime * 0.10));
    const cy = height * (0.48 + 0.035 * Math.sin(simTime * 0.07 + 1.2));
    stormTrack.push({x:cx,y:cy});
    if (stormTrack.length > 18) stormTrack.shift();
    ctx.save(); ctx.strokeStyle = "#ffffffcc"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5,dpr);
    if (stormTrack.length > 1) { ctx.beginPath(); stormTrack.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.stroke(); }
    const dx = width * 0.025, dy = height * 0.012;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+dx,cy+dy); ctx.lineTo(cx+dx-width*0.006,cy+dy-height*0.012); ctx.moveTo(cx+dx,cy+dy); ctx.lineTo(cx+dx-width*0.014,cy+dy-height*0.001); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,3*dpr,0,Math.PI*2); ctx.fill(); ctx.restore();
  }

  function updateStatistics() {
    let maximum = 0;
    let echoPixels = 0;

    for (let i = 0; i < PIXELS; i++) {
      const value = field[i];

      if (value > maximum) maximum = value;
      if (value >= 35) echoPixels++;
    }

    maxDbz.textContent = `${maximum.toFixed(1)} dBZ`;
    stormReadout.textContent =
      `Núcleo: ${maximum.toFixed(1)} dBZ`;

    // Fração da área total da grade acima do limiar.
    echoArea.textContent =
      `${(echoPixels / PIXELS * 100).toFixed(1)}%`;

    frameCount.textContent = frames.toLocaleString("pt-BR");

    const totalSeconds = Math.floor(simTime);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    frameLabel.textContent =
      `TEMPO SIMULADO: ${String(minutes).padStart(2, "0")}:` +
      String(seconds).padStart(2, "0");
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = Math.round(rect.width * dpr);
    height = Math.round(rect.height * dpr);

    canvas.width = width;
    canvas.height = height;

    render();
  }

  function render() {
    if (!width || !height) return;

    generateField();
    drawRadarBackground();
    drawField();

    drawStormMotion();

    // Sobreposição de alcance após o campo de ecos.
    ctx.save();
    ctx.strokeStyle = "rgba(173, 201, 224, 0.30)";
    ctx.lineWidth = Math.max(0.7, dpr * 0.65);

    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.455 * i / 4,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    ctx.restore();

    updateStatistics();
  }

  function updateControls() {
    intensity = Number(intensityInput.value);
    speed = Number(speedInput.value);

    intensityValue.textContent = `${intensity.toFixed(2)}×`;
    speedValue.textContent = `${speed.toFixed(1)}×`;

    runState.textContent = running ? "Executando" : "Pausado";
    playButton.textContent = running ? "Ⅱ Pausar" : "▶ Continuar";
  }

  playButton.addEventListener("click", () => {
    running = !running;
    updateControls();
  });

  resetButton.addEventListener("click", () => {
    simTime = 0;
    frames = 0;
    lastTimestamp = 0;

    updateControls();
    render();
  });

  intensityInput.addEventListener("input", () => {
    updateControls();
    render();
  });

  speedInput.addEventListener("input", updateControls);
  productSelect.addEventListener("change", () => { product = productSelect.value; buildLegend(); render(); });
  motionToggle.addEventListener("change", render);

  function animate(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;

    // Evita saltos enormes após a janela perder o foco.
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    if (running) {
      simTime += dt * speed;
      frames++;
    }

    // Atualização contínua para permitir a evolução dos ecos.
    render();

    requestAnimationFrame(animate);
  }

  buildLegend();
  updateControls();

  // Prepara o tamanho inicial antes da animação.
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.round(rect.width * dpr);
  height = Math.round(rect.height * dpr);
  canvas.width = width;
  canvas.height = height;

  render();
  requestAnimationFrame(animate);

  window.addEventListener("resize", resizeCanvas);
})();
