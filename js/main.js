// CONTROLADOR PRINCIPAL — AMBIENTE ATMOSFÉRICO COMPARTILHADO
// Os diagnósticos exibidos aqui vêm do mesmo perfil calculado pelo
// motor da sondagem (js/skewt.js). Não manter uma segunda CAPE/CIN falsa.

"use strict";

const $ = id => document.getElementById(id);

const controls = {
    temp: { input: $("temp"), output: $("val-temp") },
    dwpt: { input: $("dwpt"), output: $("val-dwpt") },
    wind: { input: $("wind"), output: $("val-wind") },
    lapse: { input: $("lapse"), output: $("val-lapse") },
    srw: { input: $("srw"), output: $("val-srw") }
};

function processarMesoanalise() {
    const temp = Number(controls.temp.input?.value ?? 25);
    const dewpointInput = controls.dwpt.input;
    if (!dewpointInput) return;

    // Impede ponto de orvalho acima da temperatura ambiente.
    if (Number(dewpointInput.value) > temp) {
        dewpointInput.value = String(temp);
    }

    for (const [key, control] of Object.entries(controls)) {
        if (control.input && control.output) {
            control.output.textContent = control.input.value;
        }
    }

    // Compartilha os controles reais da tela inicial com o radar.
    try {
        localStorage.setItem("modelsSandboxEnvironment", JSON.stringify(Object.fromEntries(
            Object.entries(controls).map(([key, control]) => [key, Number(control.input.value)])
        )));
    } catch (error) { console.warn("Ambiente não compartilhado com o radar.", error); }

    // Recalcula a sondagem completa usando o estado comum do ambiente.
    if (window.ModelsSounding && typeof window.ModelsSounding.update === "function") {
        window.ModelsSounding.update();
    }
}

// O painel lateral recebe os mesmos diagnósticos do motor da sondagem.
// Assim, os valores não divergem entre a barra lateral e o Skew-T.
window.addEventListener("models-sounding-updated", event => {
    const data = event.detail || {};
    const format = (value, digits = 0) =>
        Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";

    const lcl = $("lcl-result");
    const cape = $("cape-result");
    const cin = $("cin-result");

    if (lcl) lcl.textContent = format(data.lcl);
    if (cape) cape.textContent = format(data.cape);
    if (cin) cin.textContent = format(data.cin);
});

Object.values(controls).forEach(control => {
    if (!control.input) return;
    control.input.addEventListener("input", processarMesoanalise);
    control.input.addEventListener("change", processarMesoanalise);
});

window.processarMesoanalise = processarMesoanalise;

window.addEventListener("DOMContentLoaded", processarMesoanalise);
