
/*
 * MODELS-SANDBOX — ATMOSPHERIC SOUNDING ENGINE
 * Versão 1.0
 *
 * Sondagem atmosférica sintética:
 * - Skew-T log-P
 * - Temperatura e ponto de orvalho
 * - Trajetória de parcela
 * - Estimativas de LCL, CAPE e CIN
 * - Perfil vertical de vento
 *
 * Os dados são sintéticos, não observações meteorológicas.
 * Requer Plotly.js já carregado no HTML.
 */

"use strict";

const ModelsSounding = (() => {
    const PRESSURE_TOP = 100;
    const PRESSURE_BOTTOM = 1000;
    const PRESSURE_STEP = 10;

    const RD = 287.05;
    const CP = 1004;
    const G = 9.80665;
    const EPSILON = 0.622;
    const KAPPA = RD / CP;
    const LV = 2.5e6;

    const SKEW = 32;
    const MIN_TEMP = -100;
    const MAX_TEMP = 50;

    let plotInitialized = false;
    let lastSounding = null;
    let updateScheduled = false;

    const $ = id => document.getElementById(id);

    function readNumber(id, fallback) {
        const element = $(id);
        if (!element) return fallback;

        const value = Number(element.value);
        return Number.isFinite(value) ? value : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits = 1) {
        if (!Number.isFinite(value)) return "—";
        return value.toFixed(digits);
    }

    // --------------------------------------------------
    // 1. ATMOSFERA PADRÃO E CONVERSÕES
    // --------------------------------------------------

    function pressureToHeight(pressure) {
        // Aproximação de altura geopotencial pela atmosfera padrão.
        return 44330 * (
            1 - Math.pow(pressure / 1013.25, 0.190284)
        );
    }

    function saturationVaporPressure(tempC) {
        // Fórmula de Magnus sobre água líquida.
        return 6.112 * Math.exp(
            (17.67 * tempC) / (tempC + 243.5)
        );
    }

    function vaporPressureToDewpoint(vaporPressure) {
        const e = Math.max(0.001, vaporPressure);
        const logarithm = Math.log(e / 6.112);

        return 243.5 * logarithm / (17.67 - logarithm);
    }

    function mixingRatioFromDewpoint(dewpoint, pressure) {
        const e = saturationVaporPressure(dewpoint);
        return EPSILON * e / Math.max(0.1, pressure - e);
    }

    function saturationMixingRatio(tempC, pressure) {
        const e = saturationVaporPressure(tempC);

        return EPSILON * e /
            Math.max(0.1, pressure - e);
    }

    function virtualTemperature(tempC, mixingRatio) {
        const tempK = tempC + 273.15;

        return tempK *
            (1 + mixingRatio / EPSILON) /
            (1 + mixingRatio);
    }

    // --------------------------------------------------
    // 2. NÍVEL DE CONDENSAÇÃO POR LEVANTAMENTO (LCL)
    // --------------------------------------------------

    function calculateLCL(tempC, dewpointC, surfacePressure) {
        const T = tempC + 273.15;
        const Td = dewpointC + 273.15;

        const tlcl = 1 / (
            1 / (Td - 56) +
            Math.log(T / Td) / 800
        ) + 56;

        const plcl = surfacePressure *
            Math.pow(tlcl / T, 1 / KAPPA);

        return {
            temperature: tlcl - 273.15,
            pressure: plcl,
            height: pressureToHeight(plcl)
        };
    }

    // --------------------------------------------------
    // 3. GERADOR DE SONDAGEM SINTÉTICA
    // --------------------------------------------------

    function generateSounding(params) {
        const { temp, dewpoint, lapse, wind, srw } = params;
        const surfacePressure = 1000;
        const levels = [];
        // "srw" is retained as the legacy control, but used here as
        // a bounded 0–6 km bulk-shear magnitude in knots, not SRH.
        const shear06kmKt = clamp(srw, 0, 150);
        const surfaceDewpoint = Math.min(dewpoint, temp);
        const surfaceMixingRatio = mixingRatioFromDewpoint(
            surfaceDewpoint, surfacePressure
        );

        const lcl = calculateLCL(temp, surfaceDewpoint, surfacePressure);

        // A synthetic environmental profile with a user-controlled
        // low-level lapse rate, a modest mid-level cap, and renewed
        // cooling aloft. It is a scenario profile, not observed data.
        function environmentalTemperature(heightKm) {
            const z1 = Math.min(heightKm, 1.5);
            const z2 = Math.max(0, Math.min(heightKm - 1.5, 2.0));
            const z3 = Math.max(0, heightKm - 3.5);
            return temp - lapse * z1 - 4.0 * z2 - 6.5 * z3;
        }

        // Reduce mixing ratio with height to create a physically clearer
        // dry layer aloft. The dewpoint is diagnosed from vapor pressure,
        // then constrained to remain no warmer than the environment.
        function environmentalDewpoint(pressure, heightKm, environmentalTemp) {
            const vaporPressureAtSurface = saturationVaporPressure(surfaceDewpoint);
            const surfaceMixingRatioAtPressure =
                EPSILON * vaporPressureAtSurface /
                Math.max(0.1, surfacePressure - vaporPressureAtSurface);

            const mixingRatio = surfaceMixingRatioAtPressure *
                Math.exp(-heightKm / 2.4) *
                (heightKm > 3 ? Math.exp(-(heightKm - 3) / 3.0) : 1);

            const vaporPressure = mixingRatio * pressure /
                Math.max(0.1, EPSILON + mixingRatio);
            const dewpointAtLevel = vaporPressureToDewpoint(vaporPressure);
            return Math.min(environmentalTemp, dewpointAtLevel);
        }

        // Wind turns clockwise with height and increases smoothly.
        // The input controls the total 0–6 km vector shear, rather than
        // being added linearly to speed at every level.
        function windAtHeight(heightKm) {
            const fraction = clamp(heightKm / 6, 0, 1.5);
            const speedKt = Math.max(0, wind + shear06kmKt * fraction);
            const directionDeg = (165 + 55 * Math.min(fraction, 1)) % 360;
            const directionRad = directionDeg * Math.PI / 180;
            const u = -speedKt * Math.sin(directionRad);
            const v = -speedKt * Math.cos(directionRad);
            return { windSpeed: speedKt, windDirection: directionDeg, u, v };
        }

        for (let pressure = PRESSURE_BOTTOM; pressure >= PRESSURE_TOP; pressure -= PRESSURE_STEP) {
            const height = pressureToHeight(pressure);
            const heightKm = height / 1000;
            const environmentalTemp = environmentalTemperature(heightKm);
            const envDewpoint = environmentalDewpoint(
                pressure, heightKm, environmentalTemp
            );
            levels.push({
                pressure,
                height,
                temp: environmentalTemp,
                dewpoint: envDewpoint,
                ...windAtHeight(heightKm)
            });
        }

        return {
            levels,
            lcl,
            surface: {
                temp,
                dewpoint: surfaceDewpoint,
                pressure: surfacePressure,
                mixingRatio: surfaceMixingRatio
            },
            parameters: {
                lapse,
                surfaceWind: wind,
                shear06kmKt
            }
        };
    }

    // --------------------------------------------------
    // 4. TRAJETÓRIA DA PARCELA DE AR
    // --------------------------------------------------

    function moistAdiabaticLapseRate(tempC, pressure) {
        const tempK = tempC + 273.15;
        const mixingRatio = saturationMixingRatio(
            tempC,
            pressure
        );

        const numerator = G * (
            1 + LV * mixingRatio / (RD * tempK)
        );

        const denominator = CP +
            (LV * LV * mixingRatio * EPSILON) /
            (RD * tempK * tempK);

        return numerator / denominator * 1000;
    }

    function calculateParcelProfile(sounding) {
        const { levels, surface, lcl } = sounding;

        const parcel = [];
        let previousHeight = 0;
        let previousTemp = surface.temp;
        let previousPressure = surface.pressure;

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];

            let parcelTemp;

            if (level.pressure >= lcl.pressure) {
                // Ascensão seca: temperatura potencial constante.
                parcelTemp =
                    (surface.temp + 273.15) *
                    Math.pow(
                        level.pressure / surface.pressure,
                        KAPPA
                    ) - 273.15;
            } else {
                // Integração aproximada da ascensão úmida
                // entre os níveis do perfil.
                if (i === 0) {
                    parcelTemp = previousTemp;
                } else {
                    const deltaHeight =
                        Math.max(0, level.height - previousHeight);

                    const meanPressure =
                        (level.pressure + previousPressure) / 2;

                    const meanTemp =
                        (previousTemp + level.temp) / 2;

                    const gamma = moistAdiabaticLapseRate(
                        meanTemp,
                        meanPressure
                    );

                    parcelTemp =
                        previousTemp -
                        gamma * deltaHeight / 1000;
                }

                // Garante que a parcela tenha passado pelo LCL.
                if (previousPressure >= lcl.pressure) {
                    const tempAtLCL = lcl.temperature;
                    const heightAboveLCL =
                        Math.max(0, level.height - lcl.height);

                    const gamma = moistAdiabaticLapseRate(
                        tempAtLCL,
                        level.pressure
                    );

                    parcelTemp = tempAtLCL -
                        gamma * heightAboveLCL / 1000;
                }
            }

            parcel.push({
                pressure: level.pressure,
                height: level.height,
                temp: parcelTemp
            });

            previousHeight = level.height;
            previousTemp = parcelTemp;
            previousPressure = level.pressure;
        }

        return parcel;
    }

    // --------------------------------------------------
    // 5. CAPE E CIN
    // --------------------------------------------------

    function calculateBuoyancy(level, parcelLevel, surfaceMixingRatio) {
        const envMixingRatio = mixingRatioFromDewpoint(
            level.dewpoint,
            level.pressure
        );

        // Abaixo do LCL, a parcela conserva aproximadamente
        // a razão de mistura inicial. Acima, assume saturação.
        const parcelMixingRatio =
            parcelLevel.pressure >= 0 &&
            parcelLevel.temp > -100
                ? saturationMixingRatio(
                    parcelLevel.temp,
                    parcelLevel.pressure
                )
                : surfaceMixingRatio;

        const envTv = virtualTemperature(
            level.temp,
            envMixingRatio
        );

        const parcelTv = virtualTemperature(
            parcelLevel.temp,
            parcelMixingRatio
        );

        return G * (parcelTv - envTv) / envTv;
    }

    function calculateCAPEandCIN(sounding, parcel) {
        const levels = sounding.levels;
        const buoyancies = [];

        for (let i = 0; i < levels.length; i++) {
            buoyancies.push(
                calculateBuoyancy(
                    levels[i],
                    parcel[i],
                    sounding.surface.mixingRatio
                )
            );
        }

        let cape = 0;
        let cin = 0;
        let lfc = null;
        let equilibriumLevel = null;
        let positiveRegionStarted = false;

        for (let i = 1; i < levels.length; i++) {
            const z1 = levels[i - 1].height;
            const z2 = levels[i].height;
            const b1 = buoyancies[i - 1];
            const b2 = buoyancies[i];

            const dz = z2 - z1;
            if (dz <= 0) continue;

            const meanB = (b1 + b2) / 2;

            if (meanB > 0) {
                cape += meanB * dz;

                if (!positiveRegionStarted) {
                    lfc = levels[i].pressure;
                    positiveRegionStarted = true;
                }
            } else if (!positiveRegionStarted) {
                cin += meanB * dz;
            } else if (equilibriumLevel === null && b1 > 0) {
                equilibriumLevel = levels[i].pressure;
            }
        }

        return {
            cape: Math.max(0, cape),
            cin: Math.min(0, cin),
            lfc,
            equilibriumLevel,
            buoyancies
        };
    }

    function calculateThermodynamics(sounding) {
        const parcel = calculateParcelProfile(sounding);
        const energy = calculateCAPEandCIN(sounding, parcel);

        return {
            lcl: sounding.lcl,
            parcel,
            cape: energy.cape,
            cin: energy.cin,
            lfc: energy.lfc,
            equilibriumLevel: energy.equilibriumLevel,
            buoyancies: energy.buoyancies
        };
    }

    // --------------------------------------------------
    // 6. CINEMÁTICA DO VENTO
    // --------------------------------------------------

    function calculateKinematics(sounding) {
        const levels = sounding.levels;

        function nearestLevel(targetHeight) {
            return levels.reduce((best, level) =>
                Math.abs(level.height - targetHeight) <
                Math.abs(best.height - targetHeight)
                    ? level
                    : best
            );
        }

        const surface = nearestLevel(0);
        const level1km = nearestLevel(1000);
        const level3km = nearestLevel(3000);
        const level6km = nearestLevel(6000);

        function shearMagnitude(a, b) {
            return Math.hypot(
                b.u - a.u,
                b.v - a.v
            );
        }

        return {
            shear01km: shearMagnitude(surface, level1km),
            shear03km: shearMagnitude(surface, level3km),
            shear06km: shearMagnitude(surface, level6km),
            levels: [
                { label: "Superfície", level: surface },
                { label: "1 km", level: level1km },
                { label: "3 km", level: level3km },
                { label: "6 km", level: level6km }
            ]
        };
    }

    // --------------------------------------------------
    // 7. COORDENADAS DO SKEW-T
    // --------------------------------------------------

    function skewCoordinate(tempC, pressure) {
        return tempC +
            SKEW * Math.log10(1000 / pressure);
    }

    function makeProfileTrace(levels, property, name, color, width, dash) {
        return {
            type: "scatter",
            mode: "lines",
            name,
            x: levels.map(level =>
                skewCoordinate(level[property], level.pressure)
            ),
            y: levels.map(level => level.pressure),
            line: {
                color,
                width,
                dash: dash || "solid"
            },
            hovertemplate:
                "%{y:.0f} hPa<br>" +
                "%{customdata:.1f} °C<extra>" +
                name + "</extra>",
            customdata: levels.map(level => level[property])
        };
    }

    function makeIsotherm(tempC) {
        const pressures = [];

        for (
            let pressure = PRESSURE_BOTTOM;
            pressure >= PRESSURE_TOP;
            pressure -= 25
        ) {
            pressures.push(pressure);
        }

        return {
            type: "scatter",
            mode: "lines",
            showlegend: false,
            hoverinfo: "skip",
            x: pressures.map(p => skewCoordinate(tempC, p)),
            y: pressures,
            line: {
                color: tempC === 0 ? "#64748b" : "#273244",
                width: tempC === 0 ? 1.5 : 0.7,
                dash: tempC === 0 ? "solid" : "dot"
            }
        };
    }

    function makeIsobar(pressure) {
        const minX = skewCoordinate(MIN_TEMP, pressure);
        const maxX = skewCoordinate(MAX_TEMP, pressure);

        return {
            type: "scatter",
            mode: "lines",
            showlegend: false,
            hoverinfo: "skip",
            x: [minX, maxX],
            y: [pressure, pressure],
            line: {
                color: "#273244",
                width: 0.8
            }
        };
    }

    function buildSkewTTraces(sounding, thermo) {
        const traces = [];

        for (let t = -100; t <= 50; t += 10) {
            traces.push(makeIsotherm(t));
        }

        for (let p = 100; p <= 1000; p += 50) {
            traces.push(makeIsobar(p));
        }

        traces.push(
            makeProfileTrace(
                sounding.levels,
                "temp",
                "Temperatura ambiente",
                "#ff5555",
                3
            )
        );

        traces.push(
            makeProfileTrace(
                sounding.levels,
                "dewpoint",
                "Ponto de orvalho",
                "#4ade80",
                3
            )
        );

        traces.push(
            makeProfileTrace(
                thermo.parcel,
                "temp",
                "Parcela ascendente",
                "#f8fafc",
                2,
                "dash"
            )
        );

        // Marcador do LCL.
        traces.push({
            type: "scatter",
            mode: "markers",
            name: "LCL",
            x: [
                skewCoordinate(
                    thermo.lcl.temperature,
                    thermo.lcl.pressure
                )
            ],
            y: [thermo.lcl.pressure],
            marker: {
                color: "#facc15",
                size: 9,
                symbol: "circle-open",
                line: { width: 2 }
            },
            hovertemplate:
                "LCL<br>%{y:.0f} hPa<extra></extra>"
        });

        return traces;
    }

    // --------------------------------------------------
    // 8. LAYOUT E RENDERIZAÇÃO
    // --------------------------------------------------

    function buildLayout() {
        const tickTemps = [];
        for (let t = -100; t <= 50; t += 10) {
            tickTemps.push(t);
        }

        return {
            paper_bgcolor: "#121821",
            plot_bgcolor: "#121821",
            margin: { l: 58, r: 25, t: 22, b: 55 },
            autosize: true,
            showlegend: true,
            legend: {
                orientation: "h",
                y: -0.18,
                font: { color: "#cbd5e1", size: 10 }
            },
            xaxis: {
                title: {
                    text: "Temperatura (°C) — coordenada inclinada",
                    font: { color: "#94a3b8", size: 11 }
                },
                tickmode: "array",
                tickvals: tickTemps,
                ticktext: tickTemps.map(String),
                tickfont: { color: "#cbd5e1" },
                gridcolor: "#263244",
                zeroline: false,
                range: [-110, 100]
            },
            yaxis: {
                title: {
                    text: "Pressão (hPa)",
                    font: { color: "#94a3b8", size: 11 }
                },
                type: "log",
                autorange: "reversed",
                range: [2, 3],
                tickvals: [100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000],
                ticktext: [
                    "100", "150", "200", "250", "300", "400",
                    "500", "600", "700", "800", "900", "1000"
                ],
                tickfont: { color: "#cbd5e1" },
                gridcolor: "#263244"
            },
            font: {
                family: "Arial, sans-serif",
                color: "#cbd5e1"
            }
        };
    }

    function renderSkewT(traces) {
        const container = $("skewt-chart");
        if (!container) return;

        if (!window.Plotly) {
            container.innerHTML =
                "<p style='color:#f87171;padding:16px'>" +
                "Plotly.js não foi carregado. Verifique o HTML.</p>";
            return;
        }

        const layout = buildLayout();
        const config = {
            displayModeBar: false,
            responsive: true
        };

        if (!plotInitialized) {
            window.Plotly.newPlot(
                container,
                traces,
                layout,
                config
            );
            plotInitialized = true;
        } else {
            window.Plotly.react(
                container,
                traces,
                layout,
                config
            );
        }
    }

    function renderHodograph(sounding) {
        const el = $("hodograph-chart");
        if (!el || !window.Plotly) return;
        const levels = sounding.levels.filter(level => level.height >= 0 && level.height <= 12000);
        const bands = [
            { min: 0, max: 3000, color: "#ef4444", name: "0–3 km" },
            { min: 3000, max: 6000, color: "#22c55e", name: "3–6 km" },
            { min: 6000, max: 9000, color: "#facc15", name: "6–9 km" },
            { min: 9000, max: 12000, color: "#38bdf8", name: "9–12 km" }
        ];
        const traces = bands.map(band => {
            const segment = levels.filter(level => level.height >= band.min && level.height <= band.max);
            return {
                type: "scatter", mode: "lines+markers",
                name: band.name,
                x: segment.map(level => level.u),
                y: segment.map(level => level.v),
                customdata: segment.map(level => [level.height, level.windSpeed, level.windDirection]),
                hovertemplate: "%{customdata[0]:.0f} m<br>u=%{x:.1f} kt<br>v=%{y:.1f} kt<br>V=%{customdata[1]:.1f} kt<br>Direção=%{customdata[2]:.0f}°<extra></extra>",
                line: { color: band.color, width: 3 },
                marker: { color: band.color, size: 4 }
            };
        });
        const layout = {
            paper_bgcolor: "#121821", plot_bgcolor: "#121821",
            margin: { l: 40, r: 8, t: 8, b: 34 },
            showlegend: true, legend: { orientation: "h", y: -0.2, font: { size: 8, color: "#cbd5e1" } },
            autosize: true,
            xaxis: { title: "u (kt)", zeroline: true, zerolinecolor: "#94a3b8", gridcolor: "#263244", color: "#cbd5e1" },
            yaxis: { title: "v (kt)", zeroline: true, zerolinecolor: "#94a3b8", gridcolor: "#263244", color: "#cbd5e1", scaleanchor: "x", scaleratio: 1 },
            font: { color: "#cbd5e1", size: 9 }
        };
        window.Plotly.react(el, traces, layout, { displayModeBar: false, responsive: true });
    }

    function addWindBarbsToSkewT(sounding) {
        const traces = [];
        const selectedPressures = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100];
        const levels = selectedPressures.map(p => sounding.levels.reduce((best, level) =>
            Math.abs(level.pressure - p) < Math.abs(best.pressure - p) ? level : best
        ));
        // Barb symbols are drawn in a narrow gutter at the right side of the
        // Skew-T in data coordinates; barb direction follows the meteorological
        // wind-from convention and feathers encode speed in 5/10 kt increments.
        const xs = [], ys = [];
        levels.forEach(level => {
            const x = 78;
            const y = level.pressure;
            xs.push(x, x + 5, null);
            ys.push(y, y, null);
            const rounded = Math.round(level.windSpeed / 5) * 5;
            let remaining = rounded;
            let offset = 0;
            while (remaining >= 5 && offset < 5) {
                const full = remaining >= 10;
                const length = full ? 3.3 : 2.0;
                const x0 = x + 5 - offset;
                const y0 = y;
                xs.push(x0, x0 - length, null);
                ys.push(y0, y0 - (full ? 13 : 8), null);
                remaining -= full ? 10 : 5;
                offset += full ? 1.4 : 1.0;
            }
            // Hover target carries exact level and wind metadata.
            traces.push({
                type: "scatter", mode: "markers",
                x: [x], y: [y],
                marker: { size: 10, color: "rgba(0,0,0,0.01)" },
                customdata: [[level.pressure, level.height, level.windSpeed, level.windDirection]],
                hovertemplate: "%{customdata[0]:.0f} hPa · %{customdata[1]:.0f} m<br>%{customdata[2]:.0f} kt · direção %{customdata[3]:.0f}°<extra>Barbela</extra>",
                showlegend: false
            });
        });
        traces.unshift({
            type: "scatter", mode: "lines", x: xs, y: ys,
            line: { color: "#f8fafc", width: 1.5 },
            hoverinfo: "skip", showlegend: false
        });
        return traces;
    }

    // --------------------------------------------------
    // 9. ATUALIZAÇÃO DA INTERFACE
    // --------------------------------------------------

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = value;
    }

    function setIndexUnavailable(id) {
        const element = $(id);
        if (element) {
            element.textContent = "N/D";
            element.style.color = "#94a3b8";
            element.title =
                "Não calculado: faltam dados para determinar este índice.";
        }
    }

    function updateReadouts(sounding, thermo, kinematics) {
        setText("lcl-value", `${round(thermo.lcl.height, 0)} m`);
        setText("cape-value", `${round(thermo.cape, 0)} J/kg`);
        setText("cin-value", `${round(thermo.cin, 0)} J/kg`);
        setText(
            "lfc-value",
            thermo.lfc === null
                ? "Não identificado"
                : `${round(thermo.lfc, 0)} hPa`
        );
        setText(
            "el-value",
            thermo.equilibriumLevel === null
                ? "Não identificado"
                : `${round(thermo.equilibriumLevel, 0)} hPa`
        );

        setText(
            "shear-01km",
            `${round(kinematics.shear01km, 1)} kt`
        );
        setText(
            "shear-03km",
            `${round(kinematics.shear03km, 1)} kt`
        );
        setText(
            "shear-06km",
            `${round(kinematics.shear06km, 1)} kt`
        );

        // Atualiza os IDs usados pela interface antiga.
        const windMap = {
            "v-850": 850,
            "v-700": 700,
            "v-500": 500,
            "v-300": 300,
            "v-100": 100
        };

        for (const [id, pressure] of Object.entries(windMap)) {
            const level = sounding.levels.reduce((best, item) =>
                Math.abs(item.pressure - pressure) <
                Math.abs(best.pressure - pressure)
                    ? item
                    : best
            );

            setText(id, `${round(level.windSpeed, 0)} kt`);
        }

        // Não fabricamos índices compostos a partir de dados
        // insuficientes. Eles serão implementados quando houver
        // SRH válido, movimento da tempestade e os demais termos.
        setIndexUnavailable("idx-stp");
        setIndexUnavailable("idx-scp");
        setIndexUnavailable("idx-ehi");
    }

    function validateInputs(params) {
        if (
            params.temp < -80 || params.temp > 60 ||
            params.dewpoint < -100 || params.dewpoint > 50 ||
            params.lapse < 0 || params.lapse > 15 ||
            params.wind < 0 || params.wind > 250 ||
            params.srw < 0 || params.srw > 150
        ) {
            throw new Error(
                "Um ou mais parâmetros estão fora do intervalo permitido."
            );
        }
    }

    function update() {
        const container = $("skewt-chart");
        if (!container) return;

        const params = {
            temp: readNumber("temp", 30),
            dewpoint: readNumber("dwpt", 22),
            lapse: readNumber("lapse", 6.5),
            wind: readNumber("wind", 10),
            srw: readNumber("srw", 20)
        };

        try {
            validateInputs(params);

            params.dewpoint = Math.min(
                params.dewpoint,
                params.temp
            );

            const sounding = generateSounding(params);
            const thermo = calculateThermodynamics(sounding);
            const kinematics = calculateKinematics(sounding);
            const traces = buildSkewTTraces(sounding, thermo);
            traces.push(...addWindBarbsToSkewT(sounding));

            lastSounding = {
                sounding,
                thermo,
                kinematics
            };

            renderSkewT(traces);
            renderHodograph(sounding);
            updateReadouts(sounding, thermo, kinematics);

            // Envia os diagnósticos recalculados para o Outlook automático.
            window.dispatchEvent(new CustomEvent("models-sounding-updated", {
                detail: {
                    cape: thermo.cape,
                    cin: thermo.cin,
                    lcl: thermo.lcl.height,
                    shear01km: kinematics.shear01km,
                    shear03km: kinematics.shear03km,
                    shear06km: kinematics.shear06km,
                    surfaceTemp: sounding.surface.temp,
                    surfaceDewpoint: sounding.surface.dewpoint
                }
            }));

            setText(
                "sounding-status",
                "SONDAGEM SINTÉTICA — Outlook recalculado"
            );
        } catch (error) {
            console.error(
                "[Models-Sandbox] Falha na sondagem:",
                error
            );

            setText(
                "sounding-status",
                "ERRO NOS PARÂMETROS"
            );
        }
    }

    function scheduleUpdate() {
        if (updateScheduled) return;

        updateScheduled = true;

        requestAnimationFrame(() => {
            updateScheduled = false;
            update();
        });
    }

    function init() {
        const controls = [
            "temp",
            "dwpt",
            "lapse",
            "wind",
            "srw"
        ];

        controls.forEach(id => {
            const element = $(id);
            if (!element) return;

            element.addEventListener("input", scheduleUpdate);
            element.addEventListener("change", scheduleUpdate);
        });

        // Mantém compatibilidade com a aba de sondagem.
        const tabButton = document.querySelector(
            '[onclick*="skewt-tab"]'
        );

        if (tabButton) {
            tabButton.addEventListener("click", () => {
                setTimeout(scheduleUpdate, 100);
            });
        }

        update();
    }

    return {
        init,
        update,
        getLastSounding: () => lastSounding
    };
})();
window.ModelsSounding = ModelsSounding;

// Compatibilidade com o nome usado pelo código anterior.
function atualizarGraficoSkewT() {
    ModelsSounding.update();
}

window.addEventListener("DOMContentLoaded", () => {
    ModelsSounding.init();
});

// Integração opcional com o sistema antigo de mesoanálise.
if (typeof window.processarMesoanalise === "function") {
    const originalMesoanalysis = window.processarMesoanalise;

    window.processarMesoanalise = function (...args) {
        const result = originalMesoanalysis.apply(this, args);
        atualizarGraficoSkewT();
        return result;
    };
}
