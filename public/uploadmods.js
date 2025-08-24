async function getFileFromJar(jarFileArrayBuffer, filePath) {
  try {
    const zip = await JSZip.loadAsync(jarFileArrayBuffer);
    const file = zip.file(filePath);
    if (file) {
      return await file.async("string");
    } else {
      return null;
    }
  } catch (error) {
    console.error("Erreur JSZip:", error);
    return null;
  }
}

function parseModsToml(content) {
  const mods = [];
  let current = null;
  let insideMods = false;

  content.split(/\r?\n/).forEach((line) => {
    // supprime les commentaires
    const cleaned = line.split("#")[0].trim();
    if (!cleaned) return;

    if (cleaned.startsWith("[[mods]]")) {
      if (current) mods.push(current);
      current = {};
      insideMods = true;
    } else if (cleaned.startsWith("[[")) {
      // un autre bloc → si on était dans mods, on push
      if (insideMods && current) mods.push(current);
      current = null;
      insideMods = false;
    } else if (insideMods && cleaned.includes("=")) {
      const [key, rawValue] = cleaned.split("=", 2);
      const value = rawValue.trim().replace(/^"|"$/g, "");
      current[key.trim()] = value;
    }
  });

  if (insideMods && current) mods.push(current);
  return mods;
}

document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("uploadForm");
  const resultDiv = document.getElementById("result");

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const modFile = document.getElementById("modFile");
    resultDiv.innerHTML = "";

    if (modFile.files.length > 0) {
      for (const file of modFile.files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const arrayBuffer = e.target.result;
          const modsToml = await getFileFromJar(
            arrayBuffer,
            "META-INF/mods.toml"
          );

          if (modsToml) {
            const mods = parseModsToml(modsToml);
            const modArray = {};
            mods.forEach((mod) => {
              const div = document.createElement("div");
              div.textContent = `${file.name}: ${mod.modId} → ${mod.displayName}`;
              modArray[mod.modId] = mod.displayName;
              resultDiv.appendChild(div);
            });
            // merge modArray and MOD_NAME_MAP
            for (const key in modArray) {
              MOD_NAME_MAP[key] = modArray[key];
            }
            console.log("Merged MOD_NAME_MAP:", MOD_NAME_MAP);
            document.getElementById("debug").textContent = JSON.stringify(
              MOD_NAME_MAP,
              null,
              2
            );
          } else {
            console.error("mods.toml not found in", file.name);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    }
  });
});
