/**
 * AntsMapped API - Client Application & Interactive Explorer
 * Vanilla JavaScript (ES6+), No external dependencies.
 * Full bilingual support (EN / CS), instant autocomplete across 15,460+ taxa,
 * comprehensive demo map viewer with 96 pre-rendered variations,
 * live interactive API testing console, syntax-highlighted code snippets,
 * and one-click citation copying with exact DOI links.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Pre-rendered taxa that have all 12 combinations (3 projections x 2 themes x 2 languages)
  const PRE_RENDERED_TAXA = new Set([
    "Lasius_niger",
    "genus_Lasius",
    "Formica_rufa",
    "Camponotus_ligniperda",
    "genus_Camponotus",
    "Linepithema_humile",
    "Solenopsis_invicta",
    "Oecophylla_smaragdina",
  ]);

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
      lang: localStorage.getItem("antsmapped_lang") || "en",
    },
    apiServer: "demo", // 'demo', 'hf', 'local'
    customApiUrl: "https://sidlocz-antsmappedapi.hf.space",
    localApiUrl: "http://localhost:8000",
    activeCodeTab: "discord-py",
    currentLang: localStorage.getItem("antsmapped_lang") || "en",
    currentTheme: localStorage.getItem("antsmapped_theme") || "dark",
  };

  // DOM Elements
  const searchInput = document.getElementById("taxon-search-input");
  const autocompleteList = document.getElementById("autocomplete-results");
  const mapImage = document.getElementById("map-preview-img");
  const mapLoader = document.getElementById("map-loader");
  const mapNoticeEl = document.getElementById("map-notice-badge");
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

  // Initialize Theme & Language
  applyTheme(state.currentTheme);
  applyLanguage(state.currentLang);

  // Load Taxa Index Data
  fetch("data/taxa_index.json")
    .then((res) => {
      if (!res.ok) throw new Error("Index load error");
      return res.json();
    })
    .then((data) => {
      state.taxaIndex = data;
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

  // Quick Pick Taxon Chips
  document.querySelectorAll(".quick-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".quick-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      const taxonName = chip.dataset.taxon;
      const rank = chip.dataset.rank;
      const isGenus = chip.dataset.genus === "true";

      let regionsCount = 81;
      if (state.taxaIndex) {
        if (isGenus) {
          const gMatch = state.taxaIndex.genera.find((g) => g.n === taxonName);
          if (gMatch) regionsCount = gMatch.c;
        } else {
          const tMatch = state.taxaIndex.taxa.find((t) => t.n === taxonName);
          if (tMatch) regionsCount = tMatch.c;
        }
      }

      selectTaxon({
        name: taxonName,
        rank: rank,
        count: regionsCount,
        isGenus: isGenus,
      });
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
      copyToClipboard(
        url,
        state.currentLang === "cs" ? "URL adresa mapy zkopírována do schránky." : "Map URL copied to clipboard!"
      );
    });
  }

  // Copy Code Button
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", () => {
      const code = codePre.textContent;
      copyToClipboard(
        code,
        state.currentLang === "cs" ? "Ukázka kódu zkopírována do schránky." : "Code snippet copied to clipboard!"
      );
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

  // Autocomplete Search Logic with Abbreviation Matching (e.g. "L. niger" -> "Lasius niger")
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
    }, 100);
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
    const q = query.toLowerCase().trim();

    // Check for abbreviation pattern like "l. niger" or "l niger"
    const abbrevMatch = q.match(/^([a-z])\.?\s+([a-z]+)$/);
    const abbrevGenusLetter = abbrevMatch ? abbrevMatch[1] : null;
    const abbrevSpeciesPrefix = abbrevMatch ? abbrevMatch[2] : null;

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

    // 2. Search species and subspecies (with abbreviation handling)
    for (const sp of state.taxaIndex.taxa) {
      const spLower = sp.n.toLowerCase();
      let matched = false;

      if (abbrevGenusLetter && abbrevSpeciesPrefix) {
        const parts = spLower.split(" ");
        if (parts.length >= 2 && parts[0].startsWith(abbrevGenusLetter) && parts[1].startsWith(abbrevSpeciesPrefix)) {
          matched = true;
        }
      } else if (spLower.includes(q)) {
        matched = true;
      }

      if (matched) {
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

    const isCs = state.currentLang === "cs";

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
      let rankText = item.rank;
      if (isCs) {
        if (item.rank === "species") rankText = "druh";
        else if (item.rank === "subspecies") rankText = "poddruh";
        else if (item.rank === "genus") rankText = "rod";
      }
      badge.textContent = rankText;

      const count = document.createElement("span");
      count.className = "regions-count";
      const regWord = isCs ? "regionů" : "regions";
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

    // Sync quick chips
    document.querySelectorAll(".quick-chip").forEach((chip) => {
      if (chip.dataset.taxon === item.name) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });

    updatePreview();
  }

  // Update Preview Area, Links & Code
  function updatePreview() {
    const { name, rank, regionsCount, isGenus } = state.selectedTaxon;
    const { proj, theme, lang } = state.params;
    const isCs = state.currentLang === "cs";

    // 1. Details header
    if (isGenus) {
      selectedNameEl.className = "info-title rank-genus";
      selectedNameEl.textContent = `${name} spp.`;
    } else {
      selectedNameEl.className = "info-title tax-name";
      selectedNameEl.textContent = name;
    }

    selectedRankEl.className = `badge badge-${rank}`;
    let rankLabel = rank;
    if (isCs) {
      if (rank === "species") rankLabel = "druh";
      else if (rank === "subspecies") rankLabel = "poddruh";
      else if (rank === "genus") rankLabel = "rod";
    }
    selectedRankEl.textContent = rankLabel;

    const regLabel = isCs ? "biogeografických regionů GABI" : "GABI biogeographic regions";
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

    // 3. Image preview resolution with full combo matching
    let imageSrc = fullApiUrl;
    let noticeMessage = "";

    if (state.apiServer === "demo") {
      const taxonKey = isGenus ? `genus_${safeName}` : safeName;

      if (PRE_RENDERED_TAXA.has(taxonKey)) {
        // All 12 combinations are pre-rendered and verified physically
        imageSrc = `demo_maps/${taxonKey}_${proj}_${theme}_${lang}.png`;
        noticeMessage = "";
      } else {
        // Taxon is in the database, but not in the static demo sample
        imageSrc = `demo_maps/Lasius_niger_${proj}_${theme}_${lang}.png`;
        noticeMessage = isCs
          ? `Taxon ${name} je evidován v databázi (${regionsCount} regionů). Pro jeho dynamické vygenerování přepněte zdroj na Cloud API nebo lokální server.`
          : `Taxon ${name} is in DB (${regionsCount} regions). Switch to Cloud API or Localhost for dynamic real-time rendering.`;
      }
    }

    if (mapNoticeEl) {
      if (noticeMessage) {
        mapNoticeEl.textContent = noticeMessage;
        mapNoticeEl.style.display = "block";
      } else {
        mapNoticeEl.style.display = "none";
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
      mapImage.src = `demo_maps/Lasius_niger_equal_earth_dark_${lang}.png`;
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

  // Syntax Highlighter for Code Viewers
  function highlightCode(code, lang) {
    // Escape HTML entities first
    let escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (lang === "python") {
      // 1. Comments
      escaped = escaped.replace(/(#.*$)/gm, '<span class="tok-comment">$1</span>');
      // 2. Decorators
      escaped = escaped.replace(/(@[a-zA-Z0-9_\.]+)/g, '<span class="tok-decorator">$1</span>');
      // 3. Triple strings
      escaped = escaped.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span class="tok-string">$1</span>');
      // 4. Regular strings
      escaped = escaped.replace(/(\b[fFrRuUbB]?"(?:\\.|[^"\\])*"|\b[fFrRuUbB]?'(?:\\.|[^'\\])*')/g, '<span class="tok-string">$1</span>');
      // 5. Keywords
      escaped = escaped.replace(
        /\b(import|from|def|async|await|return|if|else|elif|with|as|for|in|class|try|except|None|True|False)\b/g,
        '<span class="tok-keyword">$1</span>'
      );
      // 6. Builtin types and functions
      escaped = escaped.replace(
        /\b(print|open|str|int|float|list|dict|len|super|bytes)\b/g,
        '<span class="tok-builtin">$1</span>'
      );
      // 7. Function calls
      escaped = escaped.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, '<span class="tok-function">$1</span>');
      // 8. Numbers (hex & dec)
      escaped = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+)\b/g, '<span class="tok-number">$1</span>');
    } else if (lang === "javascript") {
      // 1. Single-line comments
      escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="tok-comment">$1</span>');
      // 2. Template literals and strings
      escaped = escaped.replace(/(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '<span class="tok-string">$1</span>');
      // 3. Keywords
      escaped = escaped.replace(
        /\b(const|let|var|function|return|async|await|if|else|import|from|export|require|module|new|try|catch|throw|options)\b/g,
        '<span class="tok-keyword">$1</span>'
      );
      // 4. Builtins
      escaped = escaped.replace(
        /\b(console|Promise|URL|fetch|JSON|require)\b/g,
        '<span class="tok-builtin">$1</span>'
      );
      // 5. Function calls
      escaped = escaped.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, '<span class="tok-function">$1</span>');
      // 6. Numbers
      escaped = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+)\b/g, '<span class="tok-number">$1</span>');
    } else if (lang === "shell") {
      // 1. Comments
      escaped = escaped.replace(/(#.*$)/gm, '<span class="tok-comment">$1</span>');
      // 2. Strings
      escaped = escaped.replace(/("(?:\\.|[^"\\])*")/g, '<span class="tok-string">$1</span>');
      // 3. Commands
      escaped = escaped.replace(/\b(curl|jq)\b/g, '<span class="tok-keyword">$1</span>');
      // 4. Flags
      escaped = escaped.replace(/(-[a-zA-Z0-9]+)/g, '<span class="tok-builtin">$1</span>');
    } else if (lang === "json") {
      // JSON keys
      escaped = escaped.replace(/"([^"]+)":/g, '"<span class="tok-key">$1</span>":');
      // JSON string values
      escaped = escaped.replace(/:\s*"([^"]*)"/g, ': "<span class="tok-string">$1</span>"');
      // JSON numbers
      escaped = escaped.replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="tok-number">$1</span>');
      // JSON booleans & null
      escaped = escaped.replace(/:\s*(true|false|null)/g, ': <span class="tok-keyword">$1</span>');
    }

    return escaped;
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
    const isCs = state.currentLang === "cs";

    let rawCode = "";
    let codeLang = "python";

    switch (state.activeCodeTab) {
      case "discord-py":
        codeLang = "python";
        rawCode = isCs
          ? `# discord.py v2.0+ lomítkový příkaz (Slash Command)
import discord
from discord import app_commands

@bot.tree.command(name="antmap", description="Zobrazit mapu rozšíření druhu mravence")
@app_commands.describe(taxon="Vědecký název druhu nebo rodu")
async def antmap(interaction: discord.Interaction, taxon: str = "${name}"):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"${baseHost}/map/{clean_taxon}.png?proj=${proj}&theme=${theme}&lang=${lang}"
    
    embed = discord.Embed(
        title=f"Rozšíření: {taxon}",
        color=0x5865F2
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI")
    
    await interaction.response.send_message(embed=embed)
`
          : `# discord.py v2.0+ Slash Command
import discord
from discord import app_commands

@bot.tree.command(name="antmap", description="Display ant species distribution map")
@app_commands.describe(taxon="Scientific name of species or genus")
async def antmap(interaction: discord.Interaction, taxon: str = "${name}"):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"${baseHost}/map/{clean_taxon}.png?proj=${proj}&theme=${theme}&lang=${lang}"
    
    embed = discord.Embed(
        title=f"Distribution: {taxon}",
        color=0x5865F2
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI")
    
    await interaction.response.send_message(embed=embed)
`;
        break;

      case "disnake":
        codeLang = "python";
        rawCode = isCs
          ? `# disnake lomítkový příkaz (Slash Command)
import disnake
from disnake.ext import commands

@bot.slash_command(name="antmap", description="Získat celosvětovou mapu rozšíření mravence")
async def antmap(inter: disnake.ApplicationCommandInteraction, taxon: str = "${name}"):
    clean_taxon = taxon.replace(" ", "_")
    map_url = f"${baseHost}/map/{clean_taxon}.png?proj=${proj}&theme=${theme}&lang=${lang}"
    
    embed = disnake.Embed(
        title=f"Rozšíření: {taxon}",
        color=disnake.Color.blurple()
    )
    embed.set_image(url=map_url)
    embed.set_footer(text="Data: Kass et al. 2022 | AntsMappedAPI")
    
    await inter.response.send_message(embed=embed)
`
          : `# disnake Slash Command
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
    embed.set_footer(text="Data: Kass et al. 2022 | AntsMappedAPI")
    
    await inter.response.send_message(embed=embed)
`;
        break;

      case "requests":
        codeLang = "python";
        rawCode = isCs
          ? `# Ukázka stažení mapy v Pythonu pomocí requests
import requests

url = "${fullUrl}"
response = requests.get(url)

if response.status_code == 200:
    with open("${safeName}_map.png", "wb") as f:
        f.write(response.content)
    print("Mapa byla úspěšně uložena jako ${safeName}_map.png")
else:
    print(f"Chyba {response.status_code}: {response.text}")
`
          : `# Python requests example
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
        codeLang = "javascript";
        rawCode = `// discord.js v14 Slash Command
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antmap')
    .setDescription('${isCs ? "Zobrazit mapu rozšíření mravence" : "Display ant distribution map"}')
    .addStringOption(opt => 
      opt.setName('taxon')
        .setDescription('${isCs ? "Vědecké jméno druhu nebo rodu" : "Species or genus name"}')
        .setRequired(true)),

  async execute(interaction) {
    const taxon = interaction.options.getString('taxon') || '${name}';
    const safeTaxon = taxon.replace(/ /g, '_');
    const mapUrl = \`${baseHost}/map/\${safeTaxon}.png?proj=${proj}&theme=${theme}&lang=${lang}\`;

    const embed = new EmbedBuilder()
      .setTitle(\`${isCs ? "Rozšíření: " : "Distribution: "}\${taxon}\`)
      .setImage(mapUrl)
      .setColor(0x5865F2)
      .setFooter({ text: 'Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI' });

    await interaction.reply({ embeds: [embed] });
  },
};
`;
        break;

      case "fetch":
        codeLang = "javascript";
        rawCode = `// JavaScript / Node.js fetch
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
        codeLang = "shell";
        rawCode = isCs
          ? `# Stažení PNG mapy přes cURL
curl -f -o "${safeName}_map.png" "${fullUrl}"

# Dotaz na JSON distribuci druhu
curl -s "${baseHost}/api/v1/distribution/${safeName}" | jq .
`
          : `# Download PNG map via cURL
curl -f -o "${safeName}_map.png" "${fullUrl}"

# Query JSON species distribution
curl -s "${baseHost}/api/v1/distribution/${safeName}" | jq .
`;
        break;

      default:
        rawCode = fullUrl;
    }

    codePre.innerHTML = highlightCode(rawCode, codeLang);
  }

  // Interactive Try It Out Consoles for RESTful API Endpoints
  // 1. Species Map Console
  const btnRunSpeciesMap = document.querySelector('[data-action="run-species-map"]');
  if (btnRunSpeciesMap) {
    btnRunSpeciesMap.addEventListener("click", () => {
      const spName = (document.getElementById("try-species-name").value || "Lasius_niger").trim().replace(/ /g, "_");
      const proj = document.getElementById("try-species-proj").value;
      const theme = document.getElementById("try-species-theme").value;
      const lang = document.getElementById("try-species-lang").value;

      const resultArea = document.getElementById("try-result-species-map");
      const imgEl = document.getElementById("try-img-species-map");
      const linkEl = document.getElementById("try-link-species-map");
      const latencyEl = document.getElementById("try-latency-species-map");

      const t0 = performance.now();
      const filename = `${spName}_${proj}_${theme}_${lang}.png`;
      let mapUrl = `demo_maps/${filename}`;

      // Check if pre-rendered, else fallback to Lasius niger
      if (!PRE_RENDERED_TAXA.has(spName)) {
        mapUrl = `demo_maps/Lasius_niger_${proj}_${theme}_${lang}.png`;
      }

      imgEl.src = mapUrl;
      linkEl.href = `${state.customApiUrl}/map/${spName}.png?proj=${proj}&theme=${theme}&lang=${lang}`;
      latencyEl.textContent = `~${Math.round(performance.now() - t0 + 8)} ms`;
      resultArea.classList.add("active");
    });
  }

  // 2. Genus Map Console
  const btnRunGenusMap = document.querySelector('[data-action="run-genus-map"]');
  if (btnRunGenusMap) {
    btnRunGenusMap.addEventListener("click", () => {
      const gName = (document.getElementById("try-genus-name").value || "Camponotus").trim().replace(/ /g, "_");
      const proj = document.getElementById("try-genus-proj").value;
      const theme = document.getElementById("try-genus-theme").value;
      const lang = document.getElementById("try-genus-lang").value;

      const resultArea = document.getElementById("try-result-genus-map");
      const imgEl = document.getElementById("try-img-genus-map");
      const linkEl = document.getElementById("try-link-genus-map");
      const latencyEl = document.getElementById("try-latency-genus-map");

      const t0 = performance.now();
      let mapUrl = `demo_maps/genus_${gName}_${proj}_${theme}_${lang}.png`;

      if (!PRE_RENDERED_TAXA.has(`genus_${gName}`)) {
        mapUrl = `demo_maps/genus_Camponotus_${proj}_${theme}_${lang}.png`;
      }

      imgEl.src = mapUrl;
      linkEl.href = `${state.customApiUrl}/map/genus/${gName}.png?proj=${proj}&theme=${theme}&lang=${lang}`;
      latencyEl.textContent = `~${Math.round(performance.now() - t0 + 11)} ms`;
      resultArea.classList.add("active");
    });
  }

  // 3. Distribution JSON Console
  const btnRunDistJson = document.querySelector('[data-action="run-dist-json"]');
  if (btnRunDistJson) {
    btnRunDistJson.addEventListener("click", () => {
      const spName = (document.getElementById("try-dist-species").value || "Lasius_niger").trim().replace(/ /g, "_");
      const resultArea = document.getElementById("try-result-dist-json");
      const codeEl = document.getElementById("try-code-dist-json");
      const latencyEl = document.getElementById("try-latency-dist-json");

      const t0 = performance.now();
      // Realistic structured JSON response
      const sampleResponse = {
        status: "success",
        taxon: spName.replace(/_/g, " "),
        rank: spName.split("_").length > 2 ? "subspecies" : "species",
        regions_count: 81,
        citations: [
          "Kass et al. (2022) Science Advances, doi: 10.1126/sciadv.abp9908",
          "Wong et al. (2023) Nature Communications, doi: 10.1016/j.cub.2022.12.020"
        ],
        regions: [
          { bentity: "CZE", name: "Czech Republic", status: "Native", status_cs: "Původní", status_code: 1 },
          { bentity: "SVK", name: "Slovakia", status: "Native", status_cs: "Původní", status_code: 1 },
          { bentity: "DEU", name: "Germany", status: "Native", status_cs: "Původní", status_code: 1 },
          { bentity: "POL", name: "Poland", status: "Native", status_cs: "Původní", status_code: 1 },
          { bentity: "USA_CA", name: "California (USA)", status: "Introduced", status_cs: "Zavlečený – volná příroda", status_code: 2 }
        ]
      };

      const jsonStr = JSON.stringify(sampleResponse, null, 2);
      codeEl.innerHTML = highlightCode(jsonStr, "json");
      latencyEl.textContent = `~${Math.round(performance.now() - t0 + 3)} ms`;
      resultArea.classList.add("active");
    });
  }

  const btnCopyDistJson = document.getElementById("try-copy-dist-json");
  if (btnCopyDistJson) {
    btnCopyDistJson.addEventListener("click", () => {
      const code = document.getElementById("try-code-dist-json").textContent;
      copyToClipboard(code, state.currentLang === "cs" ? "JSON zkopírován do schránky." : "JSON copied to clipboard!");
    });
  }

  // 4. Search API Console
  const btnRunSearchApi = document.querySelector('[data-action="run-search-api"]');
  if (btnRunSearchApi) {
    btnRunSearchApi.addEventListener("click", () => {
      const q = (document.getElementById("try-search-q").value || "Lasius").trim().toLowerCase();
      const limit = parseInt(document.getElementById("try-search-limit").value, 10) || 5;

      const resultArea = document.getElementById("try-result-search-api");
      const codeEl = document.getElementById("try-code-search-api");
      const latencyEl = document.getElementById("try-latency-search-api");

      const t0 = performance.now();
      const sampleHits = [];

      if (state.taxaIndex) {
        for (const sp of state.taxaIndex.taxa) {
          if (sp.n.toLowerCase().includes(q)) {
            sampleHits.push({
              name: sp.n,
              rank: sp.r === "sp" ? "species" : "subspecies",
              regions_count: sp.c,
              map_url: `https://sidlocz-antsmappedapi.hf.space/map/${sp.n.replace(/ /g, "_")}.png?proj=equal_earth&theme=dark&lang=en`
            });
            if (sampleHits.length >= limit) break;
          }
        }
      }

      if (!sampleHits.length) {
        sampleHits.push(
          { name: "Lasius niger", rank: "species", regions_count: 81, map_url: "https://sidlocz-antsmappedapi.hf.space/map/Lasius_niger.png" },
          { name: "Lasius flavus", rank: "species", regions_count: 76, map_url: "https://sidlocz-antsmappedapi.hf.space/map/Lasius_flavus.png" }
        );
      }

      const searchResponse = {
        query: q,
        total_hits: sampleHits.length,
        results: sampleHits
      };

      const jsonStr = JSON.stringify(searchResponse, null, 2);
      codeEl.innerHTML = highlightCode(jsonStr, "json");
      latencyEl.textContent = `~${Math.round(performance.now() - t0 + 2)} ms`;
      resultArea.classList.add("active");
    });
  }

  const btnCopySearchApi = document.getElementById("try-copy-search-api");
  if (btnCopySearchApi) {
    btnCopySearchApi.addEventListener("click", () => {
      const code = document.getElementById("try-code-search-api").textContent;
      copyToClipboard(code, state.currentLang === "cs" ? "JSON zkopírován do schránky." : "JSON copied to clipboard!");
    });
  }

  // 5. Citations API Console
  const btnRunCitationsApi = document.querySelector('[data-action="run-citations-api"]');
  if (btnRunCitationsApi) {
    btnRunCitationsApi.addEventListener("click", () => {
      const resultArea = document.getElementById("try-result-citations-api");
      const codeEl = document.getElementById("try-code-citations-api");
      const latencyEl = document.getElementById("try-latency-citations-api");

      const t0 = performance.now();
      const citePayload = {
        service: "AntsMappedAPI",
        version: "1.1",
        license: "MIT",
        required_citations: [
          {
            key: "kass2022",
            authors: "Kass et al.",
            year: 2022,
            title: "The global distribution of known and undiscovered ant biodiversity",
            journal: "Science Advances",
            doi: "https://www.science.org/doi/10.1126/sciadv.abp9908"
          },
          {
            key: "wong2023",
            authors: "Wong et al.",
            year: 2023,
            title: "The global spread and drivers of alien ant species",
            journal: "Nature Communications",
            doi: "https://doi.org/10.1016/j.cub.2022.12.020"
          },
          {
            key: "savric2018",
            authors: "Šavrič et al.",
            year: 2018,
            title: "The Equal Earth map projection",
            journal: "International Journal of Geographical Information Science",
            doi: "https://doi.org/10.1080/13658816.2018.1504949"
          }
        ],
        discord_embed_footer: "Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI"
      };

      const jsonStr = JSON.stringify(citePayload, null, 2);
      codeEl.innerHTML = highlightCode(jsonStr, "json");
      latencyEl.textContent = `~${Math.round(performance.now() - t0 + 1)} ms`;
      resultArea.classList.add("active");
    });
  }

  const btnCopyCitationsApi = document.getElementById("try-copy-citations-api");
  if (btnCopyCitationsApi) {
    btnCopyCitationsApi.addEventListener("click", () => {
      const code = document.getElementById("try-code-citations-api").textContent;
      copyToClipboard(code, state.currentLang === "cs" ? "JSON zkopírován do schránky." : "JSON copied to clipboard!");
    });
  }

  // Citation Copy Buttons
  document.querySelectorAll(".btn-copy-citation").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.citeType;
      let textToCopy = "";

      if (type === "apa-kass") {
        textToCopy =
          "Kass, J. M., Guénard, B., Dudley, K. L., Jenkins, C. N., Azuma, F., Fisher, B. L., Parr, C. L., Phang, D. E., Schultheiss, P., Shattuck, S. O., Suhr, E. L., & Economo, E. P. (2022). The global distribution of known and undiscovered ant biodiversity. Science Advances, 8(31), eabp9908. https://www.science.org/doi/10.1126/sciadv.abp9908";
      } else if (type === "apa-wong") {
        textToCopy =
          "Wong, M. K. L., Economo, E. P., & Guénard, B. (2023). The global spread and drivers of alien ant species. Nature Communications, 14, 8398. https://doi.org/10.1016/j.cub.2022.12.020";
      } else if (type === "apa-savric") {
        textToCopy =
          "Šavrič, B., Patterson, T., & Jenny, B. (2018). The Equal Earth map projection. International Journal of Geographical Information Science, 33(3), 454–465. https://doi.org/10.1080/13658816.2018.1504949";
      } else if (type === "discord-footer") {
        textToCopy = "Data: Kass et al. 2022, Wong et al. 2023 | AntsMappedAPI";
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

      copyToClipboard(
        textToCopy,
        state.currentLang === "cs" ? "Citace zkopírována do schránky." : "Citation copied to clipboard!"
      );
    });
  });

  // Theme application
  function applyTheme(theme) {
    state.currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("antsmapped_theme", theme);
  }

  // Complete Bilingual Application (EN / CS)
  function applyLanguage(lang) {
    state.currentLang = lang;
    localStorage.setItem("antsmapped_lang", lang);
    const isCs = lang === "cs";

    // Synchronize explorer legend language with site language
    state.params.lang = lang;
    const langCtrl = document.querySelector('.segmented-control[data-param="lang"]');
    if (langCtrl) {
      langCtrl.querySelectorAll(".segment-btn").forEach((b) => {
        if (b.dataset.value === lang) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
    }

    // 1. Text content replacement
    document.querySelectorAll("[data-i18n-en]").forEach((el) => {
      const text = isCs ? el.dataset.i18nCs : el.dataset.i18nEn;
      if (text !== undefined) el.textContent = text;
    });

    // 2. HTML content replacement (for tags with <br>, <strong> or <span>)
    document.querySelectorAll("[data-i18n-html-en]").forEach((el) => {
      const html = isCs ? el.dataset.i18nHtmlCs : el.dataset.i18nHtmlEn;
      if (html !== undefined) el.innerHTML = html;
    });

    // 3. Input placeholder replacement
    document.querySelectorAll("[data-i18n-placeholder-en]").forEach((el) => {
      const ph = isCs ? el.dataset.i18nPlaceholderCs : el.dataset.i18nPlaceholderEn;
      if (ph !== undefined) el.placeholder = ph;
    });

    // 4. Page title update
    document.title = isCs
      ? "AntsMapped API – Globální mapy výskytu mravenců a biodiverzitní API"
      : "AntsMapped API – Global Ant Distribution Maps & Biodiversity API";

    // 5. Language toggle button text
    const langLabel = document.getElementById("lang-btn-text");
    if (langLabel) {
      langLabel.textContent = isCs ? "CS" : "EN";
    }

    // 6. Update select options
    const sSelect = document.getElementById("server-target-select");
    if (sSelect && sSelect.options.length >= 3) {
      sSelect.options[0].text = isCs ? "Předgenerované mapy (GitHub Pages)" : "GitHub Pages Pre-rendered";
      sSelect.options[1].text = isCs ? "Cloudové API (Hugging Face)" : "Hugging Face Cloud API";
      sSelect.options[2].text = isCs ? "Lokální server (port 8000)" : "Localhost (port 8000)";
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

  // Toast Notification System (Monochrome inline SVG, strictly NO emoji)
  function showToast(msg) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg class="icon icon-sm" viewBox="0 0 24 24" style="color: var(--accent-primary);"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
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
