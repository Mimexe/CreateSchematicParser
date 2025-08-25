/**
 * NBT Parser for Minecraft Create Mod Schematics
 * Supports reading and parsing NBT (Named Binary Tag) format files
 */

class NBTParser {
  constructor() {
    this.offset = 0;
    this.data = null;
    this.maxDepth = 100; // Prevent infinite recursion
    this.currentDepth = 0;
    this.supportInfo = this.checkSupport();
    this.progressCallback = null;
    this.totalBytes = 0;
  }

  checkSupport() {
    const support = {
      arrayBuffer: typeof ArrayBuffer !== "undefined",
      uint8Array: typeof Uint8Array !== "undefined",
      textDecoder: typeof TextDecoder !== "undefined",
      float32Array: typeof Float32Array !== "undefined",
      float64Array: typeof Float64Array !== "undefined",
      dataView: typeof DataView !== "undefined",
    };

    const missing = Object.keys(support).filter((key) => !support[key]);
    support.isSupported = missing.length === 0;
    support.missing = missing;

    if (!support.isSupported) {
      console.error("[NBT Parser] Missing browser features:", missing);
    }

    return support;
  }

  /**
   * Parse NBT data from ArrayBuffer
   * @param {ArrayBuffer} buffer - The NBT file data
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Parsed NBT data
   */
  async parse(buffer, progressCallback = null) {
    console.log("[NBT Parser] Starting parse, buffer size:", buffer.byteLength);

    // Set up progress tracking
    this.progressCallback = progressCallback;
    this.totalBytes = buffer.byteLength;
    this.operationCount = 0;
    this.yieldThreshold = 1000; // Yield control after this many operations
    this.updateProgress("Initializing parser...", 0);

    // Check browser support
    if (!this.supportInfo.isSupported) {
      throw new Error(
        `Browser missing required features: ${this.supportInfo.missing.join(
          ", "
        )}`
      );
    }

    // Validate input
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Empty or invalid buffer provided");
    }

    if (buffer.byteLength > 100 * 1024 * 1024) {
      // 100MB limit
      console.warn(
        "[NBT Parser] Very large file detected:",
        buffer.byteLength,
        "bytes"
      );
    }

    this.data = new Uint8Array(buffer);
    this.offset = 0;
    this.currentDepth = 0;

    try {
      // Check if file is gzipped (common for NBT files)
      this.updateProgress("Analyzing file format...", 5);
      console.log(
        "[NBT Parser] First 10 bytes:",
        Array.from(this.data.slice(0, 10))
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(" ")
      );

      if (this.isGzipped()) {
        console.log("[NBT Parser] File is gzipped, decompressing...");
        this.updateProgress("Decompressing file...", 10);
        const originalSize = this.data.length;
        this.data = this.decompress(this.data);
        console.log(
          "[NBT Parser] Decompressed from",
          originalSize,
          "to",
          this.data.length,
          "bytes"
        );
        this.offset = 0;
        this.updateProgress("Decompression complete", 25);
      } else {
        console.log("[NBT Parser] File is not gzipped");
        this.updateProgress("File format verified", 15);
      }

      console.log("[NBT Parser] Reading root tag...");
      this.updateProgress("Parsing NBT structure...", 30);
      const result = await this.readTagAsync();
      this.updateProgress("Parse completed successfully", 100);
      console.log("[NBT Parser] Parse completed successfully");
      return result;
    } catch (error) {
      console.error("[NBT Parser] Error parsing NBT:", error);
      console.error("[NBT Parser] Error at offset:", this.offset);
      console.error(
        "[NBT Parser] Data around error:",
        Array.from(
          this.data.slice(Math.max(0, this.offset - 5), this.offset + 5)
        )
          .map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(" ")
      );
      throw new Error("Failed to parse NBT file: " + error.message);
    }
  }

  /**
   * Update progress and call callback if provided
   */
  updateProgress(status, percentage) {
    if (this.progressCallback) {
      this.progressCallback(status, percentage);
    }
  }

  /**
   * Check if data is gzipped
   */
  isGzipped() {
    return (
      this.data.length >= 2 && this.data[0] === 0x1f && this.data[1] === 0x8b
    );
  }

  /**
   * Decompress gzipped data using pako library
   */
  decompress(data) {
    console.log("[NBT Parser] decompress() called, data length:", data.length);
    if (this.isGzipped()) {
      console.log(
        "[NBT Parser] Confirming gzip magic bytes:",
        "0x" + data[0].toString(16),
        "0x" + data[1].toString(16)
      );
      if (typeof pako === "undefined") {
        console.error("[NBT Parser] Pako library not found");
        throw new Error(
          "Pako library is required for gzipped NBT files. Please ensure pako is loaded."
        );
      }
      try {
        console.log("[NBT Parser] Using pako to inflate data...");
        const result = pako.inflate(data);
        console.log(
          "[NBT Parser] Pako inflate successful, result length:",
          result.length
        );
        return result;
      } catch (error) {
        console.error("[NBT Parser] Pako inflate failed:", error);
        throw new Error(
          "Failed to decompress gzipped NBT file: " + error.message
        );
      }
    }
    console.log("[NBT Parser] No decompression needed");
    return data;
  }

  /**
   * Read a single NBT tag asynchronously
   */
  async readTagAsync() {
    console.log("[NBT Parser] readTagAsync() at offset:", this.offset);
    await this.yieldControl();

    const type = this.readByte();
    console.log("[NBT Parser] Tag type:", type);

    if (type === 0) {
      // TAG_End
      console.log("[NBT Parser] Found TAG_End");
      return null;
    }

    const name = this.readString();
    console.log("[NBT Parser] Tag name:", name);
    const payload = await this.readPayloadAsync(type);
    console.log("[NBT Parser] Tag payload read for:", name);

    return {
      type: type,
      name: name,
      value: payload,
    };
  }

  /**
   * Yield control back to the browser to prevent blocking
   */
  async yieldControl() {
    this.operationCount = (this.operationCount || 0) + 1;
    if (this.operationCount % this.yieldThreshold === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Read tag payload based on type
   */
  readPayload(type) {
    const typeNames = {
      1: "TAG_Byte",
      2: "TAG_Short",
      3: "TAG_Int",
      4: "TAG_Long",
      5: "TAG_Float",
      6: "TAG_Double",
      7: "TAG_Byte_Array",
      8: "TAG_String",
      9: "TAG_List",
      10: "TAG_Compound",
      11: "TAG_Int_Array",
      12: "TAG_Long_Array",
    };
    console.log(
      "[NBT Parser] Reading payload for",
      typeNames[type] || `Unknown(${type})`
    );

    switch (type) {
      case 1:
        return this.readByte(); // TAG_Byte
      case 2:
        return this.readShort(); // TAG_Short
      case 3:
        return this.readInt(); // TAG_Int
      case 4:
        return this.readLong(); // TAG_Long
      case 5:
        return this.readFloat(); // TAG_Float
      case 6:
        return this.readDouble(); // TAG_Double
      case 8:
        return this.readString(); // TAG_String
      default:
        throw new Error(
          `Synchronous reading not supported for tag type: ${type}. Use async version.`
        );
    }
  }

  /**
   * Read tag payload based on type asynchronously
   */
  async readPayloadAsync(type) {
    const typeNames = {
      1: "TAG_Byte",
      2: "TAG_Short",
      3: "TAG_Int",
      4: "TAG_Long",
      5: "TAG_Float",
      6: "TAG_Double",
      7: "TAG_Byte_Array",
      8: "TAG_String",
      9: "TAG_List",
      10: "TAG_Compound",
      11: "TAG_Int_Array",
      12: "TAG_Long_Array",
    };
    console.log(
      "[NBT Parser] Reading payload for",
      typeNames[type] || `Unknown(${type})`
    );

    switch (type) {
      case 1:
        return this.readByte(); // TAG_Byte
      case 2:
        return this.readShort(); // TAG_Short
      case 3:
        return this.readInt(); // TAG_Int
      case 4:
        return this.readLong(); // TAG_Long
      case 5:
        return this.readFloat(); // TAG_Float
      case 6:
        return this.readDouble(); // TAG_Double
      case 7:
        return await this.readByteArrayAsync(); // TAG_Byte_Array
      case 8:
        return this.readString(); // TAG_String
      case 9:
        return await this.readListAsync(); // TAG_List
      case 10:
        return await this.readCompoundAsync(); // TAG_Compound
      case 11:
        return await this.readIntArrayAsync(); // TAG_Int_Array
      case 12:
        return await this.readLongArrayAsync(); // TAG_Long_Array
      default:
        throw new Error(`Unknown NBT tag type: ${type}`);
    }
  }

  /**
   * Read compound tag (object with named tags) asynchronously
   */
  async readCompoundAsync() {
    this.currentDepth++;
    if (this.currentDepth > this.maxDepth) {
      throw new Error(
        `Maximum recursion depth exceeded (${this.maxDepth}). Possible corrupted NBT data.`
      );
    }

    console.log("[NBT Parser] Reading compound at depth:", this.currentDepth);
    const compound = {};
    let tagCount = 0;

    while (true) {
      const tag = await this.readTagAsync();
      if (tag === null) break; // TAG_End

      compound[tag.name] = tag.value;
      tagCount++;

      // Update progress periodically for large compounds
      if (tagCount % 50 === 0 && this.progressCallback) {
        const progressPercentage =
          30 + Math.min(40, (this.offset / this.data.length) * 40);
        this.updateProgress(
          `Processing compound data... (${tagCount} tags)`,
          progressPercentage
        );
        // Yield control every 50 tags to prevent blocking
        await this.yieldControl();
      }

      if (tagCount > 10000) {
        // Sanity check
        console.warn("[NBT Parser] Very large compound with", tagCount, "tags");
      }
    }

    this.currentDepth--;
    console.log("[NBT Parser] Compound read with", tagCount, "tags");
    return compound;
  }

  /**
   * Read list tag (array of same-type tags) asynchronously
   */
  async readListAsync() {
    this.currentDepth++;
    if (this.currentDepth > this.maxDepth) {
      throw new Error(
        `Maximum recursion depth exceeded (${this.maxDepth}). Possible corrupted NBT data.`
      );
    }

    const type = this.readByte();
    const length = this.readInt();

    console.log(
      "[NBT Parser] Reading list at depth:",
      this.currentDepth,
      "type:",
      type,
      "length:",
      length
    );

    if (length < 0) {
      throw new Error(`Invalid list length: ${length}`);
    }

    if (length > 1000000) {
      // 1M items limit
      console.warn("[NBT Parser] Very large list detected:", length, "items");
    }

    const list = [];

    for (let i = 0; i < length; i++) {
      // For complex types, use async reading
      if (type === 9 || type === 10) {
        // LIST or COMPOUND
        list.push(await this.readPayloadAsync(type));
      } else {
        list.push(this.readPayload(type));
      }

      // Update progress and yield control for large lists
      if (i % 500 === 0 && i > 0 && this.progressCallback) {
        const progressPercentage =
          30 + Math.min(40, (this.offset / this.data.length) * 40);
        this.updateProgress(
          `Processing list data... (${i}/${length} items)`,
          progressPercentage
        );
        // Yield control every 500 items to prevent blocking
        await this.yieldControl();
      }

      if (i % 10000 === 0 && i > 0) {
        console.log("[NBT Parser] List progress:", i, "/", length);
      }
    }

    this.currentDepth--;
    return list;
  }

  /**
   * Basic data type readers
   */
  readByte() {
    if (this.offset >= this.data.length) {
      console.error(
        "[NBT Parser] readByte() - Unexpected end of data at offset:",
        this.offset,
        "data length:",
        this.data.length
      );
      throw new Error("Unexpected end of data");
    }
    const value = this.data[this.offset++];
    if (window.verboseDebug) {
      console.log(
        "[NBT Parser] readByte() at offset",
        this.offset - 1,
        ":",
        "0x" + value.toString(16).padStart(2, "0")
      );
    }
    return value;
  }

  readShort() {
    const value = (this.data[this.offset] << 8) | this.data[this.offset + 1];
    this.offset += 2;
    return value;
  }

  readInt() {
    const value =
      (this.data[this.offset] << 24) |
      (this.data[this.offset + 1] << 16) |
      (this.data[this.offset + 2] << 8) |
      this.data[this.offset + 3];
    this.offset += 4;
    return value;
  }

  readLong() {
    // JavaScript doesn't have native 64-bit integers, so we'll read as two 32-bit values
    const high = this.readInt();
    const low = this.readInt();
    return high * 0x100000000 + low; // This may lose precision for very large numbers
  }

  readFloat() {
    const bytes = new Uint8Array(4);
    bytes[3] = this.data[this.offset++];
    bytes[2] = this.data[this.offset++];
    bytes[1] = this.data[this.offset++];
    bytes[0] = this.data[this.offset++];
    return new Float32Array(bytes.buffer)[0];
  }

  readDouble() {
    const bytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
      bytes[i] = this.data[this.offset++];
    }
    return new Float64Array(bytes.buffer)[0];
  }

  readString() {
    const length = this.readShort();
    if (length > 1024) {
      // Sanity check for very long strings
      console.warn(
        "[NBT Parser] Very long string detected:",
        length,
        "characters"
      );
    }
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    const result = new TextDecoder("utf-8").decode(bytes);
    if (window.verboseDebug) {
      console.log(
        "[NBT Parser] readString():",
        result.length > 50 ? result.substring(0, 50) + "..." : result
      );
    }
    return result;
  }

  async readByteArrayAsync() {
    const length = this.readInt();

    if (length < 0) {
      throw new Error(`Invalid byte array length: ${length}`);
    }

    if (length > 50 * 1024 * 1024) {
      // 50MB limit for byte arrays
      throw new Error(`Byte array too large: ${length} bytes`);
    }

    if (this.offset + length > this.data.length) {
      throw new Error(
        `Byte array extends beyond data bounds: need ${length} bytes, have ${
          this.data.length - this.offset
        }`
      );
    }

    console.log("[NBT Parser] Reading byte array of length:", length);

    // For very large byte arrays, yield control during processing
    if (length > 1024 * 1024) {
      // 1MB
      await this.yieldControl();
    }

    const array = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return Array.from(array);
  }

  async readIntArrayAsync() {
    const length = this.readInt();

    if (length < 0) {
      throw new Error(`Invalid int array length: ${length}`);
    }

    if (length > 10 * 1024 * 1024) {
      // 10M integers limit
      console.warn("[NBT Parser] Very large int array:", length, "elements");
    }

    console.log("[NBT Parser] Reading int array of length:", length);
    const array = [];
    for (let i = 0; i < length; i++) {
      array.push(this.readInt());

      // Yield control every 10000 elements to prevent blocking
      if (i % 10000 === 0 && i > 0) {
        console.log("[NBT Parser] Int array progress:", i, "/", length);
        if (this.progressCallback) {
          const progressPercentage =
            30 + Math.min(40, (this.offset / this.data.length) * 40);
          this.updateProgress(
            `Processing int array... (${i}/${length} elements)`,
            progressPercentage
          );
        }
        await this.yieldControl();
      }
    }
    return array;
  }

  async readLongArrayAsync() {
    const length = this.readInt();

    if (length < 0) {
      throw new Error(`Invalid long array length: ${length}`);
    }

    if (length > 1 * 1024 * 1024) {
      // 1M longs limit
      console.warn("[NBT Parser] Very large long array:", length, "elements");
    }

    console.log("[NBT Parser] Reading long array of length:", length);
    const array = [];
    for (let i = 0; i < length; i++) {
      array.push(this.readLong());

      // Yield control every 5000 elements to prevent blocking (longs are slower)
      if (i % 5000 === 0 && i > 0) {
        console.log("[NBT Parser] Long array progress:", i, "/", length);
        if (this.progressCallback) {
          const progressPercentage =
            30 + Math.min(40, (this.offset / this.data.length) * 40);
          this.updateProgress(
            `Processing long array... (${i}/${length} elements)`,
            progressPercentage
          );
        }
        await this.yieldControl();
      }
    }
    return array;
  }
}

/**
 * Create Mod Schematic Parser
 * Specialized parser for Create mod schematic files
 */
class CreateSchematicParser {
  constructor() {
    this.nbtParser = new NBTParser();
  }

  /**
   * Parse a Create mod schematic file
   * @param {ArrayBuffer} buffer - The schematic file data
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Object>} Parsed schematic data with blocks
   */
  async parseSchematic(buffer, progressCallback = null) {
    console.log("[Schematic Parser] Starting schematic parse...");

    // Wrap the progress callback to add schematic-specific steps
    const wrappedCallback = progressCallback
      ? (status, percentage) => {
          // NBT parsing takes 70% of the process, schematic processing takes 30%
          const adjustedPercentage = Math.min(70, percentage * 0.7);
          progressCallback(status, adjustedPercentage);
        }
      : null;

    const nbtData = await this.nbtParser.parse(buffer, wrappedCallback);

    if (progressCallback) {
      progressCallback("Processing schematic data...", 75);
    }

    if (!nbtData || !nbtData.value) {
      console.error("[Schematic Parser] Invalid NBT structure:", nbtData);
      throw new Error("Invalid NBT structure");
    }

    console.log("[Schematic Parser] NBT Data:", nbtData);
    const schematicData = nbtData.value;
    console.log("[Schematic Parser] Schematic data:", schematicData);

    if (progressCallback) {
      progressCallback("Extracting block information...", 85);
    }

    const mods = [];
    const blockCounts = {};
    const blocks = [];

    // Process palette to get block types and extract mods
    for (const value of schematicData.palette) {
      console.log("[Schematic Parser] Processing palette value:", value);
      if (!value.Name) {
        console.log("[Schematic Parser] Skipping value without Name:", value);
        continue;
      }

      const blockName = value.Name;
      const namev = blockName.split(":")[0];

      // Initialize block count
      blockCounts[blockName] = 0;

      if (namev === "minecraft") {
        console.log(
          "[Schematic Parser] Skipping Minecraft default block:",
          namev
        );
        continue;
      }
      const name = getModName(namev);
      console.log("[Schematic Parser] Extracted mod name:", name);
      if (mods.includes(name)) {
        console.log("[Schematic Parser] Mod already added:", name);
        continue;
      }
      mods.push(name);
      console.log("[Schematic Parser] Added mod to list:", name);
    }

    // Count blocks from the blocks array
    if (schematicData.blocks && Array.isArray(schematicData.blocks)) {
      for (const block of schematicData.blocks) {
        if (block && typeof block.state !== "undefined") {
          const paletteIndex = block.state;
          if (paletteIndex < schematicData.palette.length) {
            const paletteEntry = schematicData.palette[paletteIndex];
            if (paletteEntry && paletteEntry.Name) {
              const blockName = paletteEntry.Name;
              blockCounts[blockName] = (blockCounts[blockName] || 0) + 1;
            }
          }
        }
      }
    }

    // Convert block counts to blocks array for the UI
    for (const [blockName, count] of Object.entries(blockCounts)) {
      if (count > 0) {
        blocks.push({
          name: blockName,
          count: count,
        });
      }
    }

    if (
      "Railways_DataVersion" in schematicData &&
      !mods.includes("Create: Steam 'n' Rails")
    ) {
      mods.push(
        "Create: Steam 'n' Rails (may not be needed, it means that the schematic was created with it)"
      );
    }

    const schematic = {
      version: getVersionName(schematicData.DataVersion),
      totalBlocks: schematicData.blocks.length,
      width: schematicData.size[0],
      height: schematicData.size[1],
      length: schematicData.size[2],
      mods,
      blocks,
    };

    if (progressCallback) {
      progressCallback("Finalizing schematic data...", 95);
    }

    console.log("[Schematic Parser] Final schematic:", schematic);

    if (progressCallback) {
      progressCallback("Schematic parsing complete", 100);
    }

    return schematic;
  }
}

// Export for use in main script
if (typeof module !== "undefined" && module.exports) {
  module.exports = { NBTParser, CreateSchematicParser };
}
