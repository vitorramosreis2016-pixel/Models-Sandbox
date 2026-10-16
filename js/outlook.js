
/* =========================================================
   MODELS-SANDBOX — CONVECTIVE OUTLOOK
   Mapa geográfico, desenho manual e cenários sintéticos
   Requer Leaflet 1.9.4
   ========================================================= */

(() => {
    "use strict";

    const RISCOS = {
        TSTM: { nome: "General Thunderstorms", cor: "#b8d9a8" },
        MRGL: { nome: "Marginal", cor: "#66a366" },
        SLGT: { nome: "Slight", cor: "#f5e45b" },
        ENH:  { nome: "Enhanced", cor: "#e99a45" },
        MDT:  { nome: "Moderate", cor: "#df4545" },
        HIGH: { nome: "High", cor: "#ed55d5" }
    };

    let mapa = null;
    let camadaRiscos = null;
    let marcadoresDesenho = null;
    let pontosDesenho = [];
    let linhaDesenho = null;
    let modoDesenho = false;
    let controleCriado = false;

    const $ = id => document.getElementById(id);

    function criarInterface() {
        const container = $("convective-map");
        if (!container || controleCriado) return;

        const barra = document.createElement("div");
        barra.id = "outlook-toolbar";
        barra.innerHTML = `
            <button type="button" id="outlook-draw">✏️ Desenhar área</button>
            <button type="button" id="outlook-finish" disabled>✓ Finalizar polígono</button>
            <button type="button" id="outlook-cancel" disabled>Cancelar</button>
            <button type="button" id="outlook-auto">🤖 Gerar cenário</button>
            <button type="button" id="outlook-clear">🗑️ Limpar áreas</button>
            <button type="button" id="outlook-usa">🇺🇸 Estados Unidos</button>
            <button type="button" id="outlook-world">🌎 Mundo</button>
            <div id="outlook-search-wrap">
                <input id="outlook-search" type="search" placeholder="Buscar cidade ou estado (ex.: Norman, Oklahoma)" aria-label="Buscar cidade ou região">
                <button type="button" id="outlook-search-btn">🔎 Buscar</button>
            </div>
            <span id="outlook-coordinates" aria-live="polite">Lat: -- · Lon: --</span>
        `;

        container.parentNode.insertBefore(barra, container);

        const legenda = document.createElement("div");
        legenda.id = "outlook-legend";
        legenda.innerHTML = `
            <strong>NWS / SPC — Convective Outlook (modo de simulação)</strong>
            <div class="outlook-legend-items">
                ${Object.entries(RISCOS).map(([id, risco]) => `
                    <span>
                        <i style="background:${risco.cor}"></i>
                        ${id}
                    </span>
                `).join("")}
            </div>
            <p id="outlook-status" role="status">
                Selecione um nível de risco e desenhe uma área.
            </p>
        `;
        barra.insertAdjacentElement("afterend", legenda);

        const estilo = document.createElement("style");
        estilo.id = "outlook-styles";
        estilo.textContent = `
            #outlook-toolbar {
                display:flex; flex-wrap:wrap; gap:8px;
                margin:0 0 12px; align-items:center;
            }
            #outlook-toolbar button {
                padding:9px 12px; border:1px solid #3b3b54;
                border-radius:6px; background:#202033;
                color:#e2e8f0; cursor:pointer;
            }
            #outlook-toolbar button:hover:not(:disabled) {
                background:#30304a;
            }
            #outlook-toolbar button:disabled {
                opacity:.45; cursor:not-allowed;
            }
            #outlook-search-wrap {
                display:flex; flex:1 1 300px; gap:6px; min-width:240px;
            }
            #outlook-search {
                flex:1; min-width:120px; padding:9px 10px;
                border:1px solid #3b3b54; border-radius:6px;
                background:#11111b; color:#e2e8f0;
            }
            #outlook-coordinates {
                flex:1 1 180px; color:#94a3b8;
                font:12px ui-monospace,monospace;
            }
            #outlook-legend {
                background:#161622; color:#cbd5e1;
                border:1px solid #2d2d3d; border-radius:6px;
                padding:10px 12px; margin-bottom:12px;
                font:13px system-ui,sans-serif;
            }
            .outlook-legend-items {
                display:flex; flex-wrap:wrap; gap:12px;
                margin-top:8px;
            }
            .outlook-legend-items span {
                display:flex; align-items:center; gap:5px;
            }
            .outlook-legend-items i {
                display:inline-block; width:12px; height:12px;
                border:1px solid #ffffff66; border-radius:2px;
            }
            #outlook-status { margin:8px 0 0; color:#94a3b8; }
            #convective-map { min-height:400px; }
            #convective-map.outlook-drawing { cursor:crosshair; }
            @media(max-width:700px) {
                #outlook-toolbar button { flex:1 1 140px; }
                #convective-map { min-height:400px; }
            }
        `;
        document.head.appendChild(estilo);

        $("outlook-draw").addEventListener("click", iniciarDesenho);
        $("outlook-finish").addEventListener("click", finalizarDesenho);
        $("outlook-cancel").addEventListener("click", cancelarDesenho);
        $("outlook-clear").addEventListener("click", limparAreas);
        $("outlook-auto").addEventListener("click", gerarCenario);
        $("outlook-world").addEventListener("click", () => {
            if (!mapa) return;
            cancelarDesenho();
            mapa.setView([15, 0], 2);
            mapa.invalidateSize();
            status("Mapa-múndi. Escolha uma região para começar o Outlook.");
        });

        $("outlook-usa").addEventListener("click", () => {
            if (!mapa) return;
            cancelarDesenho();
            mapa.setView([39.5, -98.35], 4);
            mapa.invalidateSize();
            status("NWS / SPC — área de trabalho centralizada nos Estados Unidos.");
        });

        $("outlook-search-btn").addEventListener("click", buscarLocal);
        $("outlook-search").addEventListener("keydown", evento => {
            if (evento.key === "Enter") {
                evento.preventDefault();
                buscarLocal();
            }
        });

        controleCriado = true;
    }

    function status(mensagem) {
        const elemento = $("outlook-status");
        if (elemento) elemento.textContent = mensagem;
    }

    function iniciarMapa() {
        const container = $("convective-map");
        if (!container) return;

        if (typeof L === "undefined") {
            status("Erro: Leaflet não foi carregado. Confira os scripts no index.html.");
            console.error("[Outlook] Leaflet indisponível.");
            return;
        }

        if (mapa) {
            mapa.invalidateSize();
            return;
        }

        mapa = L.map(container, {
            center: [39.5, -98.35],
            zoom: 4,
            minZoom: 2,
            maxZoom: 18,
            worldCopyJump: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(mapa);

        camadaRiscos = L.featureGroup().addTo(mapa);
        marcadoresDesenho = L.layerGroup().addTo(mapa);

        mapa.on("click", evento => {
            if (!modoDesenho) return;

            pontosDesenho.push(evento.latlng);

            L.circleMarker(evento.latlng, {
                radius: 4,
                color: "#ffffff",
                weight: 2,
                fillColor: "#38bdf8",
                fillOpacity: 1
            }).addTo(marcadoresDesenho);

            atualizarLinhaDesenho();
            $("outlook-finish").disabled = pontosDesenho.length < 3;

            status(`Pontos selecionados: ${pontosDesenho.length}. Marque pelo menos 3.`);
        });

        mapa.on("dblclick", () => {
            if (modoDesenho && pontosDesenho.length >= 3) {
                finalizarDesenho();
            }
        });

        mapa.on("mousemove", evento => {
            const el = $("outlook-coordinates");
            if (!el) return;
            el.textContent = `Lat: ${evento.latlng.lat.toFixed(3)} · Lon: ${evento.latlng.lng.toFixed(3)}`;
        });

        mapa.on("click", evento => {
            const el = $("outlook-coordinates");
            if (el) {
                el.textContent = `Lat: ${evento.latlng.lat.toFixed(3)} · Lon: ${evento.latlng.lng.toFixed(3)}`;
            }
        });

        status("NWS / SPC — mapa carregado. Busque uma cidade ou desenhe uma área de risco.");
    }

    async function buscarLocal() {
        const campo = $("outlook-search");
        const consulta = campo ? campo.value.trim() : "";
        if (!consulta) {
            status("Digite uma cidade, estado ou região para buscar.");
            return;
        }

        const botao = $("outlook-search-btn");
        if (botao) botao.disabled = true;
        status(`Buscando “${consulta}”...`);

        try {
            const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="
                + encodeURIComponent(consulta);
            const resposta = await fetch(url, {
                headers: { "Accept": "application/json" }
            });

            if (!resposta.ok) throw new Error("Serviço de busca indisponível");
            const resultados = await resposta.json();

            if (!resultados.length) {
                status("Local não encontrado. Tente incluir estado ou país.");
                return;
            }

            const local = resultados[0];
            const lat = Number(local.lat);
            const lon = Number(local.lon);
            cancelarDesenho();
            mapa.setView([lat, lon], 9);
            mapa.invalidateSize();

            if (window.outlookSearchMarker) {
                mapa.removeLayer(window.outlookSearchMarker);
            }

            window.outlookSearchMarker = L.marker([lat, lon])
                .addTo(mapa)
                .bindPopup(local.display_name)
                .openPopup();

            const coords = $("outlook-coordinates");
            if (coords) coords.textContent = `Lat: ${lat.toFixed(3)} · Lon: ${lon.toFixed(3)}`;
            status(`Mapa centralizado em: ${local.display_name}`);
        } catch (erro) {
            console.error("[Outlook] Erro ao buscar local:", erro);
            status("Não foi possível buscar o local. Verifique a conexão com a internet e tente novamente.");
        } finally {
            if (botao) botao.disabled = false;
        }
    }

    function obterRisco() {
        const seletor = $("risk-level-select");
        const valor = seletor ? seletor.value : "SLGT";
        return RISCOS[valor] ? valor : "SLGT";
    }

    function adicionarPoligono(pontos, nivel, descricao = "Área manual") {
        const risco = RISCOS[nivel];
        if (!risco || pontos.length < 3) return;

        const poligono = L.polygon(pontos, {
            color: risco.cor,
            weight: 2,
            opacity: 1,
            fillColor: risco.cor,
            fillOpacity: 0.32
        }).addTo(camadaRiscos);

        poligono.bindPopup(`
            <strong>${risco.nome}</strong><br>
            Categoria: ${nivel}<br>
            ${descricao}
        `);

        poligono.on("click", () => {
            const seletor = $("risk-level-select");
            if (seletor) seletor.value = nivel;
        });
    }

    function atualizarLinhaDesenho() {
        if (linhaDesenho) {
            mapa.removeLayer(linhaDesenho);
            linhaDesenho = null;
        }

        if (pontosDesenho.length >= 2) {
            linhaDesenho = L.polyline(pontosDesenho, {
                color: "#38bdf8",
                weight: 2,
                dashArray: "6 5"
            }).addTo(mapa);
        }
    }

    function iniciarDesenho() {
        if (!mapa) return;

        cancelarDesenho();
        modoDesenho = true;
        mapa.doubleClickZoom.disable();
        $("convective-map").classList.add("outlook-drawing");
        $("outlook-draw").disabled = true;
        $("outlook-finish").disabled = true;
        $("outlook-cancel").disabled = false;

        status("Clique no mapa para marcar os vértices do polígono.");
    }

    function finalizarDesenho() {
        if (!modoDesenho || pontosDesenho.length < 3) {
            status("Você precisa marcar pelo menos 3 pontos.");
            return;
        }

        adicionarPoligono([...pontosDesenho], obterRisco());

        cancelarDesenho();
        status("Área adicionada ao Outlook.");
    }

    function cancelarDesenho() {
        modoDesenho = false;

        if (mapa) mapa.doubleClickZoom.enable();
        if ($("convective-map")) {
            $("convective-map").classList.remove("outlook-drawing");
        }

        if (marcadoresDesenho) marcadoresDesenho.clearLayers();

        if (linhaDesenho && mapa) {
            mapa.removeLayer(linhaDesenho);
        }

        linhaDesenho = null;
        pontosDesenho = [];

        if ($("outlook-draw")) $("outlook-draw").disabled = false;
        if ($("outlook-finish")) $("outlook-finish").disabled = true;
        if ($("outlook-cancel")) $("outlook-cancel").disabled = true;
    }

    function limparAreas() {
        cancelarDesenho();
        if (camadaRiscos) camadaRiscos.clearLayers();
        status("Todas as áreas de risco foram removidas.");
    }

    // Cenário demonstrativo, não é uma previsão meteorológica real.
    function gerarCenario() {
        if (!mapa) return;

        cancelarDesenho();
        camadaRiscos.clearLayers();

        const centro = mapa.getCenter();
        const lat = centro.lat;
        const lon = centro.lng;

        const deslocar = (dLat, dLon) => [lat + dLat, lon + dLon];

        adicionarPoligono([
            deslocar(-5, -8), deslocar(-4, 5),
            deslocar(3, 8), deslocar(6, -2),
            deslocar(2, -9)
        ], "TSTM", "Cenário sintético");

        adicionarPoligono([
            deslocar(-3, -5), deslocar(-2, 3),
            deslocar(3, 5), deslocar(4, -2),
            deslocar(1, -6)
        ], "MRGL", "Cenário sintético");

        adicionarPoligono([
            deslocar(-1.5, -3), deslocar(-1, 2),
            deslocar(2, 3), deslocar(2.5, -2)
        ], obterRisco(), "Núcleo de risco sintético");

        status("Cenário sintético criado. Não representa uma previsão oficial do NWS / SPC.");
    }

    function iniciar() {
        criarInterface();

        const botaoAba = document.querySelector(
            '[onclick*="convective-tab"]'
        );

        if (botaoAba) {
            botaoAba.addEventListener("click", () => {
                setTimeout(iniciarMapa, 150);
            });
        }

        // Também suporta abrir a aba por outros meios.
        const aba = $("convective-tab");
        if (aba && aba.classList.contains("active")) {
            setTimeout(iniciarMapa, 100);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
