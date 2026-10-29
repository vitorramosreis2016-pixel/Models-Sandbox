/* MODELS-SANDBOX — MAPA DE CENÁRIOS DE CHUVA EXCESSIVA
 * Polígonos manuais para explorar áreas de risco; não são previsões oficiais.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const CATEGORIES = {
    marginal: { label: "Marginal", color: "#b8d9a8" },
    slight: { label: "Slight", color: "#f5e45b" },
    moderate: { label: "Moderate", color: "#e99a45" },
    high: { label: "High", color: "#df4545" }
  };
  let map = null;
  let areas = null;
  let vertices = [];
  let markers = null;
  let preview = null;
  let drawing = false;

  function status(message) {
    const node = $("rainfall-status");
    if (node) node.textContent = message;
  }
  function initMap() {
    const container = $("rainfall-map");
    if (!container || typeof L === "undefined") {
      status("Leaflet indisponível. Verifique a conexão e recarregue a página.");
      return;
    }
    if (map) { map.invalidateSize(); return; }
    map = L.map(container, { center: [37.5, -96], zoom: 4, minZoom: 2, worldCopyJump: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    areas = L.featureGroup().addTo(map);
    markers = L.layerGroup().addTo(map);
    map.on("click", e => {
      if (!drawing) return;
      vertices.push(e.latlng);
      L.circleMarker(e.latlng, { radius: 4, color: "#fff", weight: 2, fillColor: "#38bdf8", fillOpacity: 1 }).addTo(markers);
      updatePreview();
      $("rainfall-finish").disabled = vertices.length < 3;
      status(`Vértices: ${vertices.length}. Marque pelo menos três pontos.`);
    });
    map.on("dblclick", () => { if (drawing && vertices.length >= 3) finish(); });
    status("Mapa carregado. Selecione uma categoria e desenhe um polígono.");
  }
  function updatePreview() {
    if (preview) map.removeLayer(preview);
    preview = vertices.length > 1 ? L.polyline(vertices, { color: "#38bdf8", dashArray: "6 5", weight: 2 }).addTo(map) : null;
  }
  function cancel() {
    drawing = false;
    if (map) map.doubleClickZoom.enable();
    if (markers) markers.clearLayers();
    if (preview && map) map.removeLayer(preview);
    preview = null; vertices = [];
    if ($("rainfall-draw")) $("rainfall-draw").disabled = false;
    if ($("rainfall-finish")) $("rainfall-finish").disabled = true;
    if ($("rainfall-cancel")) $("rainfall-cancel").disabled = true;
  }
  function start() {
    initMap();
    if (!map) return;
    cancel(); drawing = true; map.doubleClickZoom.disable();
    $("rainfall-draw").disabled = true;
    $("rainfall-cancel").disabled = false;
    status("Clique no mapa para marcar os vértices. São necessários pelo menos três.");
  }
  function finish() {
    if (!drawing || vertices.length < 3) { status("Marque pelo menos três pontos para fechar a área."); return; }
    const category = CATEGORIES[$("rainfall-category").value] || CATEGORIES.marginal;
    const polygon = L.polygon(vertices, { color: category.color, weight: 2, fillColor: category.color, fillOpacity: 0.32 }).addTo(areas);
    polygon.bindPopup(`<strong>Cenário de chuva excessiva: ${category.label}</strong><br>Polígono desenhado manualmente.<br><em>Não é um produto oficial nem observação real.</em>`);
    cancel();
    status(`Área ${category.label} adicionada. Você pode desenhar outras áreas.`);
  }
  function clear() { cancel(); if (areas) areas.clearLayers(); status("Todas as áreas de cenário foram removidas."); }
  function onTabChange() {
    const section = $("rainfall-tab");
    if (section && section.classList.contains("active")) setTimeout(initMap, 100);
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("rainfall-draw")?.addEventListener("click", start);
    $("rainfall-finish")?.addEventListener("click", finish);
    $("rainfall-cancel")?.addEventListener("click", () => { cancel(); status("Desenho cancelado."); });
    $("rainfall-clear")?.addEventListener("click", clear);
    document.querySelectorAll(".tab-btn").forEach(button => button.addEventListener("click", () => setTimeout(onTabChange, 80)));
    onTabChange();
  });
  window.ModelsRainfall = { init: initMap, clear };
})();