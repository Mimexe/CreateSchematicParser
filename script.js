/**
 * Main application script for Create Mod Schematic Parser
 */

class SchematicViewer {
  constructor() {
    this.parser = new CreateSchematicParser();
    this.currentSchematic = null;

    this.initializeEventListeners();
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
