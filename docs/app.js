/**
 * AntsMapped API - Client Application & Interactive Explorer
 * Vanilla JavaScript (ES6+), No external dependencies
 * Features: Instant autocomplete across 15,400+ taxa, dynamic code generator,
 * one-click citation copy, Dark/Light mode toggle, bilingual support (EN/CS).
 */

document.addEventListener("DOMContentLoaded", () => {
  // State
  const state = {
    taxaIndex: null,
    selectedTaxon: {
      name: "Lasius niger",
      rank: "species",
      regionsCount: 81,
      isGenus: false,
    },
    params: {
      proj: "equal_earth",
      theme: "dark",
      lang: "en",
    },
    apiServer: "demo", // 'demo', 'hf', 'local'
    customApiUrl: "https://sidlocz-antsmappedapi.hf.space",
    localApiUrl: "http://localhost:8000",
    activeCodeTab: "discord-py",
    currentLang: localStorage.getItem("antsmapped_lang") || "en",
    currentTheme: localStorage.getItem("antsmapped_theme") || "dark",
  };

  // Known demo maps available offline on GitHub Pages
  const DEMO_MAPS = {
    "Lasius niger": {
      "equal_earth_dark_en": "demo_maps/Lasius_niger_equal_earth_dark_en.png",
      "plate_carree_dark_en": "demo_maps/Lasius_niger_plate_carree_dark_en.png",
      "mercator_light_cs": "demo_maps/Lasius_niger_mercator_light_cs.png",
    },
    "Formica rufa": {
      "equal_earth_dark_en": "demo_maps/Formica_rufa_equal_earth_dark_en.png",
    },
    "Linepithema humile": {
      "equal_earth_dark_en": "demo_maps/Linepithema_humile_equal_earth_dark_en.png",
    },
    "Solenopsis invicta": {
      "equal_earth_dark_en": "demo_maps/Solenopsis_invicta_equal_earth_dark_en.png",
    },
    "Oecophylla smaragdina": {
      "equal_earth_dark_en": "demo_maps/Oecophylla_smaragdina_equal_earth_dark_en.png",
    },
    "Camponotus ligniperda": {
      "equal_earth_dark_cs": "demo_maps/Camponotus_ligniperda_equal_earth_dark_cs.png",
    },
    "Camponotus": {
      "equal_earth_dark_en": "demo_maps/genus_Camponotus_equal_earth_dark_en.png",
    },
  };

  // DOM Elements
  const searchInput = document.getElementById("taxon-search-input");
  const autocompleteList = document.getElementById("autocomplete-results");
  const mapImage = document.getElementById("map-preview-img");
  const mapLoader = document.getElementById("map-loader");
  const selectedNameEl = document.getElementById("selected-taxon-name");
  const selectedRankEl = document.getElementById("selected-taxon-rank");
  const selectedRegionsEl = document.getElementById("selected-taxon-regions");
  const liveUrlCodeEl = document.getElementById("live-url-code");
  const copyUrlBtn = document.getElementById("copy-live-url-btn");
  const serverSelect = document.getElementById("server-target-select");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const langToggleBtn = document.getElementById("lang-toggle-btn");
  const codePre = document.getElementById("code-display");
  const copyCodeBtn = document.getElementById("copy-code-btn");
  const toastContainer = document.getElementById("toast-container");

  // Initialize Theme
  applyTheme(state.currentTheme);

  // Initialize Language
  applyLanguage(state.currentLang);

  // Load Taxa Index Data
  fetch("data/taxa_index.json")
    .then((res) => {
      if (!res.ok) throw new Error("Index load error");
      return res.json();
    })
    .then((data) => {
      state.taxaIndex = data;
      console.log(`Taxa index loaded: ${data.taxa.length} species, ${data.genera.length} genera`);
    })
    .catch((err) => {
      console.warn("Could not load taxa_index.json asynchronously:", err);
    });

  // Event Listeners for Segmented Controls (Projection, Theme, Language)
  document.querySelectorAll(".segmented-control").forEach((ctrl) => {
    ctrl.addEventListener("click", (e) => {
      const btn = e.target.closest(".segment-btn");
      if (!btn) return;
      const param = ctrl.dataset.param;
      const val = btn.dataset.value;

      ctrl.querySelectorAll(".segment-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      state.params[param] = val;
      updatePreview();
    });
  });

  // Server Target Selection
  if (serverSelect) {
    serverSelect.addEventListener("change", (e) => {
      state.apiServer = e.target.value;
      updatePreview();
    });
  }

  // Theme Toggle Button
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const nextTheme = state.currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
    });
  }

  // Language Toggle Button
  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", () => {
      const nextLang = state.currentLang === "en" ? "cs" : "en";
      applyLanguage(nextLang);
    });
  }

  // Copy Live URL Button
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener("click", () => {
      const url = liveUrlCodeEl.textContent;
      copyToClipboard(url, state.currentLang === "cs" ? "URL adresa mapy zkopírována!" : "Map URL copied to clipboard!");
    });
  }

  // Copy Code Button
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", () => {
      const code = codePre.textContent;
      copyToClipboard(code, state.currentLang === "cs" ? "Ukázka kódu zkopírována!" : "Code snippet copied to clipboard!");
    });
  }

  // Code Tabs Switcher
  document.querySelectorAll(".code-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".code-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeCodeTab = tab.dataset.tab;
      renderCodeSnippet();
    });
  });

  // Autocomplete Search Logic
  let debounceTimeout = null;
  let activeIndex = -1;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 2) {
      autocompleteList.innerHTML = "";
      autocompleteList.classList.remove("active");
      return;
    }

    debounceTimeout = setTimeout(() => {
      performSearch(query);
    }, 120);
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = autocompleteList.querySelectorAll(".result-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      highlightItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      highlightItem(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        items[activeIndex].click();
      }
    } else if (e.key === "Escape") {
      autocompleteList.classList.remove("active");
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
      autocompleteList.classList.remove("active");
    }
  });

  function highlightItem(items) {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  }

  function performSearch(query) {
    if (!state.taxaIndex) return;

    const results = [];
    const q = query.toLowerCase();

    // 1. Search genera first if matching
    for (const g of state.taxaIndex.genera) {
      if (g.n.toLowerCase().startsWith(q)) {
        results.push({
          name: g.n,
          rank: "genus",
          count: g.c,
          isGenus: true,
        });
        if (results.length >= 4) break;
      }
    }

    // 2. Search species and subspecies
    for (const sp of state.taxaIndex.taxa) {
      if (sp.n.toLowerCase().includes(q)) {
        results.push({
          name: sp.n,
          rank: sp.r === "sp" ? "species" : "subspecies",
          count: sp.c,
          isGenus: false,
        });
        if (results.length >= 18) break;
      }
    }

    renderAutocomplete(results);
  }

  function renderAutocomplete(results) {
    autocompleteList.innerHTML = "";
    activeIndex = -1;

    if (!results.length) {
      autocompleteList.classList.remove("active");
      return;
    }

    results.forEach((item) => {
      const div = document.createElement("div");
      div.className = "result-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "result-name";
      if (item.isGenus) {
        nameSpan.classList.add("rank-genus");
        nameSpan.textContent = `${item.name} spp.`;
      } else {
        nameSpan.classList.add("tax-name");
        nameSpan.textContent = item.name;
      }

      const metaDiv = document.createElement("div");
      metaDiv.className = "result-meta";

      const badge = document.createElement("span");
      badge.className = `badge badge-${item.rank}`;
      badge.textContent = item.rank;

      const count = document.createElement("span");
      count.className = "regions-count";
      const regWord = state.currentLang === "cs" ? "regionů" : "regions";
      count.textContent = `${item.count} ${regWord}`;

      metaDiv.appendChild(badge);
      metaDiv.appendChild(count);

      div.appendChild(nameSpan);
      div.appendChild(metaDiv);

      div.addEventListener("click", () => {
        selectTaxon(item);
        autocompleteList.classList.remove("active");
      });

      autocompleteList.appendChild(div);
    });

    autocompleteList.classList.add("active");
  }

  function selectTaxon(item) {
    state.selectedTaxon = {
      name: item.name,
      rank: item.rank,
      regionsCount: item.count,
      isGenus: item.isGenus,
    };
    searchInput.value = item.name;
    updatePreview();
  }

  // Update Preview Area, Links & Code
  function updatePreview() {
    const { name, rank, regionsCount, isGenus } = state.selectedTaxon;
    const { proj, theme, lang } = state.params;

    // 1. Details header
    if (isGenus) {
      selectedNameEl.className = "info-title rank-genus";
      selectedNameEl.textContent = `${name} spp.`;
    } else {
      selectedNameEl.className = "info-title tax-name";
      selectedNameEl.textContent = name;
    }

    selectedRankEl.className = `badge badge-${rank}`;
    selectedRankEl.textContent = rank;
    const regLabel = state.currentLang === "cs" ? "biogeografických regionů GABI" : "GABI biogeographic regions";
    selectedRegionsEl.textContent = `${regionsCount} ${regLabel}`;

    // 2. Build live API URL
    const safeName = name.replace(/ /g, "_");
    const endpointPath = isGenus ? `/map/genus/${safeName}.png` : `/map/${safeName}.png`;
    const queryParams = `?proj=${proj}&theme=${theme}&lang=${lang}`;

    let baseHost = state.customApiUrl;
    if (state.apiServer === "local") {
      baseHost = state.localApiUrl;
    }

    const fullApiUrl = `${baseHost}${endpointPath}${queryParams}`;
    liveUrlCodeEl.textContent = fullApiUrl;

    // 3. Image preview resolution
    let imageSrc = fullApiUrl;

    if (state.apiServer === "demo") {
      const demoKey = `${proj}_${theme}_${lang}`;
      if (DEMO_MAPS[name] && DEMO_MAPS[name][demoKey]) {
        imageSrc = DEMO_MAPS[name][demoKey];
      } else if (DEMO_MAPS[name] && DEMO_MAPS[name]["equal_earth_dark_en"]) {
        imageSrc = DEMO_MAPS[name]["equal_earth_dark_en"];
      } else {
        // Fallback demo map to show visual layout
        imageSrc = "demo_maps/Lasius_niger_equal_earth_dark_en.png";
      }
    }

    // Load Image with Spinner
    mapLoader.classList.add("loading");
    const tempImg = new Image();
    tempImg.onload = () => {
      mapImage.src = imageSrc;
      mapLoader.classList.remove("loading");
    };
    tempImg.onerror = () => {
      console.warn("Failed to load map image from:", imageSrc);
      // Fallback to default demo map
      mapImage.src = "demo_maps/Lasius_niger_equal_earth_dark_en.png";
      mapLoader.classList.remove("loading");
    };
    tempImg.src = imageSrc;

    // 4. Download and JSON distribution buttons
    const dlBtn = document.getElementById("btn-download-png");
    if (dlBtn) {
      dlBtn.href = imageSrc;
      dlBtn.download = `${safeName}_${proj}_${theme}.png`;
    }

    const jsonBtn = document.getElementById("btn-view-json");
    if (jsonBtn) {
      jsonBtn.href = `${baseHost}/api/v1/distribution/${safeName}`;
    }

    // 5. Re-render Code Snippets
    renderCodeSnippet();
  }

  // Code Snippet Generator
  function renderCodeSnippet() {
    const { name, isGenus } = state.selectedTaxon;
    const { proj, theme, lang } = state.params;
    const safeName = name.replace(/ /g, "_");
    const endpointPath = isGenus ? `/map/genus/${safeName}.png` : `/map/${safeName}.png`;
    const queryParams = `?proj=${proj}&theme=${theme}&lang=${lang}`;
    const baseHost = state.apiServer === "local" ? state.localApiUrl : state.customApiUrl;
    const fullUrl = `${baseHost}${endpointPath}${queryParams}`;

    let code = "";

    switch (state.activeCodeTab) {
      case "discord-py":
        code = `# discord.py v2.0+ Slash Command
import discord
from discord import app_commands

@bot.tree.command(name="antmap", description="Display ant species distribution map")
@app_commands.describe(taxon="Scientific name of species or genus")
async def antmap(interaction: discord.Interaction, taxon: str):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"${baseHost}/map/{clean_taxon}.png?proj=${proj}&theme=${theme}&lang=${lang}"
    
    embed = discord.Embed(
        title=f"Distribution: {taxon}",
        color=0x5865F2
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: GABI (Kass et al. 2022, Wong et al. 2023) | API: AntsMappedAPI")
    
    await interaction.response.send_message(embed=embed)
`;
        break;

      case "disnake":
        code = `# disnake Slash Command
import disnake
from disnake.ext import commands

@bot.slash_command(name="antmap", description="Get global ant distribution map")
async def antmap(inter: disnake.ApplicationCommandInteraction, taxon: str = "${name}"):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"${baseHost}/map/{clean_taxon}.png?proj=${proj}&theme=${theme}&lang=${lang}"
    
    embed = disnake.Embed(
        title=f"Distribution: {taxon}",
        color=disnake.Color.blurple()
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: GABI (Kass et al. 2022) | AntsMappedAPI")
    
    await inter.response.send_message(embed=embed)
`;
        break;

      case "requests":
        code = `# Python requests example
import requests

url = "${fullUrl}"
response = requests.get(url)

if response.status_code == 200:
    with open("${safeName}_map.png", "wb") as f:
        f.write(response.content)
    print("Map successfully downloaded as ${safeName}_map.png")
else:
    print(f"Error {response.status_code}: {response.text}")
`;
        break;

      case "discord-js":
        code = `// discord.js v14 Slash Command
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antmap')
    .setDescription('Display ant distribution map')
    .addStringOption(opt => 
      opt.setName('taxon')
        .setDescription('Species or genus name')
        .setRequired(true)),

  async execute(interaction) {
    const taxon = interaction.options.getString('taxon');
    const safeTaxon = taxon.replace(/ /g, '_');
    const mapUrl = \`${baseHost}/map/\${safeTaxon}.png?proj=${proj}&theme=${theme}&lang=${lang}\`;

    const embed = new EmbedBuilder()
      .setTitle(\`Distribution: \${taxon}\`)
      .setImage(mapUrl)
      .setColor(0x5865F2)
      .setFooter({ text: 'Data: GABI (Kass et al. 2022) | API: AntsMappedAPI' });

    await interaction.reply({ embeds: [embed] });
  },
};
`;
        break;

      case "fetch":
        code = `// JavaScript / Node.js fetch
const mapUrl = "${fullUrl}";

fetch(mapUrl)
  .then(res => {
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return res.blob();
  })
  .then(blob => {
    const objectUrl = URL.createObjectURL(blob);
    console.log("Map image loaded successfully:", objectUrl);
  })
  .catch(err => console.error("Map fetch failed:", err));
`;
        break;

      case "curl":
        code = `# Download PNG map via cURL
curl -f -o "${safeName}_map.png" "${fullUrl}"

# Query JSON species distribution
curl -s "${baseHost}/api/v1/distribution/${safeName}" | jq .
`;
        break;

      default:
        code = fullUrl;
    }

    codePre.textContent = code;
  }

  // Citation Copy Buttons
  document.querySelectorAll(".btn-copy-citation").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.citeType;
      let textToCopy = "";

      if (type === "apa-kass") {
        textToCopy =
          "Kass, J. M., Guénard, B., Dudley, K. L., Jenkins, C. N., Azuma, F., Fisher, B. L., Parr, C. L., Phang, D. E., Schultheiss, P., Shattuck, S. O., Suhr, E. L., & Economo, E. P. (2022). The global distribution of known and undiscovered ant biodiversity. Science Advances, 8(31), eabp9908. https://doi.org/10.1126/sciadv.abp9908";
      } else if (type === "apa-wong") {
        textToCopy =
          "Wong, M. K. L., Economo, E. P., & Guénard, B. (2023). The global spread and drivers of alien ant species. Nature Communications, 14, 8398. https://doi.org/10.1038/s41467-023-43861-9";
      } else if (type === "apa-savric") {
        textToCopy =
          "Šavrič, B., Patterson, T., & Jenny, B. (2018). The Equal Earth map projection. International Journal of Geographical Information Science, 33(3), 454–465. https://doi.org/10.1080/13658816.2018.1504949";
      } else if (type === "discord-footer") {
        textToCopy = "Data: GABI (Kass et al. 2022, Wong et al. 2023) | API: AntsMappedAPI";
      } else if (type === "bibtex-kass") {
        textToCopy = `@article{kass2022global,
  author = {Kass, Jamie M. and Gu{\\'e}nard, Benoit and Dudley, K. L. and Jenkins, Clinton N. and Azuma, F. and Fisher, Brian L. and Parr, Catherine L. and Phang, D. E. and Schultheiss, P. and Shattuck, Steven O. and Suhr, E. L. and Economo, Evan P.},
  title = {The global distribution of known and undiscovered ant biodiversity},
  journal = {Science Advances},
  volume = {8},
  number = {31},
  pages = {eabp9908},
  year = {2022},
  doi = {10.1126/sciadv.abp9908}
}`;
      }

      copyToClipboard(textToCopy, state.currentLang === "cs" ? "Citace zkopírována!" : "Citation copied to clipboard!");
    });
  });

  // Theme application
  function applyTheme(theme) {
    state.currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("antsmapped_theme", theme);
  }

  // Language application (Bilingual UI labels)
  function applyLanguage(lang) {
    state.currentLang = lang;
    localStorage.setItem("antsmapped_lang", lang);

    document.querySelectorAll("[data-i18n-en]").forEach((el) => {
      const text = lang === "cs" ? el.dataset.i18nCs : el.dataset.i18nEn;
      if (text) el.textContent = text;
    });

    const langLabel = document.getElementById("lang-btn-text");
    if (langLabel) {
      langLabel.textContent = lang === "en" ? "EN" : "CS";
    }

    updatePreview();
  }

  // Copy to Clipboard Utility
  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(successMsg);
    }
  }

  // Toast System
  function showToast(msg) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      <span>${msg}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // Initial preview render
  updatePreview();
});
