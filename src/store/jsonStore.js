import fs from "node:fs/promises";
import path from "node:path";

const EMPTY_STORE = { enquiries: [] };

export class JsonStore {
  writeQueue = Promise.resolve();
  lastReadError = null;
  lastCorruptionPath = null;

  constructor(filePath, logger) {
    this.filePath = filePath;
    this.logger = logger;
  }

  async ensureReady() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeData(EMPTY_STORE);
    }
  }

  async get(token) {
    const data = await this.readData();
    return data.enquiries.find((entry) => entry.token === token) ?? null;
  }

  async findByBydaEnquiryId(enquiryId) {
    const data = await this.readData();
    return data.enquiries.find((entry) => entry.bydaEnquiryId === enquiryId) ?? null;
  }

  async count() {
    const data = await this.readData();
    return data.enquiries.length;
  }

  async list({ limit, sort = "desc" } = {}) {
    const data = await this.readData();
    const sorted = [...data.enquiries].sort((left, right) => {
      const leftTime = Number.isFinite(Date.parse(left.createdAt ?? ""))
        ? Date.parse(left.createdAt)
        : 0;
      const rightTime = Number.isFinite(Date.parse(right.createdAt ?? ""))
        ? Date.parse(right.createdAt)
        : 0;
      return sort === "asc" ? leftTime - rightTime : rightTime - leftTime;
    });

    if (limit === undefined) {
      return sorted;
    }

    return sorted.slice(0, limit);
  }

  async listPending() {
    const data = await this.readData();
    return data.enquiries.filter((entry) => entry.status !== "ready" && entry.status !== "failed");
  }

  async create(record) {
    await this.withWriteLock(async () => {
      const data = await this.readData();
      data.enquiries.push(record);
      await this.writeData(data);
    });
  }

  async update(token, updater) {
    return this.withWriteLock(async () => {
      const data = await this.readData();
      const index = data.enquiries.findIndex((entry) => entry.token === token);

      if (index === -1) {
        return null;
      }

      data.enquiries[index] = updater(data.enquiries[index]);
      await this.writeData(data);
      return data.enquiries[index];
    });
  }

  async readData() {
    await this.ensureReady();
    const content = await fs.readFile(this.filePath, "utf8");

    try {
      const parsed = JSON.parse(content);
      this.lastReadError = null;

      if (!parsed || !Array.isArray(parsed.enquiries)) {
        return { enquiries: [] };
      }

      return parsed;
    } catch (error) {
      const corruptionPath = `${this.filePath}.corrupt-${Date.now()}`;
      this.lastReadError = error instanceof Error ? error.message : String(error);
      this.lastCorruptionPath = corruptionPath;

      this.logger?.error("Store file was not valid JSON. Resetting store.", {
        filePath: this.filePath,
        corruptionPath,
        error,
      });

      try {
        await fs.rename(this.filePath, corruptionPath);
      } catch (renameError) {
        this.logger?.warn("Could not rotate corrupt store file.", {
          filePath: this.filePath,
          corruptionPath,
          error: renameError,
        });
      }

      await this.writeData(EMPTY_STORE);
      return { enquiries: [] };
    }
  }

  async writeData(data) {
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
    try {
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.copyFile(tempPath, this.filePath);
      await fs.rm(tempPath, { force: true });
      this.logger?.warn("Store rename fallback used after temp write.", {
        filePath: this.filePath,
        error,
      });
    }
  }

  async withWriteLock(work) {
    const run = this.writeQueue.then(work, work);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getStats() {
    await this.ensureReady();
    const data = await this.readData();
    const fileStats = await fs.stat(this.filePath).catch(() => null);

    return {
      filePath: this.filePath,
      enquiryCount: data.enquiries.length,
      sizeBytes: fileStats?.size ?? 0,
      lastReadError: this.lastReadError,
      lastCorruptionPath: this.lastCorruptionPath,
    };
  }
}
