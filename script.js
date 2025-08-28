class SchematicViewer {
  constructor() {
    this.parser = new CreateSchematicParser();
    this.currentSchematic = null;
    this.blockStates = {}; // Store completed states for blocks

    this.initializeEventListeners();
    this.loadLastSchematicButton();
  }

  initializeEventListeners() {
    // File upload handling
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", this.handleDragOver.bind(this));
    uploadArea.addEventListener("dragleave", this.handleDragLeave.bind(this));
    uploadArea.addEventListener("drop", this.handleFileDrop.bind(this));

    fileInput.addEventListener("change", this.handleFileSelect.bind(this));

    // Save/Load functionality
    const saveButton = document.getElementById("saveSchematic");
    const loadButton = document.getElementById("loadLastSchematic");
    const loadMainButton = document.getElementById("loadLastSchematicMain");
    const loadSchemButton = document.getElementById("loadSchematicMain");
    const autoLoadCheckbox = document.getElementById("autoLoad");

    if (saveButton) {
      saveButton.addEventListener("click", this.saveSchematic.bind(this));
    }
    if (loadButton) {
      loadButton.addEventListener("click", this.loadSchematic.bind(this));
    }
    if (loadMainButton) {
      loadMainButton.addEventListener("click", () => this.loadSchematic());
    }
    if (loadSchemButton) {
      loadSchemButton.addEventListener("click", (e) => {
        e.preventDefault();
        const data = prompt("Paste your schematic savedata here:");
        this.loadSchematic(data);
      });
    }
    if (autoLoadCheckbox) {
      autoLoadCheckbox.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        localStorage.setItem("autoLoad", isChecked);
      });
    }
  }

  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
  }

  handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.processFile(files[0]);
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  async processFile(file) {
    if (!file.name.endsWith(".nbt")) {
      this.showError("Please select a valid .nbt file");
      return;
    }

    try {
      this.showProgress();

      const arrayBuffer = await file.arrayBuffer();

      // Create progress callback
      const progressCallback = (status, percentage) => {
        this.updateProgress(status, percentage);
      };

      this.currentSchematic = await this.parser.parseSchematic(
        arrayBuffer,
        progressCallback
      );

      // Store the filename for saving
      this.currentSchematic.fileName = file.name;

      this.updateProgress("Displaying results...", 100);

      // Display results
      setTimeout(() => {
        this.showResults();
      }, 500);
    } catch (error) {
      console.error("Error processing file:", error);

      let errorMessage = "Error parsing schematic: " + error.message;

      // Provide more specific error messages for common issues
      if (error.message.includes("Pako library")) {
        errorMessage =
          "Failed to load decompression library. Please refresh the page and try again.";
      } else if (error.message.includes("Gzipped NBT files")) {
        errorMessage =
          "This appears to be a compressed NBT file, but the decompression library failed to load.";
      } else if (error.message.includes("Invalid NBT structure")) {
        errorMessage =
          "The file doesn't appear to be a valid NBT schematic file.";
      } else if (error.message.includes("Unexpected end of data")) {
        errorMessage = "The NBT file appears to be corrupted or incomplete.";
      }

      this.showError(errorMessage);
    } finally {
      this.hideProgress();
    }
  }

  showProgress() {
    const uploadArea = document.getElementById("uploadArea");
    const progressContainer = document.getElementById("progressContainer");

    uploadArea.style.display = "none";
    progressContainer.style.display = "block";

    this.updateProgress("Initializing...", 0);
  }

  updateProgress(status, percentage) {
    const progressTitle = document.getElementById("progressTitle");
    const progressStatus = document.getElementById("progressStatus");
    const progressFill = document.getElementById("progressFill");
    const progressPercentage = document.getElementById("progressPercentage");

    progressTitle.textContent = "Processing schematic...";
    progressStatus.textContent = status;
    progressFill.style.width = `${percentage}%`;
    progressPercentage.textContent = `${Math.round(percentage)}%`;
  }

  hideProgress(showUploadArea = true) {
    const uploadArea = document.getElementById("uploadArea");
    const progressContainer = document.getElementById("progressContainer");

    progressContainer.style.display = "none";

    if (showUploadArea) {
      uploadArea.style.display = "block";
      // Reset upload area content
      this.resetUploadArea();
    } else {
      uploadArea.style.display = "none";
    }
  }

  resetUploadArea() {
    const uploadContent = document.querySelector(".upload-content");
    uploadContent.innerHTML = `
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <h3>Drop your .nbt file here</h3>
            <p>or click to browse</p>
        `;
  }

  showResults() {
    // Hide progress and upload area
    this.hideProgress(false);

    // Show results section
    const resultsSection = document.getElementById("results");
    resultsSection.style.display = "block";

    // Show save/load buttons
    const saveButton = document.getElementById("saveSchematic");
    const loadButton = document.getElementById("loadLastSchematic");
    if (saveButton) saveButton.style.display = "inline-block";
    if (loadButton && localStorage.getItem("lastSchematic")) {
      loadButton.style.display = "inline-block";
    }

    // Populate results with schematic data
    const schematic = this.currentSchematic;
    document.getElementById("minecraftVersion").textContent = schematic.version;
    document.getElementById("totalBlocks").textContent = schematic.totalBlocks;
    document.getElementById(
      "schematicSize"
    ).textContent = `${schematic.width} × ${schematic.height} × ${schematic.length}`;
    document.getElementById("modsList").innerHTML =
      schematic.mods.length > 0
        ? schematic.mods.map((mod) => `<li>${mod}</li>`).join("")
        : "<li>No mods detected</li>";

    // Populate blocks list with new layout
    this.populateBlocksList(schematic.blocks || []);
  }

  populateBlocksList(blocks) {
    const blocksList = document.getElementById("blocksList");

    if (!blocks || blocks.length === 0) {
      blocksList.innerHTML =
        '<div class="block-item-placeholder">No blocks detected</div>';
      return;
    }

    // Sort blocks by count (descending)
    const sortedBlocks = blocks.sort((a, b) => b.count - a.count);

    // Generate HTML for blocks with checkboxes
    const blocksHTML = sortedBlocks
      .map(({ name, count }, index) => {
        const blockId = `block-${index}`;
        const isCompleted = this.blockStates[name] || false;
        const completedClass = isCompleted ? " completed" : "";

        return `
      <div class="block-item${completedClass}" data-block-name="${name}">
        <input type="checkbox" class="block-checkbox" id="${blockId}" ${
          isCompleted ? "checked" : ""
        }>
        <div class="block-image-placeholder"></div>
        <div class="block-info">
          <div class="block-name">${this.formatBlockName(name)}</div>
          <div class="block-mod">${getModName(name.split(":")[0])}</div>
        </div>
        <div class="block-count-container">
          <div class="block-count">x${count}</div>
        </div>
      </div>
    `;
      })
      .join("");

    blocksList.innerHTML = `<div class="blocks-container">${blocksHTML}</div>`;

    // Add event listeners for checkboxes
    const checkboxes = blocksList.querySelectorAll(".block-checkbox");
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", this.handleBlockToggle.bind(this));
    });
  }

  formatBlockName(name) {
    // Convert minecraft:stone_bricks to "Stone Bricks"
    if (name.includes(":")) {
      name = name.split(":")[1];
    }
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  handleBlockToggle(event) {
    const checkbox = event.target;
    const blockItem = checkbox.closest(".block-item");
    const blockName = blockItem.dataset.blockName;

    // Update the visual state
    if (checkbox.checked) {
      blockItem.classList.add("completed");
    } else {
      blockItem.classList.remove("completed");
    }

    // Update the internal state
    this.blockStates[blockName] = checkbox.checked;

    // Auto-save the complete schematic data with updated block states
    this.autoSaveSchematic();
  }

  saveSchematic() {
    if (!this.currentSchematic) {
      alert("No schematic data to save");
      return;
    }

    const saveData = {
      schematic: this.currentSchematic,
      blockStates: this.blockStates,
      savedAt: new Date().toISOString(),
      fileName: this.currentSchematic.fileName || "Unknown",
    };

    try {
      localStorage.setItem("lastSchematic", btoa(JSON.stringify(saveData)));

      // Show success feedback
      const saveButton = document.getElementById("saveSchematic");
      const originalText = saveButton.innerHTML;
      saveButton.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        Saved!
      `;
      saveButton.style.background = "#10b981";

      setTimeout(() => {
        saveButton.innerHTML = originalText;
        saveButton.style.background = "";
      }, 2000);

      this.loadLastSchematicButton();
      navigator.clipboard.writeText(btoa(JSON.stringify(saveData)));
      alert("Schematic savedata saved to clipboard");
    } catch (error) {
      console.error("Failed to save schematic:", error);
      alert("Failed to save schematic data");
    }
  }

  autoSaveSchematic() {
    // Auto-save without user feedback for block state changes
    if (!this.currentSchematic) return;

    const saveData = {
      schematic: this.currentSchematic,
      blockStates: this.blockStates,
      savedAt: new Date().toISOString(),
      fileName: this.currentSchematic.fileName || "Unknown",
    };

    try {
      localStorage.setItem("lastSchematic", btoa(JSON.stringify(saveData)));
    } catch (error) {
      console.error("Failed to auto-save schematic:", error);
    }
  }

  loadSchematic(data, noAlert = false) {
    try {
      const saved = data || localStorage.getItem("lastSchematic");
      if (!saved) {
        if (!noAlert) alert("No saved schematic found");
        return;
      }

      const saveData = JSON.parse(atob(saved));
      this.currentSchematic = saveData.schematic;
      this.blockStates = saveData.blockStates || {};

      // Refresh detected mods with current mod mappings
      this.refreshDetectedMods();

      this.showResults();

      // Show when it was saved
      const loadTime = new Date(saveData.savedAt).toLocaleString();
      if (!noAlert)
        alert(`Loaded schematic "${saveData.fileName}" saved on ${loadTime}`);
    } catch (error) {
      console.error("Failed to load schematic:", error);
      alert("Failed to load saved schematic");
    }
  }

  refreshDetectedMods() {
    if (!this.currentSchematic || !this.currentSchematic.mods) {
      return;
    }

    const mods = this.currentSchematic.mods.map((mod) => getModName(mod));

    // Update the schematic's mods array with refreshed data
    this.currentSchematic.mods = mods;
  }

  loadLastSchematicButton() {
    const hasLastSchematic = localStorage.getItem("lastSchematic") !== null;
    const loadMainButton = document.getElementById("loadLastSchematicMain");
    const autoLoadCheckbox = document.getElementById("autoLoad");

    if (loadMainButton) {
      loadMainButton.style.display = hasLastSchematic ? "inline-block" : "none";
    }

    if (autoLoadCheckbox) {
      autoLoadCheckbox.checked = localStorage.getItem("autoLoad") === "true";
      const canLoad = !new URLSearchParams(window.location.search).has(
        "noload"
      );
      if (autoLoadCheckbox.checked && canLoad) {
        this.loadSchematic(undefined, true);
      }
      if (!canLoad) {
        // remove without reloading ?noload
        history.replaceState(null, "", window.location.pathname);
      }
    }
  }

  showError(message) {
    const uploadContent = document.querySelector(".upload-content");
    uploadContent.innerHTML = `
            <div style="color: #ff6b6b;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">Try Again</button>
            </div>
        `;
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Check if pako library is available
  if (typeof pako === "undefined") {
    console.warn(
      "Pako library not loaded. Gzipped NBT files will not be supported."
    );
  } else {
    console.log(
      "Pako library loaded successfully. Gzipped NBT support available."
    );
  }

  window.schematicViewer = new SchematicViewer();
});
